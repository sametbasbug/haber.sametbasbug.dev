from __future__ import annotations

from pathlib import Path

import typer

from news_pipeline.publish.markdown_writer import write_live
from news_pipeline.queue.service import QueueService


def publish_command(queue_id: str, publish_dir: str = "src/content/anlikHaber") -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    item = service.store.load(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    if item.status == "published":
        raise typer.BadParameter(f"queue item is already published: {queue_id}")
    if item.status != "approved":
        raise typer.BadParameter(f"queue item must be approved before publish: {queue_id}")
    path = write_live(root / publish_dir, item)
    service.mark_published(queue_id, path.stem)
    print(f"published: {path}")
