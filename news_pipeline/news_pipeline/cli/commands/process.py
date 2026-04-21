from __future__ import annotations

from pathlib import Path

from news_pipeline.config.loader import load_yaml
from news_pipeline.dedupe.similarity import are_probably_duplicates, are_probably_related
from news_pipeline.editorial.autonomy import has_withdrawn_flag
from news_pipeline.editorial.filtering import should_keep_article
from news_pipeline.editorial.merge import merge_related_note, merge_supporting_source
from news_pipeline.editorial.rewrite import build_rewrite
from news_pipeline.editorial.scoring import score_article
from news_pipeline.editorial.source_priority import rebalance_sources
from news_pipeline.models.article import NormalizedArticle, RawArticle
from news_pipeline.models.queue import DraftSource
from news_pipeline.models.source import SourceConfig
from news_pipeline.normalize.cleaner import ArticleNormalizer
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore
from news_pipeline.utils.logging import get_logger


def process_command(config_path: str = "news_pipeline/news_pipeline/config/sources.yaml") -> None:
    logger = get_logger()
    root = Path.cwd()
    raw_store = JsonStore(root / "news_pipeline/data/raw", RawArticle)
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    queue_service = QueueService(root / "news_pipeline/data/queue")
    normalizer = ArticleNormalizer()

    config = load_yaml(root / config_path)
    sources = {item["id"]: SourceConfig.model_validate(item) for item in config.get("sources", [])}

    kept: list[NormalizedArticle] = []
    created = 0
    updated = 0
    rejected = 0
    for raw in raw_store.list_all():
        source = sources.get(raw.source_id)
        if source is None:
            continue
        normalized = normalizer.normalize(raw, source)
        if any(are_probably_duplicates(normalized, existing) for existing in kept):
            logger.info(f"dedupe skip: {normalized.title}")
            continue

        existing_item = queue_service.find_by_normalized_id(normalized.id)
        decision = should_keep_article(normalized)
        if not decision.keep:
            logger.info(f"filter skip: {normalized.title} ({decision.reason})")
            if existing_item and existing_item.status != "published":
                queue_service.reject(existing_item.queue_id, note=decision.reason or "filtered out")
                rejected += 1
            continue

        normalized_store.save(normalized.id, normalized)
        rewritten_title, rewritten_description, rewritten_category, rewritten_tags, rewrite_notes, rewritten_facts = build_rewrite(normalized)

        if existing_item is None:
            item = queue_service.enqueue(normalized)
            created += 1
        else:
            item = existing_item
            updated += 1

        item.cluster_key = normalized.cluster_key
        item.draft_title = rewritten_title
        item.draft_description = rewritten_description[:240]
        item.draft_category = rewritten_category
        item.draft_tags = rewritten_tags
        item.draft_facts = rewritten_facts
        item.draft_sources = [DraftSource(name=normalized.source_name, url=normalized.canonical_url)]
        item.editorial_priority = score_article(normalized)
        if item.status == "rejected" and not has_withdrawn_flag(item):
            item.status = "new"

        related_items = []
        for other in kept:
            if other.id == normalized.id:
                continue
            if are_probably_related(normalized, other):
                related_items.append(other)

        title_mates = queue_service.find_by_draft_title(rewritten_title, exclude_queue_id=item.queue_id)
        for title_mate in title_mates:
            related_normalized = normalized_store.load(title_mate.normalized_id)
            if related_normalized is not None and all(existing.id != related_normalized.id for existing in related_items):
                related_items.append(related_normalized)

        if related_items:
            item.related_queue_ids = [related.id for related in related_items[:5]]
            merge_related_note(item, len(related_items))
            for related in related_items[:3]:
                item = merge_supporting_source(item, related)
                related_item = queue_service.find_by_normalized_id(related.id)
                if related_item is not None:
                    related_item.related_queue_ids = list({*related_item.related_queue_ids, normalized.id})
                    merge_related_note(related_item, len(related_item.related_queue_ids))
                    related_item = merge_supporting_source(related_item, normalized)
                    queue_service.save(related_item)

        for note in rewrite_notes:
            if note not in item.notes:
                item.notes.append(note)
        item = rebalance_sources(item)
        queue_service.save(item)
        kept.append(normalized)

    logger.info(f"processed created={created}, updated={updated}, rejected={rejected}")
