from __future__ import annotations

from pathlib import Path

from news_pipeline.queue.service import QueueService


def queue_summary_command(limit: int = 3, min_score: float = 0.64) -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    items = service.list_items()

    manual_items = [item for item in items if any(note.startswith("manual-review:") for note in item.notes) and item.status != "rejected"]
    new_items = [item for item in items if item.status == "new" and item.editorial_priority >= min_score]
    published_items = [item for item in items if item.status == "published"]

    new_items.sort(key=lambda item: item.editorial_priority, reverse=True)
    manual_items.sort(key=lambda item: item.editorial_priority, reverse=True)

    print(f"manual_review={len(manual_items)}")
    print(f"strong_new={len(new_items)}")
    print(f"published_total={len(published_items)}")

    if manual_items:
        print("manual_top:")
        for item in manual_items[:limit]:
            print(f"- {item.queue_id} | {item.editorial_priority:0.3f} | {item.draft_title}")

    if new_items:
        print("strong_top:")
        for item in new_items[:limit]:
            print(f"- {item.queue_id} | {item.editorial_priority:0.3f} | {item.draft_title}")
