from __future__ import annotations

from pathlib import Path

from news_pipeline.editorial.autonomy import is_autopublish_candidate
from news_pipeline.publish.markdown_writer import write_live
from news_pipeline.queue.service import QueueService


def autopublish_command(limit: int = 1, min_score: float = 0.68, publish_dir: str = "src/content/anlikHaber") -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    items = sorted(service.list_items(), key=lambda item: item.editorial_priority, reverse=True)

    published = 0
    for item in items:
        ok, reason = is_autopublish_candidate(item, min_score=min_score)
        if not ok:
            continue
        approved = service.approve(item.queue_id)
        if approved is None or approved.status != "approved":
            continue
        path = write_live(root / publish_dir, approved)
        service.mark_published(approved.queue_id, path.stem)
        print(f"autopublished: {approved.queue_id} -> {path}")
        published += 1
        if published >= limit:
            break

    if published == 0:
        print("autopublished: none")
