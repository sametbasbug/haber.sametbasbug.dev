from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import unicodedata


# Coarse editorial topic families used to prevent short-window pileups.
# Keep this deliberately conservative: these are not duplicate detectors; they
# are saturation signals for recurring public-story clusters.
TOPIC_FAMILY_LABELS: dict[str, str] = {
    "ukraine_russia_war": "Ukraine/Russia war",
    "anthropic_models": "Anthropic/Claude models",
    "openai": "OpenAI/ChatGPT",
    "spacex": "SpaceX/Starship",
    "google_ai": "Google/Gemini AI",
    "meta_platforms": "Meta/WhatsApp/Instagram",
    "nvidia_ai_chips": "Nvidia/AI chips",
}

TOPIC_FAMILY_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "ukraine_russia_war": (
        re.compile(r"\b(ukraine|ukrainian|ukrayna|ukraynada|ukraynanin|kyiv|kiev|zelensky|zelenski)\b", re.I),
        re.compile(r"\b(russia|russian|rusya|rusyanin|putin|kremlin|moskova|moscow)\b.*\b(war|savas|invasion|isgal|ukraine|ukrayna)\b", re.I),
        re.compile(r"\b(war|savas|invasion|isgal|ukraine|ukrayna)\b.*\b(russia|russian|rusya|rusyanin|putin|kremlin|moskova|moscow)\b", re.I),
    ),
    "anthropic_models": (re.compile(r"\b(anthropic|claude|fable|mythos)\b", re.I),),
    "openai": (re.compile(r"\b(openai|chatgpt|sora|sam altman)\b", re.I),),
    "spacex": (re.compile(r"\b(spacex|starship)\b", re.I),),
    "google_ai": (re.compile(r"\b(google|gemini)\b", re.I),),
    "meta_platforms": (re.compile(r"\b(meta|whatsapp|instagram|facebook)\b", re.I),),
    "nvidia_ai_chips": (re.compile(r"\b(nvidia|ai chip|gpu|gpus)\b", re.I),),
}


def normalize_topic_text(value: str) -> str:
    value = (value or "").lower().replace("ı", "i").replace("’", "'")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^0-9a-zçğıöşü]+", " ", value)
    return " ".join(value.split())


def topic_families_for_text(value: str) -> set[str]:
    normalized = normalize_topic_text(value)
    families: set[str] = set()
    for family, patterns in TOPIC_FAMILY_PATTERNS.items():
        if any(pattern.search(normalized) for pattern in patterns):
            families.add(family)
    return families


def describe_family(family: str) -> str:
    return TOPIC_FAMILY_LABELS.get(family, family.replace("_", " "))


def _frontmatter(text: str) -> str:
    match = re.match(r"^---\n(.*?)\n---", text, re.S)
    return match.group(1) if match else ""


def _frontmatter_value(frontmatter: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}:\s*[\"']?(.*?)[\"']?\s*$", frontmatter)
    return match.group(1).strip() if match else ""


def _frontmatter_list_values(frontmatter: str, key: str) -> list[str]:
    match = re.search(rf"(?ms)^{re.escape(key)}:\s*\[(.*?)\]", frontmatter)
    if not match:
        return []
    return [value.strip().strip("\"'") for value in match.group(1).split(",") if value.strip()]


def recent_live_topic_family_counts(content_root: Path, *, limit: int = 5) -> Counter[str]:
    rows: list[tuple[str, set[str]]] = []
    for path in content_root.glob("*.md"):
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        frontmatter = _frontmatter(text)
        pub_date = _frontmatter_value(frontmatter, "pubDate")
        if not pub_date:
            continue
        topic_text = " ".join(
            [
                _frontmatter_value(frontmatter, "title"),
                _frontmatter_value(frontmatter, "description"),
                " ".join(_frontmatter_list_values(frontmatter, "tags")),
            ]
        )
        rows.append((pub_date, topic_families_for_text(topic_text)))
    rows.sort(key=lambda row: row[0], reverse=True)
    counts: Counter[str] = Counter()
    for _, families in rows[:limit]:
        counts.update(families)
    return counts
