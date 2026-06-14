from __future__ import annotations

import re

from news_pipeline.models.queue import QueueItem
from news_pipeline.publish.body_template import PLACEHOLDER_BODY_MARKERS, build_body

SAFE_AUTOPUBLISH_CATEGORIES = {"Teknoloji", "Siyaset", "Ekonomi", "Bilim"}
CATEGORY_MIN_SCORES = {}
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
    " yaklaşık ",
    " kadar ",
    " geniş ",
    " uzaklıktaki ",
    " yalnızca ",
    " kutlamak ",
    " kaybetti ",
    " ediliyor ",
    " türkiye ",
    " çağrısı ",
    " çağrisı ",
    " seçimi ",
    " secimi ",
    " ev sahipliği ",
    " ev sahipligi ",
}

TURKISH_MORPHOLOGY_RE = re.compile(
    r"\b[\wçğıöşü]+(?:"
    r"daki|deki|taki|teki|"
    r"ların|lerin|ları|leri|"
    r"nın|nin|nun|nün|"
    r"ını|ini|unu|ünü|"
    r"mayı|meyi|mak|mek|"
    r"acak|ecek|"
    r"ıyor|iyor|uyor|üyor|"
    r"di|dı|du|dü|ti|tı|tu|tü|"
    r"arak|erek|"
    r"an|en"
    r")\b"
)


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


def body_looks_too_english(text: str) -> bool:
    """Return True when an editorial body still looks mostly English.

    Full Turkish articles can legitimately mention English proper nouns such as
    "Institute for the Study of War" in source attribution. The generic short-
    text heuristic is intentionally strict for titles/descriptions/facts, but it
    is too brittle for long bodies where a single source name can contain
    multiple English stop words. For bodies, keep the strict rejection unless the
    text has strong Turkish character/morphology evidence and only a small number
    of English-marker hits.
    """
    if not looks_too_english(text):
        return False

    lowered = f" {text.strip().lower()} "
    marker_hits = sum(1 for marker in ENGLISH_MARKERS if marker in lowered)
    regex_hits = len(re.findall(r"\b(?:the|and|of|to|over|everyone)\b", lowered))
    english_hits = marker_hits + regex_hits
    turkish_marker_hits = sum(1 for marker in TURKISH_MARKERS if marker in lowered)
    morphology_hits = len(TURKISH_MORPHOLOGY_RE.findall(lowered))
    has_turkish_chars = bool(re.search(r"[çğıöşü]", lowered))
    turkish_signal = turkish_marker_hits + min(morphology_hits, 4) + (1 if has_turkish_chars else 0)

    if len(text) >= MIN_AUTOPUBLISH_BODY_LENGTH and turkish_signal >= 5 and english_hits <= 4:
        return False
    return True


def has_strong_turkish_signal(text: str) -> bool:
    lowered = f" {text.strip().lower()} "
    turkish_hits = sum(1 for marker in TURKISH_MARKERS if marker in lowered)
    has_turkish_chars = bool(re.search(r"[çğıöşü]", lowered))
    morphology_hits = len(TURKISH_MORPHOLOGY_RE.findall(lowered))

    if has_turkish_chars:
        turkish_hits += 1
    # Do not make the gate depend only on a small hand-picked word list.
    # Clean Turkish descriptions often carry the signal in suffixes such as
    # "liderliğindeki", "şirketlerin", "büyütecek" or "hedefleyen".
    # Cap morphology contribution so one repetitive/odd sentence cannot pass
    # purely by suffix spam while still avoiding false negatives like the
    # Stilta description from 2026-05-19.
    turkish_hits += min(morphology_hits, 2)
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


def has_asteria_editorial_polish(item: QueueItem) -> bool:
    return any(note == "asteria-editorial-polish" or note.startswith("asteria-editorial-polish") for note in item.notes)


def has_hero_brief(item: QueueItem) -> bool:
    return bool(item.hero_prompt.strip()) and bool(item.hero_alt.strip())


def has_publishable_body_depth(item: QueueItem) -> bool:
    # Check Asteria's editorial body, not the rendered Markdown with the
    # source footer appended. Otherwise English words inside URLs/source titles
    # can falsely reject an otherwise clean Turkish article body.
    body = item.draft_body.strip() or build_body(item)
    if len(body) < MIN_AUTOPUBLISH_BODY_LENGTH:
        return False
    if body_looks_too_english(body):
        return False
    return True


def is_autopublish_candidate(item: QueueItem, min_score: float = 0.68) -> tuple[bool, str | None]:
    has_polish = has_asteria_editorial_polish(item)
    min_score = min_score if has_polish else CATEGORY_MIN_SCORES.get(item.draft_category, min_score)
    if item.status not in {"new", "approved"}:
        return False, "status is not new or approved"
    if has_manual_review(item):
        return False, "manual-review item"
    if has_withdrawn_flag(item):
        return False, "withdrawn item"
    if item.editorial_priority < min_score:
        return False, f"score below threshold ({item.editorial_priority:.3f})"
    if item.draft_category not in SAFE_AUTOPUBLISH_CATEGORIES:
        return False, f"category not in safe autopublish set ({item.draft_category})"
    if not has_polish:
        return False, "missing Asteria editorial polish"
    if not has_hero_brief(item):
        return False, "missing Asteria hero brief"
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
