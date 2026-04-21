from __future__ import annotations

from news_pipeline.models.queue import QueueItem, QueueStatus


def set_status(item: QueueItem, status: QueueStatus) -> QueueItem:
    item.status = status
    return item
