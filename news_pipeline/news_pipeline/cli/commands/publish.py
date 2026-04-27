from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import typer

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.publish.markdown_writer import write_live
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


MAX_SOURCE_AGE_HOURS = 72


def publish_command(queue_id: str, publish_dir: str = "src/content/anlikHaber", max_source_age_hours: int = MAX_SOURCE_AGE_HOURS) -> None:
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

    path = write_live(root / publish_dir, item)
    service.mark_published(queue_id, path.stem)
    print(f"published: {path}")
