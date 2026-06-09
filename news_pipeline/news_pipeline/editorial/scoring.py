from __future__ import annotations

from datetime import UTC, datetime

from news_pipeline.models.article import NormalizedArticle


SOURCE_WEIGHTS = {
    "techcrunch": 0.34,
    "ars-technica": 0.32,
    "mit-tech-review": 0.33,
    "wired": 0.32,
    "rest-of-world": 0.33,
    "bbc-world": 0.34,
    "guardian-world": 0.33,
    "al-jazeera-world": 0.33,
    "france24-world": 0.32,
    "dw-world": 0.32,
    "npr-world": 0.32,
    "politico-eu": 0.32,
    "guardian-business": 0.32,
    "npr-business": 0.31,
    "dw-business": 0.31,
    "cnbc-world-economy": 0.30,
    "marketwatch-top-stories": 0.29,
    "nasa-news": 0.31,
    "sciencedaily-top-science": 0.29,
    "guardian-science": 0.31,
    "new-scientist": 0.32,
    "physorg": 0.29,
    "live-science": 0.29,
    "space-com": 0.29,
}

CATEGORY_WEIGHTS = {
    "Ekonomi": 0.16,
    "Siyaset": 0.17,
    "Teknoloji": 0.15,
    "Bilim": 0.12,
}

KEYWORD_BOOSTS = {
    "openai": 0.06,
    "anthropic": 0.06,
    "google": 0.01,
    "meta": 0.02,
    "trump": 0.02,
    "europe": 0.03,
    "eu": 0.025,
    "turkey": 0.06,
    "türkiye": 0.06,
    "ai": 0.035,
    "ukraine": 0.04,
    "russia": 0.04,
    "china": 0.035,
    "sanctions": 0.03,
    "nato": 0.035,
    "climate": 0.035,
    "energy": 0.03,
    "security": 0.03,
    "trade": 0.025,
    "inflation": 0.025,
    "space": 0.025,
}

PENALTY_TERMS = {
    "celebrity": 0.08,
    "rock band": 0.10,
    "basketball": 0.08,
    "slashes": 0.06,
    "knifeman": 0.08,
    "funny": 0.05,
    "god": 0.04,
    "world cup": 0.05,
    "royal": 0.05,
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
