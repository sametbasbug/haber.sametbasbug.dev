from __future__ import annotations

from pathlib import Path

from news_pipeline.queue.service import QueueService


def queue_review_command() -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    items = sorted(service.list_items(), key=lambda item: item.editorial_priority, reverse=True)
    for item in items:
        manual_notes = [note for note in item.notes if note.startswith("manual-review:")]
        if not manual_notes:
            continue
        reason = manual_notes[0].replace("manual-review: ", "")
        print(
            f"{item.queue_id} | {item.status:10} | {item.editorial_priority:0.3f} | {item.draft_category or '-':10} | {reason} | {item.draft_title}"
        )
