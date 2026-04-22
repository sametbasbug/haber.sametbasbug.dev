from __future__ import annotations

from dataclasses import dataclass
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

SOURCE_BLOCKLIST_TERMS = {
    "kisa-dalga": {
        "bir dakikada bugün ne oldu",
        "bir dakikada bugun ne oldu",
    },
    "diken": {
        "madde değil, değersizlik",
        "madde degil, degersizlik",
    },
}

SPORT_TITLE_RE = re.compile(
    r"\b(chelsea|arsenal|liverpool|manchester city|manchester united|tottenham|barcelona|real madrid|psg|juventus|bayern|galatasaray|fenerbahce|fenerbahçe|besiktas|beşiktaş|trabzonspor)\b"
)
SPORT_SIGNAL_RE = re.compile(
    r"\b(kovdu|transfer|teknik direkt[oö]r|ma[çc]ı|maci|gol|puan|lig|kupas[ıi]|şampiyon|sampiyon|kadro)\b"
)
OPINION_TITLE_RE = re.compile(
    r"^(agora|d[uü]nya alem|9 soruda|[çc]er[çc]eve)\b"
)
FEATURE_TITLE_RE = re.compile(
    r"\b(portresi|kimdir|neden .*yasaklaniyor|neden .*yasaklaniyor)\b"
)


def should_keep_article(article: NormalizedArticle) -> FilterDecision:
    title = article.title.strip().lower()
    summary = article.summary.strip().lower()
    joined = f"{title} {summary}"

    for term in BLOCKLIST_TERMS:
        if term in joined:
            return FilterDecision(False, f"blocked by term: {term}")

    for term in SOURCE_BLOCKLIST_TERMS.get(article.source_id, set()):
        if term in title:
            return FilterDecision(False, f"blocked by source term: {term}")

    if SPORT_TITLE_RE.search(title) and SPORT_SIGNAL_RE.search(title):
        return FilterDecision(False, "sports item outside current editorial line")

    if article.source_id in {"diken", "medyascope"} and OPINION_TITLE_RE.search(title):
        return FilterDecision(False, "opinion/format item outside current editorial line")

    if article.source_id in {"medyascope", "diken"} and FEATURE_TITLE_RE.search(title):
        return FilterDecision(False, "feature-style item outside current editorial line")

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
