from __future__ import annotations

from dataclasses import dataclass

from news_pipeline.models.article import NormalizedArticle


@dataclass(slots=True)
class FilterDecision:
    keep: bool
    reason: str | None = None


BLOCKLIST_TERMS = {
    "watch:",
    "photo of the day",
    "quiz",
    "puzzle",
    "live updates",
    "how to watch",
    "review:",
    "hands-on",
    "opinion:",
    "podcast",
    "newsletter",
    "who is ",
    "explained",
    "beamed as she met",
    "rock band",
    "globetrotters",
}

LOW_SIGNAL_TERMS = {
    "celebrity",
    "basketball",
    "finger",
    "humour",
    "embarrassing",
    "rock band",
    "deep purple",
    "laugh",
    "funny",
}


def should_keep_article(article: NormalizedArticle) -> FilterDecision:
    title = article.title.strip().lower()
    summary = article.summary.strip().lower()
    joined = f"{title} {summary}"

    for term in BLOCKLIST_TERMS:
        if term in joined:
            return FilterDecision(False, f"blocked by term: {term}")

    low_signal_hits = sum(1 for term in LOW_SIGNAL_TERMS if term in joined)
    if low_signal_hits >= 2:
        return FilterDecision(False, "too low-signal for editorial queue")

    if len(article.title.strip()) < 18:
        return FilterDecision(False, "title too short")

    if article.source_id == "bbc-world" and any(term in joined for term in {"who is ", "rock band", "beamed as"}):
        return FilterDecision(False, "bbc feature-style item, not a priority news draft")

    if any(term in joined for term in {"sexual assault allegations", "serial killer", "celebrity"}):
        return FilterDecision(False, "outside current editorial priority line")

    return FilterDecision(True)
