from __future__ import annotations

from pathlib import Path

import typer

from news_pipeline.queue.service import QueueService


def queue_approve_command(queue_id: str) -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    existing = service.store.load(queue_id)
    if existing is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    if existing.status == "published":
        raise typer.BadParameter(f"queue item is already published: {queue_id}")
    if existing.status == "approved":
        print(f"already approved: {existing.queue_id}")
        return
    item = service.approve(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    print(f"approved: {item.queue_id}")
