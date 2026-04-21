from __future__ import annotations

from datetime import UTC, datetime

from news_pipeline.models.article import NormalizedArticle


SOURCE_WEIGHTS = {
    "bbc-world": 0.34,
    "politico-eu": 0.39,
    "techcrunch": 0.37,
}

CATEGORY_WEIGHTS = {
    "Türkiye": 0.20,
    "Ekonomi": 0.16,
    "Siyaset": 0.18,
    "Teknoloji": 0.15,
    "Dünya": 0.12,
}

KEYWORD_BOOSTS = {
    "openai": 0.08,
    "anthropic": 0.08,
    "google": 0.04,
    "meta": 0.03,
    "trump": 0.02,
    "europe": 0.03,
    "turkey": 0.06,
    "türkiye": 0.06,
    "ai": 0.04,
    "ukraine": 0.03,
    "russia": 0.03,
}

PENALTY_TERMS = {
    "celebrity": 0.08,
    "rock band": 0.10,
    "basketball": 0.08,
    "slashes": 0.06,
    "knifeman": 0.08,
    "funny": 0.05,
    "god": 0.04,
}


def score_article(article: NormalizedArticle) -> float:
    score = SOURCE_WEIGHTS.get(article.source_id, 0.30)
    category = article.category_hints[0] if article.category_hints else None
    if category:
        score += CATEGORY_WEIGHTS.get(category, 0.0)

    text = f"{article.title} {article.summary}".lower()
    keyword_bonus = 0.0
    for keyword, boost in KEYWORD_BOOSTS.items():
        if keyword in text:
            keyword_bonus += boost
    score += min(keyword_bonus, 0.14)

    if article.published_at:
        age_hours = max((datetime.now(UTC) - article.published_at.astimezone(UTC)).total_seconds() / 3600, 0)
        freshness_bonus = max(0.0, 0.12 - min(age_hours, 24) * 0.004)
        score += freshness_bonus

    penalty = 0.0
    for term, value in PENALTY_TERMS.items():
        if term in text:
            penalty += value
    score -= min(penalty, 0.18)

    return round(max(0.0, min(score, 0.92)), 3)
