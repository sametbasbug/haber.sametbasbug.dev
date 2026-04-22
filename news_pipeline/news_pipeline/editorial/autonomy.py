from __future__ import annotations

import re

from news_pipeline.models.queue import QueueItem
from news_pipeline.publish.body_template import PLACEHOLDER_BODY_MARKERS, build_body

SAFE_AUTOPUBLISH_CATEGORIES = {"Teknoloji", "Dünya", "Siyaset", "Türkiye"}
HIGH_RISK_AUTOPUBLISH_TERMS = {
    "dava",
    "soruşturma",
    "iddia",
    "suçlama",
    "istismar",
    "epstein",
    "başsavcısı",
    "governor",
    "abuse",
    "lawsuit",
    "probe",
}
MIN_AUTOPUBLISH_FACTS = 2
MIN_AUTOPUBLISH_BODY_LENGTH = 520

ENGLISH_MARKERS = {
    " will ",
    " with ",
    " after ",
    " says ",
    " gets ",
    " is ",
    " are ",
    " on ",
    " in ",
    " for ",
    " said ",
    " plans ",
    " exchange ",
    " ministry ",
    " against ",
    " through ",
    " everyone ",
    " talking ",
    " conference ",
    " over ",
    " violations ",
    " clickbait ",
}

TURKISH_MARKERS = {
    " ve ",
    " bir ",
    " için ",
    " ile ",
    " olarak ",
    " olduğunu ",
    " açıkladı ",
    " söyledi ",
    " gündeme ",
    " ateşkes ",
    " ihlali ",
    " konuştu ",
    " savundu ",
    " bildirdi ",
    " başbakanı ",
    " başkanı ",
    " yalnızca ",
    " kutlamak ",
    " kaybetti ",
    " ediliyor ",
}


def has_manual_review(item: QueueItem) -> bool:
    return any(note.startswith("manual-review:") for note in item.notes)


def has_withdrawn_flag(item: QueueItem) -> bool:
    return any(note.startswith("autopublish-withdrawn:") for note in item.notes)


def looks_too_english(text: str) -> bool:
    lowered = f" {text.strip().lower()} "
    hits = sum(1 for marker in ENGLISH_MARKERS if marker in lowered)
    if re.search(r"\bthe\b|\band\b|\bof\b|\bto\b|\bover\b|\beveryone\b", lowered):
        hits += 1
    return hits >= 2


def has_strong_turkish_signal(text: str) -> bool:
    lowered = f" {text.strip().lower()} "
    turkish_hits = sum(1 for marker in TURKISH_MARKERS if marker in lowered)
    if re.search(r"[çğıöşü]", lowered):
        turkish_hits += 1
    if re.search(r"\b\w+(iyor|ıyor|uyor|üyor|di|dı|du|dü|ti|tı|tu|tü|nin|nın|nun|nün|si|sı|su|sü|lari|ları|leri)\b", lowered):
        turkish_hits += 1
    return turkish_hits >= 2


def has_placeholder_body(item: QueueItem) -> bool:
    body = build_body(item)
    return any(marker in body for marker in PLACEHOLDER_BODY_MARKERS)


def is_high_risk_autopublish_topic(item: QueueItem) -> bool:
    text = f"{item.draft_title} {item.draft_description} {' '.join(item.draft_facts)}".lower()
    return any(term in text for term in HIGH_RISK_AUTOPUBLISH_TERMS)


def has_enough_fact_depth(item: QueueItem) -> bool:
    facts = [fact.strip() for fact in item.draft_facts if fact and fact.strip()]
    if len(facts) < MIN_AUTOPUBLISH_FACTS:
        return False
    for fact in facts[:3]:
        if looks_too_english(fact):
            return False
        if not has_strong_turkish_signal(fact):
            return False
    return True


def has_publishable_body_depth(item: QueueItem) -> bool:
    body = build_body(item)
    if len(body.strip()) < MIN_AUTOPUBLISH_BODY_LENGTH:
        return False
    if looks_too_english(body):
        return False
    return True


def is_autopublish_candidate(item: QueueItem, min_score: float = 0.68) -> tuple[bool, str | None]:
    if item.status != "new":
        return False, "status is not new"
    if has_manual_review(item):
        return False, "manual-review item"
    if has_withdrawn_flag(item):
        return False, "withdrawn item"
    if item.editorial_priority < min_score:
        return False, f"score below threshold ({item.editorial_priority:.3f})"
    if item.draft_category not in SAFE_AUTOPUBLISH_CATEGORIES:
        return False, f"category not in safe autopublish set ({item.draft_category})"
    if is_high_risk_autopublish_topic(item):
        return False, "topic is high risk for autopublish"
    if looks_too_english(item.draft_title):
        return False, "title still too english"
    if looks_too_english(item.draft_description):
        return False, "description still too english"
    if not has_strong_turkish_signal(item.draft_title):
        return False, "title lacks strong turkish signal"
    if not has_strong_turkish_signal(item.draft_description):
        return False, "description lacks strong turkish signal"
    if not has_enough_fact_depth(item):
        return False, "not enough publishable fact depth"
    if has_placeholder_body(item):
        return False, "body still contains template filler"
    if not has_publishable_body_depth(item):
        return False, "body lacks publishable depth"
    return True, None
