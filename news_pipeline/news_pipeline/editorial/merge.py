from __future__ import annotations

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.models.queue import DraftSource, QueueItem


def merge_supporting_source(item: QueueItem, article: NormalizedArticle) -> QueueItem:
    candidate = DraftSource(name=article.source_name, url=article.canonical_url)

    primary_urls = {str(source.url) for source in item.draft_sources}
    supporting_urls = {str(source.url) for source in item.supporting_sources}
    primary_names = {source.name for source in item.draft_sources}
    supporting_names = {source.name for source in item.supporting_sources}
    candidate_url = str(candidate.url)

    if candidate_url in primary_urls or candidate_url in supporting_urls:
        return item
    if candidate.name in primary_names or candidate.name in supporting_names:
        return item

    item.supporting_sources.append(candidate)
    return item


def merge_related_note(item: QueueItem, total_related: int) -> QueueItem:
    note = f"related-coverage: {total_related} benzer kayıt bulundu"
    if note not in item.notes:
        item.notes.append(note)
    return item
