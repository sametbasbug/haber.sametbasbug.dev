from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha1
import json
from pathlib import Path
import re

import typer

from news_pipeline.collectors.rss import RssCollector
from news_pipeline.config.loader import load_yaml
from news_pipeline.models.article import RawArticle
from news_pipeline.models.source import SourceConfig
from news_pipeline.storage.json_store import JsonStore
from news_pipeline.utils.logging import get_logger


STATE_PATH = Path("news_pipeline/data/state/collect-sources.json")
CADENCE_ALIASES = {
    "always": 0,
    "every": 0,
    "hourly": 3600,
    "1h": 3600,
    "3h": 3 * 3600,
    "6h": 6 * 3600,
    "12h": 12 * 3600,
    "daily": 24 * 3600,
    "24h": 24 * 3600,
}


def _cadence_seconds(value: str | None) -> int:
    text = (value or "hourly").strip().lower()
    if text in CADENCE_ALIASES:
        return CADENCE_ALIASES[text]
    match = re.fullmatch(r"(\d+)\s*([mhd])", text)
    if not match:
        return 3600
    amount = int(match.group(1))
    unit = match.group(2)
    if unit == "m":
        return amount * 60
    if unit == "h":
        return amount * 3600
    return amount * 86400


def _read_state(root: Path) -> dict[str, dict[str, object]]:
    try:
        payload = json.loads((root / STATE_PATH).read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_state(root: Path, state: dict[str, dict[str, object]]) -> None:
    path = root / STATE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _last_collected_at(entry: dict[str, object] | None) -> datetime | None:
    if not entry:
        return None
    value = entry.get("lastCollectedAt")
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value).astimezone(UTC)
    except ValueError:
        return None


def _is_due(
    source: SourceConfig,
    state: dict[str, dict[str, object]],
    now: datetime,
    *,
    full: bool,
    cadence_grace_seconds: int = 0,
) -> tuple[bool, str | None]:
    if full:
        return True, None
    cadence = _cadence_seconds(source.cadence)
    if cadence <= 0:
        return True, None
    last = _last_collected_at(state.get(source.id))
    if last is None:
        return True, None
    age = int((now - last).total_seconds())
    if age + max(cadence_grace_seconds, 0) >= cadence:
        return True, None
    return False, f"cadence_wait:{age}s/{cadence}s"


def collect_command(
    config_path: str = "news_pipeline/news_pipeline/config/sources.yaml",
    full: bool = typer.Option(False, "--full", help="Ignore source cadence and collect every enabled source."),
    cadence_grace_seconds: int = typer.Option(300, "--cadence-grace-seconds", help="Treat sources as due when they are within this many seconds of their cadence window."),
    verbose: bool = typer.Option(False, "--verbose", help="Print per-source skip/collect diagnostics."),
) -> None:
    logger = get_logger()
    root = Path.cwd()
    raw_store = JsonStore(root / "news_pipeline/data/raw", RawArticle)
    config = load_yaml(root / config_path)
    source_rows = config.get("sources", [])
    configured_source_ids = {item.get("id") for item in source_rows if isinstance(item, dict) and item.get("id")}
    state = {source_id: entry for source_id, entry in _read_state(root).items() if source_id in configured_source_ids}
    now = datetime.now(UTC)

    collected_sources = 0
    skipped_cadence = 0
    skipped_disabled = 0
    skipped_kind = 0
    total_items = 0
    failed = 0
    empty_sources = 0

    for source_data in source_rows:
        source = SourceConfig.model_validate(source_data)
        if not source.enabled:
            skipped_disabled += 1
            if verbose:
                logger.info(f"skip {source.id}, disabled")
            continue
        if source.kind != "rss":
            skipped_kind += 1
            if verbose:
                logger.info(f"skip {source.id}, only rss collector is wired in v1")
            continue
        due, reason = _is_due(source, state, now, full=full, cadence_grace_seconds=cadence_grace_seconds)
        if not due:
            skipped_cadence += 1
            if verbose:
                logger.info(f"skip {source.id}, {reason}")
            continue

        try:
            collector = RssCollector(source)
            import asyncio
            result = asyncio.run(collector.collect())
        except Exception as exc:
            failed += 1
            state[source.id] = {
                **state.get(source.id, {}),
                "lastAttemptAt": now.isoformat(),
                "lastError": f"{type(exc).__name__}: {exc}",
            }
            if verbose:
                logger.info(f"collect failed {source.id}: {type(exc).__name__}: {exc}")
            continue

        for article in result:
            stable_key = sha1(str(article.url).encode("utf-8")).hexdigest()[:16]
            raw_store.save(f"{source.id}-{stable_key}", article)
        state[source.id] = {
            "lastCollectedAt": now.isoformat(),
            "lastCount": len(result),
            "cadence": source.cadence,
        }
        if not result:
            state[source.id]["lastWarning"] = "empty feed result"
            empty_sources += 1
        collected_sources += 1
        total_items += len(result)
        if verbose:
            logger.info(f"collected {len(result)} raw items from {source.name}")

    _write_state(root, state)
    logger.info(
        "collect summary: "
        f"sources_collected={collected_sources}, items={total_items}, "
        f"skipped_cadence={skipped_cadence}, skipped_disabled={skipped_disabled}, "
        f"skipped_kind={skipped_kind}, failed={failed}, empty_sources={empty_sources}, full={int(full)}"
    )
