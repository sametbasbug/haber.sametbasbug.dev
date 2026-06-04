from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
import re
from urllib.parse import urlparse
import unicodedata

import typer
from rapidfuzz.fuzz import token_set_ratio, token_sort_ratio
from slugify import slugify

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.publish.markdown_writer import write_live
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


MAX_SOURCE_AGE_HOURS = 24
TITLE_DUPLICATE_THRESHOLD = 88
DESCRIPTION_DUPLICATE_THRESHOLD = 92
COMBINED_TOPIC_DUPLICATE_THRESHOLD = 82
SAME_SOURCE_TOPIC_DUPLICATE_THRESHOLD = 74
DISALLOWED_LOCAL_SOURCE_NAMES = {"Diken", "Kısa Dalga", "Kisa Dalga", "Medyascope"}

TOPIC_STOPWORDS = {
    "abd",
    "about",
    "after",
    "again",
    "against",
    "ama",
    "and",
    "are",
    "as",
    "at",
    "bir",
    "bu",
    "by",
    "da",
    "de",
    "dedi",
    "daha",
    "der",
    "diye",
    "for",
    "from",
    "gibi",
    "has",
    "ile",
    "in",
    "icin",
    "için",
    "karşı",
    "karsi",
    "new",
    "not",
    "olan",
    "olarak",
    "on",
    "sonra",
    "that",
    "the",
    "to",
    "ve",
    "with",
    "ya",
    "yeni",
}


def _frontmatter(text: str) -> str:
    match = re.match(r"^---\n(.*?)\n---", text, re.S)
    return match.group(1) if match else ""


def _frontmatter_value(frontmatter: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}:\s*(.*)$", frontmatter)
    if not match:
        return ""
    value = match.group(1).strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        value = value[1:-1]
    return value.strip()


def _frontmatter_source_urls(frontmatter: str) -> set[str]:
    urls: set[str] = set()
    in_sources = False
    for line in frontmatter.splitlines():
        if re.match(r"^sources:\s*$", line):
            in_sources = True
            continue
        if in_sources and line and not line.startswith((" ", "-")):
            in_sources = False
        if in_sources:
            match = re.search(r"\burl:\s*[\"']?([^\"'\s]+)", line)
            if match:
                urls.add(match.group(1).strip())
    return urls


def _source_hosts(urls: set[str]) -> set[str]:
    hosts: set[str] = set()
    for url in urls:
        host = urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        if host:
            hosts.add(host)
    return hosts


def _collapse_text(value: str) -> str:
    value = value.lower().replace("’", "'")
    value = re.sub(r"[^0-9a-zA-ZçğıöşüÇĞİÖŞÜ]+", " ", value)
    return " ".join(value.split())


def _topic_tokens(value: str) -> set[str]:
    value = value.lower().replace("ı", "i").replace("’", "'")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^0-9a-zçğıöşü]+", " ", value)
    tokens = set()
    for token in value.split():
        if len(token) < 4:
            continue
        if token in TOPIC_STOPWORDS:
            continue
        tokens.add(token)
    return tokens



def _assert_not_duplicate_topic(
    path: Path,
    existing_text: str,
    item_text: str,
    item_urls: set[str],
    existing_urls: set[str],
) -> None:
    existing_frontmatter = _frontmatter(existing_text)
    existing_topic = " ".join(
        [
            _frontmatter_value(existing_frontmatter, "title"),
            _frontmatter_value(existing_frontmatter, "description"),
            existing_text,
        ]
    )
    item_tokens = _topic_tokens(item_text)
    existing_tokens = _topic_tokens(existing_topic)
    shared_tokens = item_tokens & existing_tokens
    if len(shared_tokens) < 4:
        return

    ratio = token_set_ratio(_collapse_text(item_text), _collapse_text(existing_topic))
    same_source_host = bool(_source_hosts(item_urls) & _source_hosts(existing_urls))
    if ratio >= COMBINED_TOPIC_DUPLICATE_THRESHOLD:
        raise typer.BadParameter(f"near-duplicate live topic already published in {path.name}")
    if same_source_host and ratio >= SAME_SOURCE_TOPIC_DUPLICATE_THRESHOLD:
        raise typer.BadParameter(f"near-duplicate live topic from same source already published in {path.name}")


