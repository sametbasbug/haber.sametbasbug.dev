from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path
from typing import Any

import typer

from news_pipeline.cli.commands.heartbeat_publish_one import _is_excluded_source_format, _run_pipeline_command, _source_is_fresh
from news_pipeline.editorial.autonomy import is_autopublish_candidate
from news_pipeline.models.article import NormalizedArticle
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


def _article_payload(root: Path, item: Any) -> dict[str, Any]:
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    article = normalized_store.load(item.normalized_id)
    source_age_hours = None
    if article and article.published_at:
        source_age_hours = round((datetime.now(UTC) - article.published_at.astimezone(UTC)).total_seconds() / 3600, 2)
    return {
        "queueId": item.queue_id,
        "status": item.status,
        "score": round(float(item.editorial_priority), 3),
        "source": {
            "name": article.source_name if article else (item.draft_sources[0].name if item.draft_sources else ""),
            "url": str(article.canonical_url if article else (item.draft_sources[0].url if item.draft_sources else "")),
            "publishedAt": article.published_at.isoformat() if article and article.published_at else None,
            "ageHours": source_age_hours,
        },
        "sourceText": {
            "title": article.title if article else "",
            "summary": article.summary if article else "",
            "contentSnippet": article.content_snippet[:1600] if article else "",
        },
    }


def _candidate_reason(root: Path, item: Any, min_score: float, max_source_age_hours: int) -> tuple[bool, str | None]:
    if _is_excluded_source_format(item):
        return False, "excluded source format (podcast/liveblog)"
    fresh, stale_reason = _source_is_fresh(root, item, max_source_age_hours)
    if not fresh:
        return False, stale_reason
    return is_autopublish_candidate(item, min_score=min_score)


def prepare_one_command(
    collect: bool = typer.Option(True, "--collect/--no-collect", help="Run collect before preparing the editorial pack."),
    process: bool = typer.Option(True, "--process/--no-process", help="Run process before preparing the editorial pack."),
    cleanup: bool = typer.Option(True, "--cleanup/--no-cleanup", help="Run queue cleanup before preparing the editorial pack."),
    full_collect: bool = typer.Option(False, "--full-collect", help="Bypass source cadence during collect."),
    min_score: float = typer.Option(0.68, "--min-score", help="Strict publish threshold used for diagnostics."),
    max_source_age_hours: int = typer.Option(36, "--max-source-age-hours", help="Maximum source age for auto publish diagnostics."),
    limit: int = typer.Option(6, "--limit", help="How many candidate packs to return."),
    json_output: bool = typer.Option(False, "--json", help="Emit machine-readable JSON."),
) -> None:
    """Prepare a compact editorial pack for Asteria to rewrite/review before publishing.

    This command does technical prep only. It intentionally does not publish and does
    not replace Asteria's editorial judgment.
    """
    root = Path.cwd()
    steps: list[dict[str, Any]] = []
    if collect:
        args = ["collect"] + (["--full"] if full_collect else [])
        steps.append(_run_pipeline_command("collect", args, timeout=180))
    if process:
        steps.append(_run_pipeline_command("process", ["process"], timeout=180))
    if cleanup:
        steps.append(_run_pipeline_command("queue-cleanup", ["queue", "cleanup"], timeout=90))

    service = QueueService(root / "news_pipeline/data/queue")
    items = sorted(service.list_items(), key=lambda item: item.editorial_priority, reverse=True)
    packs: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for item in items:
        if item.status != "new":
            continue
        ok, reason = _candidate_reason(root, item, min_score, max_source_age_hours)
        payload = _article_payload(root, item)
        payload["strictGate"] = {"passesNow": ok, "reason": reason}
        if ok or len(packs) < limit:
            if not _is_excluded_source_format(item):
                packs.append(payload)
        elif len(skipped) < 8:
            skipped.append({"queueId": item.queue_id, "score": round(float(item.editorial_priority), 3), "title": item.draft_title, "reason": reason})
        if len(packs) >= limit:
            break

    result = "ready" if packs else "no_candidates"
    payload = {
        "schemaVersion": 1,
        "command": "heartbeat prepare-one",
        "result": result,
        "instruction": "Asteria must choose one candidate from the original source text, translate/rewrite title/description/facts herself, apply it with `queue polish`, then run `heartbeat publish-one --execute --no-collect --json`. Python drafts are intentionally hidden to avoid anchoring; do not publish without Asteria editorial polish.",
        "steps": steps,
        "candidates": packs,
        "skippedSamples": skipped,
    }
    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        typer.echo(f"{result}: {len(packs)} candidate(s) prepared")
