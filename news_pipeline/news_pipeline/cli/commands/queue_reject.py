from __future__ import annotations

from pathlib import Path

import typer

from news_pipeline.queue.service import QueueService


def queue_reject_command(queue_id: str, note: str = "") -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    item = service.reject(queue_id, note=note)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    print(f"rejected: {item.queue_id}")
