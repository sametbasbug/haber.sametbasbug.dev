from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import re

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

SPORT_TITLE_RE = re.compile(
    r"\b(chelsea|arsenal|liverpool|manchester city|manchester united|tottenham|barcelona|real madrid|psg|juventus|bayern|galatasaray|fenerbahce|fenerbahçe|besiktas|beşiktaş|trabzonspor)\b"
)
SPORT_SIGNAL_RE = re.compile(
    r"\b(kovdu|transfer|teknik direkt[oö]r|ma[çc]ı|maci|gol|puan|lig|kupas[ıi]|şampiyon|sampiyon|kadro)\b"
)
MAX_SOURCE_AGE_HOURS = 24
MAX_FUTURE_SKEW_HOURS = 6


def should_keep_article(article: NormalizedArticle) -> FilterDecision:
    if article.published_at:
        source_age = datetime.now(UTC) - article.published_at.astimezone(UTC)
        if source_age > timedelta(hours=MAX_SOURCE_AGE_HOURS):
            return FilterDecision(False, f"source item too old for Equinox Haber: older than {MAX_SOURCE_AGE_HOURS}h")
        if source_age < -timedelta(hours=MAX_FUTURE_SKEW_HOURS):
            return FilterDecision(False, "source publish date is implausibly in the future")

    title = article.title.strip().lower()
    summary = article.summary.strip().lower()
    joined = f"{title} {summary}"

    for term in BLOCKLIST_TERMS:
        if term in joined:
            return FilterDecision(False, f"blocked by term: {term}")

    url = str(article.canonical_url).lower()
    if "/live/" in url or re.search(r"[–-]\s*[^–-]*(politics|europe|crisis|world|ukraine|abd|us)?\s*live\b", title):
        return FilterDecision(False, "blocked by liveblog format")

    if SPORT_TITLE_RE.search(title) and SPORT_SIGNAL_RE.search(title):
        return FilterDecision(False, "sports item outside current editorial line")

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