def _assert_not_duplicate_live(content_root: Path, item_title: str, item_description: str, item_urls: set[str], target_slug: str) -> None:
    title = _collapse_text(item_title)
    description = _collapse_text(item_description)
    item_topic_text = f"{item_title} {item_description}"
    for path in sorted(content_root.glob("*.md")):
        if path.stem == target_slug:
            raise typer.BadParameter(f"target slug already exists in Anlık Haber: {path.name}")
        text = path.read_text(encoding="utf-8", errors="ignore")
        frontmatter = _frontmatter(text)
        existing_urls = _frontmatter_source_urls(frontmatter)
        shared_urls = item_urls & existing_urls
        if shared_urls:
            raise typer.BadParameter(f"duplicate live source URL already published in {path.name}: {sorted(shared_urls)[0]}")

        existing_title = _collapse_text(_frontmatter_value(frontmatter, "title"))
        existing_description = _collapse_text(_frontmatter_value(frontmatter, "description"))
        if title and existing_title and token_sort_ratio(title, existing_title) >= TITLE_DUPLICATE_THRESHOLD:
            raise typer.BadParameter(f"near-duplicate live title already published in {path.name}")
        if description and existing_description and token_sort_ratio(description, existing_description) >= DESCRIPTION_DUPLICATE_THRESHOLD:
            raise typer.BadParameter(f"near-duplicate live description already published in {path.name}")
        _assert_not_duplicate_topic(path, text, item_topic_text, item_urls, existing_urls)


def publish_queue_item(queue_id: str, publish_dir: str = "src/content/anlikHaber", max_source_age_hours: int = MAX_SOURCE_AGE_HOURS) -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    item = service.store.load(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    if item.status == "published":
        raise typer.BadParameter(f"queue item is already published: {queue_id}")
    if item.status != "approved":
        raise typer.BadParameter(f"queue item must be approved before publish: {queue_id}")

    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    normalized = normalized_store.load(item.normalized_id)
    if max_source_age_hours > 0 and normalized:
        source_age = datetime.now(UTC) - (normalized.published_at or normalized.created_at).astimezone(UTC)
        if source_age > timedelta(hours=max_source_age_hours):
            raise typer.BadParameter(
                f"source item is too old for Anlık Haber: {source_age.total_seconds() / 3600:.1f}h > {max_source_age_hours}h"
            )

    disallowed_sources = {source.name for source in [*item.draft_sources, *item.supporting_sources]} & DISALLOWED_LOCAL_SOURCE_NAMES
    if disallowed_sources:
        raise typer.BadParameter(f"local Turkey source is no longer publishable for global Anlık Haber: {sorted(disallowed_sources)[0]}")

    content_root = root / publish_dir
    target_slug = slugify(item.draft_title, lowercase=True)
    item_urls = {str(source.url) for source in [*item.draft_sources, *item.supporting_sources]}
    _assert_not_duplicate_live(content_root, item.draft_title, item.draft_description, item_urls, target_slug)

    path = write_live(content_root, item)
    service.mark_published(queue_id, path.stem)
    print(f"published: {path}")


def publish_command(queue_id: str) -> None:
    """Deprecated direct publish entrypoint kept only as a guardrail."""
    typer.echo("DEPRECATED: news-pipeline publish is disabled", err=True)
    typer.echo("This is a low-level internal publish step. Do not use it directly.", err=True)
    typer.echo("Use production flow instead:", err=True)
    typer.echo("  news-pipeline heartbeat prepare-one --json", err=True)
    typer.echo("  news-pipeline queue polish <QUEUE_ID> ...", err=True)
    typer.echo("  news-pipeline heartbeat publish-one --execute --no-collect --json", err=True)
    raise typer.Exit(code=2)
