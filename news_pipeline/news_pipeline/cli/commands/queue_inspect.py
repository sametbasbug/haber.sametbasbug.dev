from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import typer

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


def queue_inspect_command(queue_id: str) -> None:
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    item = service.store.load(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")

    print(f"queue_id: {item.queue_id}")
    print(f"status: {item.status}")
    print(f"priority: {item.editorial_priority}")
    print(f"title: {item.draft_title}")
    normalized = normalized_store.load(item.normalized_id)
    if normalized:
        effective_source_date = normalized.published_at or normalized.created_at
        age_hours = (datetime.now(UTC) - effective_source_date.astimezone(UTC)).total_seconds() / 3600
        print(f"source_published_at: {normalized.published_at.isoformat() if normalized.published_at else '-'}")
        print(f"source_effective_date: {effective_source_date.isoformat()}")
        print(f"source_age_hours: {age_hours:.1f}")
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
