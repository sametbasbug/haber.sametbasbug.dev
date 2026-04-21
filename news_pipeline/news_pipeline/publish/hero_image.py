from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Any

import httpx

from news_pipeline.models.queue import QueueItem
from news_pipeline.utils.env import get_env

DEFAULT_HERO_IMAGES = {
    "Teknoloji": [
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1496171367470-9ed9a91ea931?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&h=675&auto=format&fit=crop",
    ],
    "Ekonomi": [
        "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=1200&h=675&auto=format&fit=crop",
    ],
    "Dünya": [
        "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1200&h=675&auto=format&fit=crop",
    ],
    "Siyaset": [
        "https://images.unsplash.com/photo-1495020689067-958852a7765e?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1575320181282-9afab399332c?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?q=80&w=1200&h=675&auto=format&fit=crop",
    ],
    "Türkiye": [
        "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1527838832700-5059252407fa?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=1200&h=675&auto=format&fit=crop",
    ],
}
FALLBACK_CATEGORY = "Teknoloji"
PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
NEWS_CONTENT_DIR = Path(__file__).resolve().parents[3] / "src" / "content" / "anlikHaber"
STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "after", "over", "under", "near",
    "can", "will", "now", "still", "more", "less", "amid", "says", "said", "new", "latest", "its",
    "bir", "iki", "uc", "dort", "bes", "ve", "ile", "icin", "gibi", "kadar", "sonra", "yeni", "artık",
    "daha", "gore", "gibi", "olan", "olanlar", "etti", "ettiği", "aciklandi", "yapti", "yapiyor",
    "openai", "google", "amazon", "intel", "pentagon"  # handled by dedicated rules below when useful
}
CATEGORY_QUERIES = {
    "Teknoloji": [
        "software interface desktop workstation technology",
        "computer screen coding productivity app",
        "abstract technology device screen",
    ],
    "Siyaset": [
        "government building parliament diplomacy",
        "politics diplomacy official building flags",
        "press briefing government office",
    ],
    "Dünya": [
        "international diplomacy world map newsroom",
        "global affairs diplomacy official meeting room",
        "border checkpoint international relations",
    ],
    "Ekonomi": [
        "financial market data charts business desk",
        "economy finance trading screen analytics",
        "business documents finance office charts",
    ],
    "Türkiye": [
        "ankara government turkey skyline",
        "istanbul city skyline turkey",
        "turkey public institution building",
    ],
}
EVENT_PENALTY_TERMS = {
    "conference",
    "event",
    "audience",
    "crowd",
    "stage",
    "speaker",
    "seminar",
    "summit",
    "meeting",
    "workshop",
    "handshake",
    "podium",
    "microphone",
    "people talking",
    "group of people",
}
GENERIC_PENALTY_TERMS = {
    "teamwork",
    "office meeting",
    "collaboration",
    "celebration",
    "networking",
    "presentation",
}
STRICT_REJECT_TERMS = {
    "wedding",
    "fashion",
    "restaurant",
    "food",
    "tourist",
    "vacation",
    "beach",
    "party",
    "concert",
    "festival",
}
TECH_QUERY_RULES = [
    (["openai", "chatgpt", "codex", "anthropic", "claude", "gemini", "google ai", "ai"], [
        "artificial intelligence interface desktop software",
        "computer screen software workspace ai",
    ]),
    (["chrome", "browser", "tab", "search"], [
        "web browser interface laptop productivity",
        "browser software screen desktop",
    ]),
    (["mac", "macos", "desktop app", "app"], [
        "desktop application interface mac workspace",
        "laptop desk software interface",
    ]),
    (["security", "adobe", "pdf", "vulnerability", "hack"], [
        "cybersecurity computer screen warning",
        "security software laptop dark office",
    ]),
]
POLITICS_QUERY_RULES = [
    (["ukrayna", "ukraine", "rusya", "russia", "iran", "israil", "trump"], [
        "diplomacy flags conflict map government",
        "international relations government building flags",
    ]),
    (["ab", "eu", "avrupa birligi", "nato"], [
        "european union diplomacy flags building",
        "international diplomacy official building",
    ]),
]
ECONOMY_QUERY_RULES = [
    (["funding", "investment", "seed", "valuation", "startup"], [
        "startup finance office analytics laptop",
        "investment data charts business desk",
    ]),
    (["market", "borsa", "stock", "shares", "trading"], [
        "stock market charts trading screen",
        "finance data monitor business",
    ]),
]


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text.lower()).strip()


