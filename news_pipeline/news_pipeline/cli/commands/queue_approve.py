from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import typer

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


MAX_SOURCE_AGE_HOURS = 24


def queue_approve_command(
    queue_id: str,
    max_source_age_hours: int = MAX_SOURCE_AGE_HOURS,
    allow_rejected: bool = typer.Option(False, "--allow-rejected", help="Explicitly revive a rejected queue item for manual recovery."),
) -> None:
    # Direct Python callers/tests receive Typer OptionInfo defaults; normalize
    # them so rejected items cannot be revived accidentally outside the CLI.
    if not isinstance(allow_rejected, bool):
        allow_rejected = False

    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    existing = service.store.load(queue_id)
    if existing is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    if existing.status == "published":
        raise typer.BadParameter(f"queue item is already published: {queue_id}")
    if existing.status == "rejected" and not allow_rejected:
        raise typer.BadParameter(f"queue item is rejected; use --allow-rejected only for explicit manual recovery: {queue_id}")

    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    normalized = normalized_store.load(existing.normalized_id)
    if max_source_age_hours > 0 and normalized:
        source_age = datetime.now(UTC) - (normalized.published_at or normalized.created_at).astimezone(UTC)
        if source_age > timedelta(hours=max_source_age_hours):
            raise typer.BadParameter(
                f"source item is too old for Equinox Haber: {source_age.total_seconds() / 3600:.1f}h > {max_source_age_hours}h"
            )

    if existing.status == "approved":
        print(f"already approved: {existing.queue_id}")
        return
    item = service.approve(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    print(f"approved: {item.queue_id}")
