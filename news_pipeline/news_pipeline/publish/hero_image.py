from __future__ import annotations

import json
import re
import subprocess
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from slugify import slugify

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
    "Bilim": [
        "https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1581093588401-fbb62a02f120?q=80&w=1200&h=675&auto=format&fit=crop",
    ],
    "Siyaset": [
        "https://images.unsplash.com/photo-1495020689067-958852a7765e?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1575320181282-9afab399332c?q=80&w=1200&h=675&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?q=80&w=1200&h=675&auto=format&fit=crop",
    ],
}
FALLBACK_CATEGORY = "Teknoloji"
PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
NEWS_CONTENT_DIR = PROJECT_ROOT / "src" / "content" / "anlikHaber"
GENERATED_HERO_DIR = PROJECT_ROOT / "public" / "images" / "generated" / "anlik-haber"
GENERATED_HERO_PUBLIC_PREFIX = "/images/generated/anlik-haber"
AI_HERO_DEFAULT_MODEL = "openai/gpt-image-2"
AI_HERO_TIMEOUT_MS = 180_000
AI_HERO_ATTEMPTS = 3
AI_HERO_RETRY_DELAY_SECONDS = 12
AI_HERO_WIDTH = 1200
AI_HERO_HEIGHT = 675
AI_HERO_QUALITY = 82
REQUIRE_AI_HERO_DEFAULT = "1"
_LAST_AI_HERO_ERROR: str | None = None
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
    "Bilim": [
        "science laboratory research equipment",
        "space mission satellite observatory",
        "climate science research landscape",
    ],
    "Ekonomi": [
        "financial market data charts business desk",
        "economy finance trading screen analytics",
        "business documents finance office charts",
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
    elif category in {"Siyaset", "Bilim"}:
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
    elif category in {"Siyaset", "Bilim"} and title_keywords:
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


def _category_visual_direction(category: str) -> str:
    directions = {
        "Teknoloji": "modern technology editorial cover, software interfaces, devices, chips, AI infrastructure, clean digital newsroom aesthetic",
        "Siyaset": "symbolic diplomacy and institutions, parliament architecture, flags, maps, documents, podiums without readable text, no fake portraits",
        "Ekonomi": "global markets, trade routes, energy, finance dashboards, business infrastructure, sober economic editorial cover",
        "Bilim": "scientific research, space, climate, laboratory, biology or astronomy visuals, precise and calm science-magazine cover",
    }
    return directions.get(category, directions["Teknoloji"])


def _build_ai_hero_prompt(item: QueueItem) -> str:
    category = item.draft_category or FALLBACK_CATEGORY
    if item.hero_prompt.strip():
        return f"""
Create a 16:9 modern editorial hero image for a Turkish global news site named Anlık Haber.

Asteria editorial visual brief:
{item.hero_prompt.strip()}

Article category: {category}
Headline: {item.draft_title}
Description: {item.draft_description}

Hard rules:
- The image must represent the specific news topic, not just generic category decoration.
- Do not copy or imitate any publisher/source image.
- Do not add readable text, letters, headlines, captions, UI text, watermarks, or logos.
- Do not fabricate photorealistic faces of real people; use symbolic/editorial imagery for public figures and politics.
- Avoid generic handshake, conference audience, random office meeting, celebration, tourist, food, beach, wedding, or party visuals.
- No clickbait, disaster porn, gore, caricature, propaganda poster style, or misleading scene reconstruction.
- Premium digital news cover style, realistic lighting, sharp composition, editorial restraint.
""".strip()

    facts = "; ".join(item.draft_facts[:4])
    tags = ", ".join(item.draft_tags[:8])
    source_names = ", ".join(source.name for source in item.draft_sources[:2])
    return f"""
Create a 16:9 modern editorial hero image for a Turkish global news site named Anlık Haber.

Article category: {category}
Visual direction: {_category_visual_direction(category)}
Headline: {item.draft_title}
Description: {item.draft_description}
Key facts: {facts or '-'}
Tags: {tags or '-'}
Source context: {source_names or '-'}

Hard rules:
- The image must represent the specific news topic, not just generic category decoration.
- Do not copy or imitate any publisher/source image.
- Do not add readable text, letters, headlines, captions, UI text, watermarks, or logos.
- Do not fabricate photorealistic faces of real people; for politics use symbolic institutional imagery instead.
- Avoid generic handshake, conference audience, random office meeting, celebration, tourist, food, beach, wedding, or party visuals.
- No clickbait, disaster porn, gore, caricature, propaganda poster style, or misleading scene reconstruction.
- Premium digital news cover style, realistic lighting, sharp composition, editorial restraint.
""".strip()


def _generated_hero_candidates(slug: str) -> list[Path]:
    return sorted(GENERATED_HERO_DIR.glob(f"{slug}*"), key=lambda path: path.stat().st_mtime, reverse=True)


def _public_image_path(path: Path) -> str:
    return f"{GENERATED_HERO_PUBLIC_PREFIX}/{path.name}"


def _normalize_ai_hero_output(path: Path, slug: str) -> Path | None:
    if not path.exists() or path.stat().st_size <= 1024:
        return None

    output = GENERATED_HERO_DIR / f"{slug}.webp"
    if output.exists() and output.stat().st_size > 1024 and output.stat().st_mtime >= path.stat().st_mtime:
        return output

    command = [
        "magick",
        str(path),
        "-auto-orient",
        "-resize",
        f"{AI_HERO_WIDTH}x{AI_HERO_HEIGHT}^",
        "-gravity",
        "center",
        "-extent",
        f"{AI_HERO_WIDTH}x{AI_HERO_HEIGHT}",
        "-strip",
        "-quality",
        str(AI_HERO_QUALITY),
        str(output),
    ]
    try:
        subprocess.run(command, cwd=PROJECT_ROOT, text=True, capture_output=True, timeout=60, check=False)
    except Exception:
        return path

    if output.exists() and output.stat().st_size > 1024:
        if path != output and path.parent == GENERATED_HERO_DIR and path.name.startswith(slug):
            path.unlink(missing_ok=True)
        return output
    return path


def _pick_generated_output(slug: str, preferred_output: Path) -> Path | None:
    if preferred_output.exists() and preferred_output.stat().st_size > 1024:
        return preferred_output
    for candidate in _generated_hero_candidates(slug):
        if candidate.is_file() and candidate.stat().st_size > 1024:
            return candidate
    return None


def _ai_hero_image(item: QueueItem) -> str | None:
    global _LAST_AI_HERO_ERROR
    _LAST_AI_HERO_ERROR = None
    if get_env("NEWS_PIPELINE_DISABLE_AI_HERO", "0") in {"1", "true", "TRUE", "yes", "YES"}:
        _LAST_AI_HERO_ERROR = "NEWS_PIPELINE_DISABLE_AI_HERO is enabled"
        return None

    model = get_env("NEWS_PIPELINE_AI_HERO_MODEL", AI_HERO_DEFAULT_MODEL) or AI_HERO_DEFAULT_MODEL
    timeout_ms_raw = get_env("NEWS_PIPELINE_AI_HERO_TIMEOUT_MS", str(AI_HERO_TIMEOUT_MS))
    attempts_raw = get_env("NEWS_PIPELINE_AI_HERO_ATTEMPTS", str(AI_HERO_ATTEMPTS))
    try:
        timeout_ms = max(30_000, int(timeout_ms_raw or AI_HERO_TIMEOUT_MS))
    except ValueError:
        timeout_ms = AI_HERO_TIMEOUT_MS
    try:
        attempts = max(1, min(5, int(attempts_raw or AI_HERO_ATTEMPTS)))
    except ValueError:
        attempts = AI_HERO_ATTEMPTS

    slug = slugify(item.draft_title, lowercase=True) or "anlik-haber"
    GENERATED_HERO_DIR.mkdir(parents=True, exist_ok=True)
    output = GENERATED_HERO_DIR / f"{slug}.webp"

    if output.exists() and output.stat().st_size > 1024:
        return _public_image_path(output)

    prompt = _build_ai_hero_prompt(item)
    command = [
        "openclaw",
        "infer",
        "image",
        "generate",
        "--model",
        model,
        "--prompt",
        prompt,
        "--output",
        str(output),
        "--size",
        "1536x1024",
        "--output-format",
        "webp",
        "--timeout-ms",
        str(timeout_ms),
        "--json",
    ]

    for attempt in range(1, attempts + 1):
        try:
            result = subprocess.run(
                command,
                cwd=PROJECT_ROOT,
                text=True,
                capture_output=True,
                timeout=(timeout_ms / 1000) + 30,
                check=False,
            )
        except Exception as exc:
            _LAST_AI_HERO_ERROR = f"attempt {attempt}/{attempts}: {type(exc).__name__}: {exc}"
        else:
            if result.returncode == 0:
                generated = _pick_generated_output(slug, output)
                if generated:
                    normalized = _normalize_ai_hero_output(generated, slug)
                    return _public_image_path(normalized or generated)

                try:
                    payload = json.loads(result.stdout or "{}")
                except json.JSONDecodeError:
                    payload = {}
                for key in ("output", "path", "file", "filename"):
                    value = payload.get(key)
                    if isinstance(value, str):
                        candidate = Path(value)
                        if not candidate.is_absolute():
                            candidate = PROJECT_ROOT / candidate
                        if candidate.exists() and candidate.stat().st_size > 1024:
                            normalized = _normalize_ai_hero_output(candidate, slug)
                            return _public_image_path(normalized or candidate)
                _LAST_AI_HERO_ERROR = f"attempt {attempt}/{attempts}: command succeeded but no image file was found"
            else:
                stderr = (result.stderr or "").strip()
                stdout = (result.stdout or "").strip()
                detail = stderr or stdout or f"exit code {result.returncode}"
                _LAST_AI_HERO_ERROR = f"attempt {attempt}/{attempts}: {detail[:1200]}"

        if attempt < attempts:
            time.sleep(AI_HERO_RETRY_DELAY_SECONDS * attempt)

    return None


def _requires_ai_hero() -> bool:
    return get_env("NEWS_PIPELINE_REQUIRE_AI_HERO", REQUIRE_AI_HERO_DEFAULT) in {"1", "true", "TRUE", "yes", "YES"}


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


def _is_live_image_url(client: httpx.Client, url: str, cache: dict[str, bool] | None = None) -> bool:
    target = (url or "").strip()
    if not target:
        return False
    if cache is not None and target in cache:
        return cache[target]

    parsed = urlparse(target)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        if cache is not None:
            cache[target] = False
        return False

    methods = ("HEAD", "GET")
    ok = False
    for method in methods:
        try:
            response = client.request(method, target, headers={"Range": "bytes=0-0"} if method == "GET" else None)
            status = response.status_code
            content_type = (response.headers.get("content-type") or "").lower()
            if status < 400 and content_type.startswith("image/"):
                ok = True
                break
        except Exception:
            continue

    if cache is not None:
        cache[target] = ok
    return ok


def _default_hero_image(
    item: QueueItem,
    recent_images: set[str] | None = None,
    *,
    client: httpx.Client | None = None,
    url_health_cache: dict[str, bool] | None = None,
) -> str:
    category = item.draft_category or FALLBACK_CATEGORY
    choices = DEFAULT_HERO_IMAGES.get(category) or DEFAULT_HERO_IMAGES[FALLBACK_CATEGORY]
    recent_images = recent_images or set()

    prioritized: list[str] = []
    for candidate in choices:
        key = _image_key(candidate)
        if key and key not in recent_images:
            prioritized.append(candidate)
    prioritized.extend(candidate for candidate in choices if candidate not in prioritized)

    if client is not None:
        for candidate in prioritized:
            if _is_live_image_url(client, candidate, url_health_cache):
                return candidate

    return prioritized[0]


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
    if item.draft_category in {"Siyaset", "Bilim"}:
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
    ai_image = _ai_hero_image(item)
    if ai_image:
        return ai_image

    if _requires_ai_hero():
        detail = f" Last error: {_LAST_AI_HERO_ERROR}" if _LAST_AI_HERO_ERROR else ""
        raise RuntimeError(
            "AI hero generation failed; refusing to publish with stock Pexels/Unsplash fallback. "
            "Set NEWS_PIPELINE_REQUIRE_AI_HERO=0 only for an explicit emergency fallback."
            f"{detail}"
        )

    recent_images = _recent_hero_images()
    api_key = get_env("PEXELS_API_KEY")
    queries = _build_queries(item)

    try:
        best_score = float("-inf")
        best_image: str | None = None
        fallback_score = float("-inf")
        fallback_image: str | None = None
        url_health_cache: dict[str, bool] = {}
        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            if api_key:
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

            if best_image and best_score >= 4.0 and _is_live_image_url(client, best_image, url_health_cache):
                return best_image
            if fallback_image and fallback_score >= 4.0 and _is_live_image_url(client, fallback_image, url_health_cache):
                return fallback_image
            return _default_hero_image(item, recent_images, client=client, url_health_cache=url_health_cache)
    except Exception:
        return _default_hero_image(item, recent_images)
