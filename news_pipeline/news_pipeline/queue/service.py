from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from slugify import slugify

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.models.queue import DraftSource, QueueItem
from news_pipeline.storage.json_store import JsonStore


class QueueService:
    def __init__(self, queue_root: Path) -> None:
        self.store = JsonStore(queue_root, QueueItem)

    def build_queue_item(self, article: NormalizedArticle) -> QueueItem:
        queue_id = f"{datetime.now(UTC):%Y-%m-%d}-{article.id[:6]}"
        return QueueItem(
            queue_id=queue_id,
            normalized_id=article.id,
            cluster_key=article.cluster_key,
            editorial_priority=0.5,
            draft_title=article.title,
            draft_description=article.summary[:240],
            draft_category=article.category_hints[0] if article.category_hints else None,
            draft_tags=[],
            draft_sources=[DraftSource(name=article.source_name, url=article.canonical_url)],
            supporting_sources=[],
            related_queue_ids=[],
            notes=[],
        )

    def find_by_normalized_id(self, normalized_id: str) -> QueueItem | None:
        for item in self.store.list_all():
            if item.normalized_id == normalized_id:
                return item
        return None

    def enqueue(self, article: NormalizedArticle) -> QueueItem:
        existing = self.find_by_normalized_id(article.id)
        if existing is not None:
            return existing
        item = self.build_queue_item(article)
        self.store.save(item.queue_id, item)
        return item

    def list_items(self) -> list[QueueItem]:
        return self.store.list_all()

    def archive(self, queue_id: str, archive_root: Path) -> bool:
        path = self.store.path_for(queue_id)
        if not path.exists():
            return False
        archive_root.mkdir(parents=True, exist_ok=True)
        target = archive_root / path.name
        path.replace(target)
        return True

    def find_cluster_mates(self, cluster_key: str, exclude_queue_id: str | None = None) -> list[QueueItem]:
        mates: list[QueueItem] = []
        for item in self.store.list_all():
            if item.cluster_key != cluster_key:
                continue
            if exclude_queue_id and item.queue_id == exclude_queue_id:
                continue
            mates.append(item)
        return mates

    def find_by_draft_title(self, draft_title: str, exclude_queue_id: str | None = None) -> list[QueueItem]:
        matches: list[QueueItem] = []
        normalized = draft_title.strip().lower()
        for item in self.store.list_all():
            if item.draft_title.strip().lower() != normalized:
                continue
            if exclude_queue_id and item.queue_id == exclude_queue_id:
                continue
            matches.append(item)
        return matches

    def approve(self, queue_id: str) -> QueueItem | None:
        item = self.store.load(queue_id)
        if item is None:
            return None
        if item.status == "published":
            return item
        if item.status not in {"new", "reviewing", "rejected"}:
            return item
        item.status = "approved"
        item.updated_at = datetime.now(UTC)
        self.store.save(queue_id, item)
        return item

    def reject(self, queue_id: str, note: str = "") -> QueueItem | None:
        item = self.store.load(queue_id)
        if item is None:
            return None
        item.status = "rejected"
        item.editorial_priority = 0.0
        if note and note not in item.notes:
            item.notes.append(note)
        item.updated_at = datetime.now(UTC)
        self.store.save(queue_id, item)
        return item

    def save(self, item: QueueItem) -> QueueItem:
        item.updated_at = datetime.now(UTC)
        self.store.save(item.queue_id, item)
        return item

    def mark_published(self, queue_id: str, slug: str) -> QueueItem | None:
        item = self.store.load(queue_id)
        if item is None:
            return None
        item.status = "published"
        item.published_slug = slugify(slug)
        item.updated_at = datetime.now(UTC)
        self.store.save(queue_id, item)
        return item
