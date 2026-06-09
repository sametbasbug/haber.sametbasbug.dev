from __future__ import annotations

from news_pipeline.models.queue import DraftSource, QueueItem

SOURCE_NAME_WEIGHTS = {
    "BBC World": 0.91,
    "The Guardian World": 0.90,
    "Al Jazeera World": 0.89,
    "France 24 World": 0.88,
    "Deutsche Welle World": 0.87,
    "NPR World": 0.86,
    "Politico Europe": 0.84,
    "The Guardian Business": 0.84,
    "NPR Business": 0.83,
    "Deutsche Welle Business": 0.82,
    "Ars Technica": 0.87,
    "The Verge": 0.86,
    "MIT Technology Review": 0.86,
    "Rest of World": 0.85,
    "WIRED": 0.84,
    "Engadget": 0.84,
    "ZDNET": 0.82,
    "Fast Company Tech": 0.80,
    "TechCrunch": 0.78,
    "New Scientist": 0.84,
    "The Guardian Science": 0.83,
    "NASA News": 0.82,
    "ScienceDaily Top Science": 0.80,
}


def source_weight(source: DraftSource) -> float:
    return SOURCE_NAME_WEIGHTS.get(source.name, 0.70)


def rebalance_sources(item: QueueItem) -> QueueItem:
    combined = [*item.draft_sources, *item.supporting_sources]
    deduped: list[DraftSource] = []
    seen_urls: set[str] = set()
    seen_names: set[str] = set()
    for source in combined:
        url = str(source.url)
        if url in seen_urls:
            continue
        seen_urls.add(url)
        deduped.append(source)

    if not deduped:
        item.draft_sources = []
        item.supporting_sources = []
        return item

    ordered = sorted(deduped, key=source_weight, reverse=True)
    primary = ordered[0]
    seen_names.add(primary.name)

    supporting: list[DraftSource] = []
    for source in ordered[1:]:
        if source.name in seen_names:
            continue
        supporting.append(source)
        seen_names.add(source.name)
        if len(supporting) >= 4:
            break

    item.draft_sources = [primary]
    item.supporting_sources = supporting
    return item