def _build_text_blob(item: QueueItem) -> str:
    parts = [
        item.draft_title,
        item.draft_description,
        " ".join(item.draft_tags),
        " ".join(item.draft_facts[:4]),
    ]
    return _normalize_text(" ".join(part for part in parts if part))


def _extract_keywords(text: str, limit: int = 6) -> list[str]:
    words = re.findall(r"[a-z0-9]+", _normalize_text(text))
    out: list[str] = []
    seen: set[str] = set()
    for word in words:
        if len(word) < 4 or word in STOPWORDS or word.isdigit():
            continue
        if word not in seen:
            seen.add(word)
            out.append(word)
        if len(out) >= limit:
            break
    return out


def _queries_from_rules(text: str, rules: list[tuple[list[str], list[str]]]) -> list[str]:
    queries: list[str] = []
    for triggers, candidates in rules:
        if any(trigger in text for trigger in triggers):
            queries.extend(candidates)
    return queries


def _build_queries(item: QueueItem) -> list[str]:
    category = item.draft_category or "Teknoloji"
    text = _build_text_blob(item)
    title_keywords = _extract_keywords(item.draft_title, limit=5)
    detail_keywords = _extract_keywords(f"{item.draft_description} {' '.join(item.draft_tags)}", limit=5)
    queries: list[str] = []

    if category == "Teknoloji":
        queries.extend(_queries_from_rules(text, TECH_QUERY_RULES))
    elif category in {"Siyaset", "Dünya", "Türkiye"}:
        queries.extend(_queries_from_rules(text, POLITICS_QUERY_RULES))
    elif category == "Ekonomi":
        queries.extend(_queries_from_rules(text, ECONOMY_QUERY_RULES))

    if title_keywords:
        queries.append(" ".join(title_keywords[:4]))
        queries.append(" ".join(title_keywords[:3] + detail_keywords[:2]).strip())

    if category == "Teknoloji" and title_keywords:
        queries.append(" ".join(title_keywords[:3] + ["technology", "software"]))
    elif category == "Ekonomi" and title_keywords:
        queries.append(" ".join(title_keywords[:3] + ["business", "finance"]))
    elif category in {"Siyaset", "Dünya", "Türkiye"} and title_keywords:
        queries.append(" ".join(title_keywords[:3] + ["government", "diplomacy"]))

    queries.extend(CATEGORY_QUERIES.get(category, ["news editorial illustration abstract"]))

    seen: set[str] = set()
    deduped: list[str] = []
    for query in queries:
        cleaned = re.sub(r"\s+", " ", query).strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            deduped.append(cleaned)
    return deduped[:6]


