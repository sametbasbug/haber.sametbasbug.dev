from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
import json
import os
from pathlib import Path

import typer

from news_pipeline.config.loader import load_yaml
from news_pipeline.dedupe.similarity import are_probably_duplicates, are_probably_related
from news_pipeline.editorial.autonomy import has_withdrawn_flag
from news_pipeline.editorial.filtering import should_keep_article
from news_pipeline.editorial.merge import merge_related_note, merge_supporting_source
from news_pipeline.editorial.rewrite import build_rewrite
from news_pipeline.editorial.scoring import score_article
from news_pipeline.editorial.source_priority import rebalance_sources
from news_pipeline.models.article import NormalizedArticle, RawArticle
from news_pipeline.models.queue import DraftSource
from news_pipeline.models.source import SourceConfig
from news_pipeline.normalize.cleaner import ArticleNormalizer
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore
from news_pipeline.utils.logging import get_logger


MAX_PROCESS_SOURCE_AGE_HOURS = 72
DEFAULT_PURGE_STALE_RAW_HOURS = 96


def _verbose_enabled(value: bool) -> bool:
    if value:
        return True
    return os.environ.get("NEWS_PIPELINE_VERBOSE", "0") in {"1", "true", "TRUE", "yes", "YES"}


def _effective_source_time(published_at: datetime | None, fallback: datetime) -> datetime:
    return (published_at or fallback).astimezone(UTC)


def _purge_stale_raw(raw_root: Path, now: datetime, older_than_hours: int) -> int:
    if older_than_hours <= 0:
        return 0
    purged = 0
    cutoff = now - timedelta(hours=older_than_hours)
    for path in raw_root.glob("*.json"):
        try:
            raw = RawArticle.model_validate(json.loads(path.read_text(encoding="utf-8")))
            source_time = _effective_source_time(raw.published_at, raw.fetched_at)
        except Exception:
            continue
        if source_time < cutoff:
            path.unlink(missing_ok=True)
            purged += 1
    return purged


