from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


def queue_list_command(status: str | None = None, manual_only: bool = False, max_source_age_hours: int = 72) -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    now = datetime.now(UTC)
    items = sorted(service.list_items(), key=lambda item: item.editorial_priority, reverse=True)
    for item in items:
        if status and item.status != status:
            continue
        if manual_only and not any(note.startswith("manual-review:") for note in item.notes):
            continue
        normalized = normalized_store.load(item.normalized_id)
        if max_source_age_hours > 0 and normalized:
            source_age = now - (normalized.published_at or normalized.created_at).astimezone(UTC)
            if source_age > timedelta(hours=max_source_age_hours):
                continue
        marker = " !review" if any(note.startswith("manual-review:") for note in item.notes) else ""
        print(
            f"{item.queue_id} | {item.status:10} | {item.editorial_priority:0.3f} | {item.draft_category or '-':10} | {item.draft_title}{marker}"
        )
