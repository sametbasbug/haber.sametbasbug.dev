from __future__ import annotations

from pathlib import Path

import typer

from news_pipeline.queue.service import QueueService


def queue_inspect_command(queue_id: str) -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    item = service.store.load(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")

    print(f"queue_id: {item.queue_id}")
    print(f"status: {item.status}")
    print(f"priority: {item.editorial_priority}")
    print(f"title: {item.draft_title}")
    print(f"description: {item.draft_description}")
    print(f"category: {item.draft_category or '-'}")
    print(f"published_slug: {item.published_slug or '-'}")
    print(f"cluster_key: {item.cluster_key or '-'}")
    if item.related_queue_ids:
        print("related_queue_ids:")
        for related in item.related_queue_ids:
            print(f"  - {related}")
    print("sources:")
    for source in item.draft_sources:
        print(f"  - {source.name}: {source.url}")
    if item.supporting_sources:
        print("supporting_sources:")
        for source in item.supporting_sources:
            print(f"  - {source.name}: {source.url}")
    if item.notes:
        print("notes:")
        for note in item.notes:
            print(f"  - {note}")