def process_command(
    config_path: str = "news_pipeline/news_pipeline/config/sources.yaml",
    verbose: bool = typer.Option(False, "--verbose", help="Print per-item process diagnostics."),
    reprocess_all: bool = typer.Option(False, "--reprocess-all", help="Re-score/rewrite unchanged queue items too."),
    purge_stale_raw_hours: int = typer.Option(DEFAULT_PURGE_STALE_RAW_HOURS, "--purge-stale-raw-hours", help="Delete raw items too old to publish before processing; 0 disables."),
) -> None:
    logger = get_logger()
    root = Path.cwd()
    raw_root = root / "news_pipeline/data/raw"
    now = datetime.now(UTC)
    purged_stale_raw = _purge_stale_raw(raw_root, now, purge_stale_raw_hours)
    raw_store = JsonStore(raw_root, RawArticle)
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    queue_service = QueueService(root / "news_pipeline/data/queue")
    normalizer = ArticleNormalizer()
    verbose_logs = _verbose_enabled(verbose)

    config = load_yaml(root / config_path)
    sources = {item["id"]: SourceConfig.model_validate(item) for item in config.get("sources", [])}
    queue_items = queue_service.list_items()
    queue_by_normalized_id = {item.normalized_id: item for item in queue_items}

    kept: list[NormalizedArticle] = [
        article
        for article in normalized_store.list_all()
        if now - _effective_source_time(article.published_at, article.created_at) <= timedelta(hours=MAX_PROCESS_SOURCE_AGE_HOURS)
    ]
    kept_ids = {article.id for article in kept}
    created = 0
    updated = 0
    rejected = 0
    skipped_missing_source = 0
    skipped_stale_raw = 0
    skipped_unchanged = 0
    skipped_duplicate = 0
    filter_skips: Counter[str] = Counter()
    related_links = 0
    supporting_merges = 0
    notes_added = 0

    for raw in raw_store.list_all():
        source = sources.get(raw.source_id)
        if source is None:
            skipped_missing_source += 1
            continue
        if now - _effective_source_time(raw.published_at, raw.fetched_at) > timedelta(hours=MAX_PROCESS_SOURCE_AGE_HOURS):
            skipped_stale_raw += 1
            continue
        normalized = normalizer.normalize(raw, source)
        existing_item = queue_by_normalized_id.get(normalized.id)
        decision = should_keep_article(normalized)
        if not decision.keep:
            reason = decision.reason or "filtered out"
            filter_skips[reason] += 1
            if verbose_logs:
                logger.info(f"filter skip: {normalized.title} ({reason})")
            if existing_item and existing_item.status != "published":
                rejected_item = queue_service.reject(existing_item.queue_id, note=reason)
                if rejected_item is not None:
                    queue_by_normalized_id[rejected_item.normalized_id] = rejected_item
                rejected += 1
            continue

        if (
            not reprocess_all
            and existing_item is not None
            and existing_item.status in {"new", "reviewing", "approved", "published"}
            and normalized_store.load(normalized.id) is not None
        ):
            skipped_unchanged += 1
            continue

        if any(existing.id != normalized.id and are_probably_duplicates(normalized, existing) for existing in kept):
            skipped_duplicate += 1
            if verbose_logs:
                logger.info(f"dedupe skip: {normalized.title}")
            continue

        normalized_store.save(normalized.id, normalized)
        rewritten_title, rewritten_description, rewritten_category, rewritten_tags, rewrite_notes, rewritten_facts = build_rewrite(normalized)

        if existing_item is None:
            item = queue_service.enqueue(normalized)
            queue_by_normalized_id[item.normalized_id] = item
            created += 1
        else:
            item = existing_item
            updated += 1

        item.cluster_key = normalized.cluster_key
        item.draft_title = rewritten_title
        item.draft_description = rewritten_description[:240]
        item.draft_category = rewritten_category
        item.draft_tags = rewritten_tags
        item.draft_facts = rewritten_facts
        item.draft_sources = [DraftSource(name=normalized.source_name, url=normalized.canonical_url)]
        item.editorial_priority = score_article(normalized)
        if item.status == "rejected" and not has_withdrawn_flag(item):
            item.status = "new"

        related_items = []
        for other in kept:
            if other.id == normalized.id:
                continue
            if are_probably_related(normalized, other):
                related_items.append(other)

        title_mates = queue_service.find_by_draft_title(rewritten_title, exclude_queue_id=item.queue_id)
        for title_mate in title_mates:
            related_normalized = normalized_store.load(title_mate.normalized_id)
            if related_normalized is not None and all(existing.id != related_normalized.id for existing in related_items):
                related_items.append(related_normalized)

        if related_items:
            item.related_queue_ids = [related.id for related in related_items[:5]]
            related_links += len(item.related_queue_ids)
            merge_related_note(item, len(related_items))
            for related in related_items[:3]:
                item = merge_supporting_source(item, related)
                supporting_merges += 1
                related_item = queue_by_normalized_id.get(related.id)
                if related_item is not None:
                    related_item.related_queue_ids = list({*related_item.related_queue_ids, normalized.id})
                    merge_related_note(related_item, len(related_item.related_queue_ids))
                    related_item = merge_supporting_source(related_item, normalized)
                    queue_service.save(related_item)
                    queue_by_normalized_id[related_item.normalized_id] = related_item

        for note in rewrite_notes:
            if note not in item.notes:
                item.notes.append(note)
                notes_added += 1
        item = rebalance_sources(item)
        queue_service.save(item)
        queue_by_normalized_id[item.normalized_id] = item
        if normalized.id not in kept_ids:
            kept.append(normalized)
            kept_ids.add(normalized.id)

    logger.info(
        "process summary: "
        f"created={created}, updated={updated}, rejected={rejected}, "
        f"stale_raw_purged={purged_stale_raw}, stale_raw_skipped={skipped_stale_raw}, unchanged_skipped={skipped_unchanged}, "
        f"dedupe_skipped={skipped_duplicate}, missing_source_skipped={skipped_missing_source}, "
        f"filter_skipped={sum(filter_skips.values())}, related_links={related_links}, "
        f"supporting_merges={supporting_merges}, notes_added={notes_added}"
    )
    if filter_skips:
        top_reasons = "; ".join(f"{reason}={count}" for reason, count in filter_skips.most_common(6))
        logger.info(f"process filter reasons: {top_reasons}")