def _image_key(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    pexels_match = re.search(r"/photos/(\d+)/", text)
    if pexels_match:
        return f"pexels:{pexels_match.group(1)}"
    return text


def _recent_hero_images(limit: int = 30) -> set[str]:
    if not NEWS_CONTENT_DIR.exists():
        return set()

    files = sorted(
        NEWS_CONTENT_DIR.glob("*.md"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    images: set[str] = set()
    pattern = re.compile(r'^heroImage:\s*["\']?(.*?)["\']?\s*$')

    for path in files[:limit]:
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                match = pattern.match(line.strip())
                if match and match.group(1):
                    key = _image_key(match.group(1).strip())
                    if key:
                        images.add(key)
                    break
        except Exception:
            continue
    return images


def _default_hero_image(item: QueueItem, recent_images: set[str] | None = None) -> str:
    category = item.draft_category or FALLBACK_CATEGORY
    choices = DEFAULT_HERO_IMAGES.get(category) or DEFAULT_HERO_IMAGES[FALLBACK_CATEGORY]
    recent_images = recent_images or set()
    for candidate in choices:
        key = _image_key(candidate)
        if key and key not in recent_images:
            return candidate
    return choices[0]


def _photo_candidate(photo: dict[str, Any]) -> str | None:
    src = photo.get("src") or {}
    candidate = src.get("landscape") or src.get("large2x") or src.get("large")
    return str(candidate) if candidate else None


def _score_photo(photo: dict[str, Any], query: str, item: QueueItem, recent_images: set[str]) -> tuple[float, str | None]:
    candidate = _photo_candidate(photo)
    if not candidate:
        return float("-inf"), None

    score = 0.0
    photo_text = _normalize_text(
        " ".join(
            [
                str(photo.get("alt") or ""),
                str(photo.get("url") or ""),
            ]
        )
    )
    item_text = _build_text_blob(item)

    query_terms = [term for term in _normalize_text(query).split() if len(term) >= 4 and term not in STOPWORDS]
    item_terms = [term for term in item_text.split() if len(term) >= 5 and term not in STOPWORDS][:12]

    query_hits = sum(1 for term in query_terms if term in photo_text)
    item_hits = sum(1 for term in item_terms if term in photo_text)

    if query_hits == 0 and item_hits == 0:
        return float("-inf"), None

    score += query_hits * 2.2
    score += item_hits * 1.4

    if item.draft_category == "Teknoloji":
        for term in ["screen", "computer", "laptop", "software", "interface", "desk", "workspace", "keyboard"]:
            if term in photo_text:
                score += 1.8
    if item.draft_category == "Ekonomi":
        for term in ["finance", "chart", "market", "business", "analytics", "trading"]:
            if term in photo_text:
                score += 1.8
    if item.draft_category in {"Siyaset", "Dünya", "Türkiye"}:
        for term in ["government", "parliament", "flag", "building", "diplomacy", "city"]:
            if term in photo_text:
                score += 1.6

    for term in EVENT_PENALTY_TERMS:
        if term in photo_text:
            score -= 4.5
    for term in GENERIC_PENALTY_TERMS:
        if term in photo_text:
            score -= 2.5
    for term in STRICT_REJECT_TERMS:
        if term in photo_text:
            return float("-inf"), None

    candidate_key = _image_key(candidate)
    if candidate_key and candidate_key in recent_images:
        score -= 100.0

    width = int(photo.get("width") or 0)
    height = int(photo.get("height") or 0)
    if width >= 1400:
        score += 0.75
    if width > 0 and height > 0:
        aspect_ratio = width / max(height, 1)
        if 1.55 <= aspect_ratio <= 1.95:
            score += 1.0

    if query_hits < 1 and item_hits < 2:
        score -= 3.5

    return score, candidate


def _search_photos(client: httpx.Client, api_key: str, query: str) -> list[dict[str, Any]]:
    params = {
        "query": query,
        "per_page": 15,
        "orientation": "landscape",
        "size": "large",
    }
    response = client.get(PEXELS_SEARCH_URL, params=params, headers={"Authorization": api_key})
    response.raise_for_status()
    return list((response.json().get("photos") or []))


def pick_hero_image(item: QueueItem) -> str:
    recent_images = _recent_hero_images()
    api_key = get_env("PEXELS_API_KEY")
    if not api_key:
        return _default_hero_image(item, recent_images)

    queries = _build_queries(item)

    try:
        best_score = float("-inf")
        best_image: str | None = None
        fallback_score = float("-inf")
        fallback_image: str | None = None
        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            for query in queries:
                photos = _search_photos(client, api_key, query)
                for photo in photos:
                    score, candidate = _score_photo(photo, query, item, recent_images)
                    if not candidate:
                        continue
                    candidate_key = _image_key(candidate)
                    if candidate_key and candidate_key in recent_images:
                        if score > fallback_score:
                            fallback_score = score
                            fallback_image = candidate
                        continue
                    if score > best_score:
                        best_score = score
                        best_image = candidate
                if best_image and best_score >= 6.0:
                    break
        if best_image and best_score >= 4.0:
            return best_image
        if fallback_image and fallback_score >= 4.0:
            return fallback_image
        return _default_hero_image(item, recent_images)
    except Exception:
        return _default_hero_image(item, recent_images)
