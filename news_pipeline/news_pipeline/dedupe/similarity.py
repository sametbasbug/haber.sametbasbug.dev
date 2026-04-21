from __future__ import annotations

from rapidfuzz.fuzz import ratio, token_sort_ratio

from news_pipeline.models.article import NormalizedArticle


def title_similarity(a: NormalizedArticle, b: NormalizedArticle) -> float:
    return max(ratio(a.title, b.title), token_sort_ratio(a.title, b.title))


def are_probably_duplicates(a: NormalizedArticle, b: NormalizedArticle, threshold: float = 92) -> bool:
    if a.canonical_url == b.canonical_url:
        return True
    if a.cluster_key and b.cluster_key and a.cluster_key == b.cluster_key:
        return True
    score = title_similarity(a, b)
    return score >= threshold


def are_probably_related(a: NormalizedArticle, b: NormalizedArticle, threshold: float = 78) -> bool:
    if a.source_id == b.source_id and a.canonical_url == b.canonical_url:
        return False
    return title_similarity(a, b) >= threshold
