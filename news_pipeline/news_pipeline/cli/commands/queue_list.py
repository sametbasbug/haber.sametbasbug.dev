from __future__ import annotations

from pathlib import Path

from news_pipeline.queue.service import QueueService


def queue_list_command(status: str | None = None, manual_only: bool = False) -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    items = sorted(service.list_items(), key=lambda item: item.editorial_priority, reverse=True)
    for item in items:
        if status and item.status != status:
            continue
        if manual_only and not any(note.startswith("manual-review:") for note in item.notes):
            continue
        marker = " !review" if any(note.startswith("manual-review:") for note in item.notes) else ""
        print(
            f"{item.queue_id} | {item.status:10} | {item.editorial_priority:0.3f} | {item.draft_category or '-':10} | {item.draft_title}{marker}"
        )
