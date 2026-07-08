from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
import json
import os
from pathlib import Path
import re
from typing import Any

import typer
from rapidfuzz.fuzz import token_set_ratio

from news_pipeline.cli.commands.heartbeat_publish_one import _compact_step, _is_excluded_source_format, _run_pipeline_command, _source_is_fresh
from news_pipeline.cli.commands.publish import _assert_not_duplicate_live
from news_pipeline.editorial.autonomy import is_autopublish_candidate
from news_pipeline.editorial.topic_family import describe_family, recent_live_topic_family_counts, topic_families_for_text
from news_pipeline.models.article import NormalizedArticle
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore

MAX_PER_SOURCE = 3
DEFAULT_PREWARM_BOARD_PATH = "news_pipeline/data/heartbeat/prepared-board.json"
MIN_HEALTHY_BOARD_ELIGIBLE = 6
HOT_CATEGORY_RECENT_WINDOW = 3
HOT_CATEGORY_REPEAT_THRESHOLD = 2
HOT_CATEGORY_POLICY = "skip_target_fill_only"
HOT_CATEGORY_EXEMPT_CATEGORIES = {"Siyaset", "Ekonomi"}
HOT_SOURCE_RECENT_WINDOW = 3
HOT_SOURCE_BOARD_LIMIT = 1
MIN_CATEGORY_TARGETS = {"Siyaset": 3, "Ekonomi": 3, "Teknoloji": 3, "Bilim": 1}
MIN_CATEGORY_TARGET_SCORE = 0.68
SCIENCE_RECENT_WINDOW = 8
SCIENCE_RECENT_THRESHOLD = 2
SCIENCE_BOARD_LIMIT = 1
SCIENCE_RECENT_PENALTY = 0.16
SCIENCE_SPACE_RECENT_WINDOW = 5
SCIENCE_SPACE_RECENT_THRESHOLD = 2
SCIENCE_SPACE_BOARD_LIMIT = 1
RECENT_SOURCE_PENALTY_WINDOW = 5
RECENT_SOURCE_PENALTY_PER_ITEM = 0.07
RECENT_SOURCE_PENALTY_MAX = 0.18
RECENT_COMPANY_PENALTY_WINDOW = 10
RECENT_COMPANY_PENALTY_THRESHOLD = 2
RECENT_COMPANY_PENALTY_PER_ITEM = 0.09
RECENT_COMPANY_PENALTY_MAX = 0.27
RECENT_TOPIC_FAMILY_WINDOW = 8
RECENT_TOPIC_FAMILY_PENALTY_THRESHOLD = 1
RECENT_TOPIC_FAMILY_PENALTY_PER_ITEM = 0.12
RECENT_TOPIC_FAMILY_PENALTY_MAX = 0.48
MAX_BOARD_ITEMS_PER_TOPIC_FAMILY = 1
POLITICO_EU_BASELINE_PENALTY = 0.035
POLITICO_EU_RECENT_EXTRA_PENALTY = 0.04
RISKY_HEADLINE_TERMS = {
    "lawsuit",
    "trial",
    "sues",
    "alleged",
    "allegations",
    "arrests",
    "suspected",
    "spying",
    "epstein",
}
LOCALIZED_CRIME_TERMS = {
    "abducted",
    "abduction",
    "kidnap",
    "kidnapped",
    "kidnapping",
    "kaçırıldı",
    "kaçırılma",
    "kaçırılan",
}
NON_SECURITY_SIGNAL_PHRASES = {
    "social security",
}
BLOCKED_BOARD_TERMS = {
    "celebrity",
    "rod stewart",
    "ratbag",
    "opinion",
    "comment",
    "who is",
    "review",
    "world cup training grounds",
    "i am artemis",
    "eurovision entry",
    "music museum",
    "father ted",
}


def _selection_policy(min_score: float) -> dict[str, Any]:
    return {
        "manualReviewRequires": "Manual_review is allowed only when every candidate that needs only Asteria polish has a hard veto: duplicate live/topic, unreadable or stale source, excluded source format (live/podcast/opinion/video), fragile single-source personal accusation, or clearly low public value.",
        "strictGateInterpretation": "On prepare-one, strictGate.reason='missing Asteria editorial polish' is not a rejection reason; it means Asteria must read the source, write Turkish title/description/body/facts/hero brief, run queue polish, then publish-one. Treat these as polishable candidates, not failed candidates.",
        "emptyCycleBrake": {
            "enabled": True,
            "trigger": "If the previous active heartbeat/manual_review turn published nothing, do not wait for a perfect story on this turn.",
            "minimumCandidate": f"Publish the first readable, non-duplicate, non-excluded candidate with raw score >= {min_score:.2f} and reasonable public value after Asteria writes/polishes it.",
            "diversityOverride": "When the empty-cycle brake is active, recent category/source repetition is a tie-breaker, not a veto. Do not reject a clean Siyaset/Ekonomi item solely because recent posts were also Siyaset/Ekonomi or from the same broad source family.",
        },
        "diversityRole": "Category/source diversity is a ranking and tie-break signal. It must not override strictGate.passesNow candidates unless a hard veto is also present.",
    }
EXCLUDED_NOTE_PREFIXES = (
    "unpublished:",
    "autopublish-withdrawn:",
    "manual-review:",
    "duplicate-publish-gate:",
)
POSITIVE_HEADLINE_TERMS = {
    "climate",
    "security",
    "cyber",
    "ai",
    "chip",
    "medicine",
    "energy",
    "market",
    "eu",
    "europe",
}
SCIENCE_SPACE_TERMS = {
    "nasa",
    "mars",
    "hubble",
    "perseverance",
    "rover",
    "space",
    "telescope",
    "planet",
    "moon",
    "asteroid",
    "galaxy",
    "jupiter",
    "saturn",
}
HIGH_IMPORTANCE_SPACE_TERMS = {
    "breakthrough",
    "first",
    "discovers",
    "discovery",
    "launches",
    "landing",
    "mission failure",
    "crash",
    "crew",
    "earth-threatening",
}
COMPANY_PATTERNS: dict[str, re.Pattern[str]] = {
    "OpenAI": re.compile(r"\b(openai|chatgpt)\b", re.I),
    "Anthropic": re.compile(r"\b(anthropic|claude)\b", re.I),
    "Google": re.compile(r"\b(google|gemini)\b", re.I),
    "Meta": re.compile(r"\bmeta\b", re.I),
    "Microsoft": re.compile(r"\b(microsoft|linkedin)\b", re.I),
    "Nvidia": re.compile(r"\bnvidia\b", re.I),
    "Apple": re.compile(r"\bapple\b", re.I),
    "Amazon": re.compile(r"\b(amazon|aws)\b", re.I),
}


def _source_name(item: Any) -> str:
    return item.draft_sources[0].name if item.draft_sources else "-"


def _frontmatter_value(text: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}:\s*[\"']?(.*?)[\"']?\s*$", text)
    return match.group(1).strip() if match else ""


def _frontmatter_list_values(text: str, key: str) -> list[str]:
    match = re.search(rf"(?ms)^{re.escape(key)}:\s*\[(.*?)\]", text)
    if not match:
        return []
    return [value.strip().strip("\"'") for value in match.group(1).split(",") if value.strip()]


def _company_hits(text: str) -> set[str]:
    return {company for company, pattern in COMPANY_PATTERNS.items() if pattern.search(text or "")}


def _live_markdown_files(root: Path) -> list[Path]:
    return list((root / "src/content/equinoxHaber").glob("*.md"))


def _recent_live_posts(root: Path, limit: int = HOT_CATEGORY_RECENT_WINDOW) -> list[dict[str, str]]:
    rows: list[tuple[str, dict[str, str]]] = []
    for path in _live_markdown_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        pub_date = _frontmatter_value(text, "pubDate")
        category = _frontmatter_value(text, "category")
        title = _frontmatter_value(text, "title")
        description = _frontmatter_value(text, "description")
        tags = " ".join(_frontmatter_list_values(text, "tags"))
        sources = re.findall(r"(?m)^\s+- name:\s*[\"']?(.*?)[\"']?\s*$", text)
        source = sources[0].strip() if sources else ""
        companies = sorted(_company_hits(f"{title} {description} {tags}"))
        if pub_date:
            rows.append(
                (
                    pub_date,
                    {
                        "pubDate": pub_date,
                        "category": category,
                        "source": source,
                        "title": title,
                        "companies": ",".join(companies),
                    },
                )
            )
    rows.sort(key=lambda row: row[0], reverse=True)
    return [payload for _, payload in rows[:limit]]


def _recent_live_categories(root: Path, limit: int = HOT_CATEGORY_RECENT_WINDOW) -> list[str]:
    return [post["category"] for post in _recent_live_posts(root, limit) if post.get("category")]


def _hot_category(root: Path) -> str | None:
    categories = _recent_live_categories(root)
    if len(categories) < HOT_CATEGORY_RECENT_WINDOW:
        return None
    category, count = Counter(categories).most_common(1)[0]
    if category in HOT_CATEGORY_EXEMPT_CATEGORIES:
        return None
    return category if count >= HOT_CATEGORY_REPEAT_THRESHOLD else None


def _recent_live_sources(root: Path, limit: int = HOT_SOURCE_RECENT_WINDOW) -> list[str]:
    return [post["source"] for post in _recent_live_posts(root, limit) if post.get("source")]


def _hot_source(root: Path) -> str | None:
    sources = _recent_live_sources(root)
    if len(sources) < HOT_SOURCE_RECENT_WINDOW:
        return None
    first = sources[0]
    return first if first and all(source == first for source in sources) else None


def _science_space_pressure(root: Path) -> bool:
    recent = _recent_live_posts(root, limit=SCIENCE_SPACE_RECENT_WINDOW)
    count = 0
    for post in recent:
        text = _normalized(f"{post.get('category', '')} {post.get('source', '')} {post.get('title', '')}")
        if post.get("category") == "Bilim" and any(_headline_has_term(text, term) for term in SCIENCE_SPACE_TERMS):
            count += 1
    return count >= SCIENCE_SPACE_RECENT_THRESHOLD


def _science_pressure(root: Path) -> bool:
    recent = _recent_live_posts(root, limit=SCIENCE_RECENT_WINDOW)
    count = sum(1 for post in recent if post.get("category") == "Bilim")
    return count >= SCIENCE_RECENT_THRESHOLD


def _live_source_urls(root: Path) -> set[str]:
    urls: set[str] = set()
    for path in _live_markdown_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        urls.update(re.findall(r"(?m)^\s+url:\s*[\"']?([^\"'\s]+)", text))
    return {url.strip() for url in urls if url.strip()}


def _headline_text(root: Path, item: Any) -> str:
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    article = normalized_store.load(item.normalized_id)
    return article.title if article else item.draft_title


def _duplicate_probe_text(root: Path, item: Any) -> tuple[str, str]:
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    article = normalized_store.load(item.normalized_id)
    title_parts = [item.draft_title or ""]
    description_parts = [item.draft_description or ""]
    if article:
        title_parts.append(article.title or "")
        description_parts.extend([article.summary or "", article.content_snippet or ""])
    description_parts.extend(item.draft_facts or [])
    return " ".join(part for part in title_parts if part), " ".join(part for part in description_parts if part)


def _item_company_hits(root: Path, item: Any) -> set[str]:
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    article = normalized_store.load(item.normalized_id)
    article_text = ""
    if article:
        article_text = article.title or ""
    draft_text = " ".join(
        [
            item.draft_title or "",
            item.draft_description or "",
            article_text,
        ]
    )
    return _company_hits(draft_text)


def _item_topic_family_hits(root: Path, item: Any) -> set[str]:
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    article = normalized_store.load(item.normalized_id)
    text = " ".join(
        [
            item.draft_title or "",
            item.draft_description or "",
            " ".join(item.draft_tags or []),
            article.title if article else "",
            article.summary if article else "",
            " ".join(article.tags) if article else "",
        ]
    )
    return topic_families_for_text(text)


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _headline_has_term(headline: str, term: str) -> bool:
    if len(term) <= 3:
        return re.search(rf"\b{re.escape(term)}\b", headline) is not None
    return term in headline


def _board_score(
    root: Path,
    item: Any,
    *,
    science_pressure: bool = False,
    science_space_pressure: bool = False,
    recent_posts: list[dict[str, str]] | None = None,
) -> tuple[float, list[str]]:
    headline = _normalized(_headline_text(root, item))
    category = item.draft_category or ""
    source = _normalized(_source_name(item))
    score = float(item.editorial_priority)
    reasons: list[str] = []
    if source == "politico europe":
        score -= POLITICO_EU_BASELINE_PENALTY
        reasons.append("source_penalty:politico_europe_baseline")
    recent_source_count = sum(
        1
        for post in (recent_posts or [])[:RECENT_SOURCE_PENALTY_WINDOW]
        if _normalized(post.get("source", "")) == source
    )
    if recent_source_count:
        source_penalty = min(RECENT_SOURCE_PENALTY_MAX, recent_source_count * RECENT_SOURCE_PENALTY_PER_ITEM)
        if source == "politico europe":
            source_penalty += POLITICO_EU_RECENT_EXTRA_PENALTY
        score -= source_penalty
        reasons.append(f"recency_penalty:source_repeat:{recent_source_count}")
    company_hits = _item_company_hits(root, item)
    if company_hits:
        recent_company_counts: Counter[str] = Counter()
        for post in (recent_posts or [])[:RECENT_COMPANY_PENALTY_WINDOW]:
            for company in (post.get("companies") or "").split(","):
                if company:
                    recent_company_counts[company] += 1
        repeat_counts = {company: recent_company_counts[company] for company in company_hits if recent_company_counts[company] >= RECENT_COMPANY_PENALTY_THRESHOLD}
        if repeat_counts:
            strongest_repeat = max(repeat_counts.values())
            company_penalty = min(RECENT_COMPANY_PENALTY_MAX, strongest_repeat * RECENT_COMPANY_PENALTY_PER_ITEM)
            score -= company_penalty
            repeated = "+".join(sorted(repeat_counts))
            reasons.append(f"recency_penalty:company_repeat:{repeated}:{strongest_repeat}")
    family_hits = _item_topic_family_hits(root, item)
    if family_hits:
        recent_family_counts = recent_live_topic_family_counts(
            root / "src/content/equinoxHaber",
            limit=RECENT_TOPIC_FAMILY_WINDOW,
        )
        repeat_counts = {
            family: recent_family_counts[family]
            for family in family_hits
            if recent_family_counts[family] >= RECENT_TOPIC_FAMILY_PENALTY_THRESHOLD
        }
        if repeat_counts:
            strongest_repeat = max(repeat_counts.values())
            family_penalty = min(RECENT_TOPIC_FAMILY_PENALTY_MAX, strongest_repeat * RECENT_TOPIC_FAMILY_PENALTY_PER_ITEM)
            score -= family_penalty
            repeated = "+".join(describe_family(family) for family in sorted(repeat_counts))
            reasons.append(f"recency_penalty:topic_family_repeat:{repeated}:{strongest_repeat}")
    for term in RISKY_HEADLINE_TERMS:
        if _headline_has_term(headline, term):
            score -= 0.10
            reasons.append(f"risk_penalty:{term}")
            break
    localized_crime = any(_headline_has_term(headline, term) for term in LOCALIZED_CRIME_TERMS)
    incidental_security = any(phrase in headline for phrase in NON_SECURITY_SIGNAL_PHRASES)
    if localized_crime:
        score -= 0.06
        reasons.append("risk_penalty:localized_crime")
    for term in POSITIVE_HEADLINE_TERMS:
        if _headline_has_term(headline, term) and not (term == "security" and (localized_crime or incidental_security)):
            score += 0.035
            reasons.append(f"signal_boost:{term}")
            break
    if science_pressure and category == "Bilim":
        score -= SCIENCE_RECENT_PENALTY
        reasons.append("recency_penalty:science_saturation")
    is_space_science = category == "Bilim" and (
        any(_headline_has_term(headline, term) for term in SCIENCE_SPACE_TERMS)
        or any(_headline_has_term(source, term) for term in {"nasa"})
    )
    is_high_importance_space = any(_headline_has_term(headline, term) for term in HIGH_IMPORTANCE_SPACE_TERMS)
    if science_space_pressure and is_space_science and not is_high_importance_space:
        score -= 0.12
        reasons.append("recency_penalty:space_science_saturation")
    return round(score, 3), reasons


def _passes_basic_board_filter(root: Path, item: Any, max_source_age_hours: int, live_urls: set[str] | None = None) -> tuple[bool, str | None]:
    if item.status != "new":
        return False, "status is not new"
    if _is_excluded_source_format(item):
        return False, "excluded source format (podcast/liveblog)"
    live_urls = live_urls or set()
    if any(str(source.url) in live_urls for source in item.draft_sources):
        return False, "source already published"
    fresh, stale_reason = _source_is_fresh(root, item, max_source_age_hours)
    if not fresh:
        return False, stale_reason
    if any(note.startswith(EXCLUDED_NOTE_PREFIXES) for note in item.notes):
        return False, "excluded by editorial note"
    if round(float(item.editorial_priority), 3) < MIN_CATEGORY_TARGET_SCORE:
        return False, f"score below threshold ({float(item.editorial_priority):.3f})"
    headline = _normalized(_headline_text(root, item))
    if any(term in headline for term in {"podcast", "newsletter", "live updates", "latest news bulletin", "puzzle", "quiz"}):
        return False, "blocked headline format"
    if any(term in headline for term in BLOCKED_BOARD_TERMS):
        return False, "blocked low-signal headline"
    try:
        probe_title, probe_description = _duplicate_probe_text(root, item)
        _assert_not_duplicate_live(
            root / "src/content/equinoxHaber",
            probe_title,
            probe_description,
            {str(source.url) for source in item.draft_sources + item.supporting_sources},
            f"prepare-probe-{item.queue_id}",
            enforce_topic_family_saturation=False,
        )
    except typer.BadParameter:
        return False, "near-duplicate live event"
    return True, None


def _select_headline_board(root: Path, items: list[Any], limit: int, max_source_age_hours: int) -> tuple[list[Any], list[dict[str, Any]], dict[str, Any]]:
    hot_category = _hot_category(root)
    hot_source = _hot_source(root)
    science_pressure = _science_pressure(root)
    science_space_pressure = _science_space_pressure(root)
    recent_posts = _recent_live_posts(
        root,
        limit=max(
            SCIENCE_RECENT_WINDOW,
            SCIENCE_SPACE_RECENT_WINDOW,
            HOT_CATEGORY_RECENT_WINDOW,
            HOT_SOURCE_RECENT_WINDOW,
            RECENT_COMPANY_PENALTY_WINDOW,
        ),
    )
    live_urls = _live_source_urls(root)
    eligible: list[tuple[Any, float, list[str]]] = []
    skipped: list[dict[str, Any]] = []
    for item in items:
        ok, reason = _passes_basic_board_filter(root, item, max_source_age_hours, live_urls)
        if not ok:
            if len(skipped) < 12:
                skipped.append({"queueId": item.queue_id, "score": round(float(item.editorial_priority), 3), "title": item.draft_title, "reason": reason})
            continue
        board_score, reasons = _board_score(root, item, science_pressure=science_pressure, science_space_pressure=science_space_pressure, recent_posts=recent_posts)
        eligible.append((item, board_score, reasons))

    eligible.sort(key=lambda row: row[1], reverse=True)
    selected: list[Any] = []
    selected_ids: set[str] = set()
    selected_headlines: list[str] = []
    source_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    family_counts: Counter[str] = Counter()

    def add(item: Any) -> bool:
        if item.queue_id in selected_ids:
            return False
        headline = _normalized(_headline_text(root, item))
        if any(token_set_ratio(headline, existing) >= 88 for existing in selected_headlines):
            return False
        source = _source_name(item)
        if source_counts[source] >= MAX_PER_SOURCE:
            return False
        if hot_source and source == hot_source and source_counts[hot_source] >= HOT_SOURCE_BOARD_LIMIT:
            return False
        if science_pressure and item.draft_category == "Bilim" and category_counts["Bilim"] >= SCIENCE_BOARD_LIMIT:
            return False
        item_families = _item_topic_family_hits(root, item)
        if item_families and any(family_counts[family] >= MAX_BOARD_ITEMS_PER_TOPIC_FAMILY for family in item_families):
            return False
        headline = _normalized(_headline_text(root, item))
        is_space_science = item.draft_category == "Bilim" and (
            any(_headline_has_term(headline, term) for term in SCIENCE_SPACE_TERMS)
            or any(_headline_has_term(_normalized(source), term) for term in {"nasa"})
        )
        if science_space_pressure and is_space_science and category_counts["Bilim"] >= SCIENCE_SPACE_BOARD_LIMIT:
            return False
        selected.append(item)
        selected_ids.add(item.queue_id)
        selected_headlines.append(headline)
        source_counts[source] += 1
        category_counts[item.draft_category or "-"] += 1
        family_counts.update(item_families)
        return True

    for category, target in MIN_CATEGORY_TARGETS.items():
        if category == hot_category:
            continue
        for item, board_score, _ in eligible:
            if len(selected) >= limit or category_counts[category] >= target:
                break
            if item.draft_category == category and board_score >= MIN_CATEGORY_TARGET_SCORE:
                add(item)

    for item, _, _ in eligible:
        if len(selected) >= limit:
            break
        add(item)

    score_map = {item.queue_id: (score, reasons) for item, score, reasons in eligible}
    selected.sort(key=lambda item: score_map.get(item.queue_id, (round(float(item.editorial_priority), 3), []))[0], reverse=True)
    diagnostics = {
        "eligibleCount": len(eligible),
        "sourceCounts": dict(source_counts),
        "categoryCounts": dict(category_counts),
        "topicFamilyCounts": dict(family_counts),
        "maxBoardItemsPerTopicFamily": MAX_BOARD_ITEMS_PER_TOPIC_FAMILY,
        "recentPosts": recent_posts,
        "recentCategories": [post.get("category", "") for post in recent_posts],
        "recentSources": [post.get("source", "") for post in recent_posts],
        "recentCompanies": [post.get("companies", "") for post in recent_posts],
        "recentCompanyPenaltyWindow": RECENT_COMPANY_PENALTY_WINDOW,
        "recentCompanyPenaltyThreshold": RECENT_COMPANY_PENALTY_THRESHOLD,
        "recentTopicFamilyCounts": dict(recent_live_topic_family_counts(root / "src/content/equinoxHaber", limit=RECENT_TOPIC_FAMILY_WINDOW)),
        "recentTopicFamilyWindow": RECENT_TOPIC_FAMILY_WINDOW,
        "recentTopicFamilyPenaltyThreshold": RECENT_TOPIC_FAMILY_PENALTY_THRESHOLD,
        "hotCategory": hot_category,
        "hotCategoryRepeatThreshold": HOT_CATEGORY_REPEAT_THRESHOLD,
        "hotCategoryExemptCategories": sorted(HOT_CATEGORY_EXEMPT_CATEGORIES),
        "hotCategoryBoardLimit": None,
        "hotCategoryPolicy": HOT_CATEGORY_POLICY if hot_category else None,
        "hotSource": hot_source,
        "hotSourceBoardLimit": HOT_SOURCE_BOARD_LIMIT if hot_source else None,
        "sciencePressure": science_pressure,
        "scienceBoardLimit": SCIENCE_BOARD_LIMIT if science_pressure else None,
        "scienceSpacePressure": science_space_pressure,
        "scienceSpaceBoardLimit": SCIENCE_SPACE_BOARD_LIMIT if science_space_pressure else None,
        "maxPerSource": MAX_PER_SOURCE,
        "minCategoryTargetScore": MIN_CATEGORY_TARGET_SCORE,
    }
    return selected, skipped, {"scores": score_map, "diagnostics": diagnostics}


def _article_payload(root: Path, item: Any) -> dict[str, Any]:
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    article = normalized_store.load(item.normalized_id)
    source_age_hours = None
    if article and article.published_at:
        source_age_hours = round((datetime.now(UTC) - article.published_at.astimezone(UTC)).total_seconds() / 3600, 2)
    return {
        "queueId": item.queue_id,
        "status": item.status,
        "score": round(float(item.editorial_priority), 3),
        "source": {
            "name": article.source_name if article else (item.draft_sources[0].name if item.draft_sources else ""),
            "url": str(article.canonical_url if article else (item.draft_sources[0].url if item.draft_sources else "")),
            "publishedAt": article.published_at.isoformat() if article and article.published_at else None,
            "ageHours": source_age_hours,
        },
        "headline": article.title if article else item.draft_title,
    }


def _candidate_reason(root: Path, item: Any, min_score: float, max_source_age_hours: int, board_score: float | None = None) -> tuple[bool, str | None]:
    if _is_excluded_source_format(item):
        return False, "excluded source format (podcast/liveblog)"
    fresh, stale_reason = _source_is_fresh(root, item, max_source_age_hours)
    if not fresh:
        return False, stale_reason
    # Keep the headline-board diagnostic aligned with the actual publish rail.
    # Board score is useful ranking context, but the final gate still enforces
    # the raw editorial score floor. Do not tell Asteria a low-raw-score item
    # "passes now" just because a board boost made it look attractive.
    return is_autopublish_candidate(item, min_score=min_score)


def _collect_step_stats(steps: list[dict[str, Any]]) -> dict[str, int] | None:
    for step in reversed(steps):
        if step.get("name") != "collect":
            continue
        text = " ".join(str(step.get(key) or "") for key in ("stdout", "stderr", "error"))
        stats: dict[str, int] = {}
        for key in ("sources_collected", "items", "skipped_cadence", "failed"):
            match = re.search(rf"{key}=(\d+)", text)
            if match:
                stats[key] = int(match.group(1))
        return stats or None
    return None


def _run_prepare_pipeline(collect: bool, process: bool, cleanup: bool, full_collect: bool, *, suffix: str = "") -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    if collect:
        args = ["collect"] + (["--full"] if full_collect else [])
        steps.append(_run_pipeline_command(f"collect{suffix}", args, timeout=360))
    if process:
        steps.append(_run_pipeline_command(f"process{suffix}", ["process"], timeout=420))
    if cleanup:
        steps.append(_run_pipeline_command(f"queue-cleanup{suffix}", ["queue", "cleanup"], timeout=120))
    return steps


def _build_editorial_packs(root: Path, *, min_score: float, max_source_age_hours: int, limit: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    service = QueueService(root / "news_pipeline/data/queue")
    items = sorted(service.list_items(), key=lambda item: item.editorial_priority, reverse=True)
    selected, skipped, board_meta = _select_headline_board(root, items, limit, max_source_age_hours)
    score_map = board_meta["scores"]
    packs: list[dict[str, Any]] = []
    for item in selected:
        payload = _article_payload(root, item)
        board_score, board_reasons = score_map.get(item.queue_id, (round(float(item.editorial_priority), 3), []))
        ok, reason = _candidate_reason(root, item, min_score, max_source_age_hours, board_score=board_score)
        if not ok and reason and reason.startswith("score below threshold"):
            skipped.append({
                "queueId": item.queue_id,
                "headline": payload.get("headline", ""),
                "score": round(float(item.editorial_priority), 3),
                "boardScore": board_score,
                "reason": reason,
            })
            continue
        payload["boardScore"] = board_score
        payload["boardReasons"] = board_reasons
        payload["strictGate"] = {"passesNow": ok, "reason": reason}
        packs.append(payload)
    return packs, skipped, board_meta


def _full_collect_retry_reason(
    *,
    collect: bool,
    full_collect: bool,
    steps: list[dict[str, Any]],
    packs: list[dict[str, Any]],
    board_meta: dict[str, Any],
) -> str | None:
    if not collect or full_collect:
        return None
    stats = _collect_step_stats(steps)
    if not stats:
        return None
    eligible_count = int(board_meta["diagnostics"].get("eligibleCount") or 0)
    if stats.get("sources_collected", 0) == 0:
        if packs and eligible_count >= MIN_HEALTHY_BOARD_ELIGIBLE:
            return None
        return "cadence produced zero collected sources"
    if not packs and stats.get("skipped_cadence", 0) > 0:
        return "no board candidates after cadence-limited collect"
    if eligible_count < MIN_HEALTHY_BOARD_ELIGIBLE and stats.get("skipped_cadence", 0) > 0:
        return f"thin board ({eligible_count} eligible < {MIN_HEALTHY_BOARD_ELIGIBLE}) after cadence-limited collect"
    return None


def _prepare_one_payload(
    root: Path,
    *,
    collect: bool,
    process: bool,
    cleanup: bool,
    full_collect: bool,
    min_score: float,
    max_source_age_hours: int,
    limit: int,
    command: str = "heartbeat prepare-one",
) -> dict[str, Any]:
    steps = _run_prepare_pipeline(collect, process, cleanup, full_collect)
    packs, skipped, board_meta = _build_editorial_packs(
        root,
        min_score=min_score,
        max_source_age_hours=max_source_age_hours,
        limit=limit,
    )

    retry_reason = _full_collect_retry_reason(
        collect=collect,
        full_collect=full_collect,
        steps=steps,
        packs=packs,
        board_meta=board_meta,
    )
    if retry_reason:
        retry_steps = _run_prepare_pipeline(True, process, cleanup, True, suffix="-full-retry")
        steps.extend(retry_steps)
        packs, skipped, board_meta = _build_editorial_packs(
            root,
            min_score=min_score,
            max_source_age_hours=max_source_age_hours,
            limit=limit,
        )

    result = "ready" if packs else "no_candidates"
    return {
        "schemaVersion": 1,
        "command": command,
        "result": result,
        "instruction": "Headline board only. Asteria must choose promising headlines, fetch/read the selected article herself, write Turkish title/description/body/facts plus heroPrompt/heroAlt, apply them with `queue polish`, then run `heartbeat publish-one --execute --no-collect --json`. Python summaries and drafts are intentionally hidden to avoid anchoring.",
        "steps": [_compact_step(step) for step in steps],
        "candidates": packs,
        "board": board_meta["diagnostics"],
        "selectionPolicy": _selection_policy(min_score),
        "recovery": {
            "fullCollectRetry": bool(retry_reason),
            "reason": retry_reason,
            "minHealthyBoardEligible": MIN_HEALTHY_BOARD_ELIGIBLE,
        },
        "skippedSamples": skipped,
    }


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_path.replace(path)


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _board_read_payload(path: Path, *, max_age_minutes: int) -> dict[str, Any]:
    now = datetime.now(UTC)
    base: dict[str, Any] = {
        "schemaVersion": 1,
        "command": "heartbeat board-read",
        "artifactPath": str(path),
        "readAt": now.isoformat(),
        "fresh": False,
    }
    if not path.exists():
        return {**base, "result": "missing", "reason": "prewarm board artifact not found"}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {**base, "result": "invalid", "reason": f"invalid JSON: {exc.msg}"}
    if not isinstance(payload, dict):
        return {**base, "result": "invalid", "reason": "prewarm board artifact is not a JSON object"}
    if payload.get("command") != "heartbeat board-prewarm":
        return {**base, "result": "invalid", "reason": f"unexpected command: {payload.get('command')}"}

    prewarm = payload.get("prewarm") if isinstance(payload.get("prewarm"), dict) else {}
    generated_at = _parse_datetime(prewarm.get("generatedAt") if prewarm else None)
    expires_at = _parse_datetime(prewarm.get("expiresAt") if prewarm else None)
    if generated_at is None:
        return {**base, "result": "invalid", "reason": "missing prewarm.generatedAt"}
    if now - generated_at > timedelta(minutes=max_age_minutes):
        return {
            **base,
            "result": "stale",
            "reason": f"prewarm board older than {max_age_minutes}m",
            "generatedAt": generated_at.isoformat(),
        }
    if expires_at is not None and now > expires_at:
        return {
            **base,
            "result": "stale",
            "reason": "prewarm board expired",
            "generatedAt": generated_at.isoformat(),
            "expiresAt": expires_at.isoformat(),
        }

    payload["consumerRead"] = {
        "command": "heartbeat board-read",
        "readAt": now.isoformat(),
        "fresh": True,
        "maxAgeMinutes": max_age_minutes,
    }
    return payload


def prepare_one_command(
    collect: bool = typer.Option(True, "--collect/--no-collect", help="Run collect before preparing the editorial pack."),
    process: bool = typer.Option(True, "--process/--no-process", help="Run process before preparing the editorial pack."),
    cleanup: bool = typer.Option(True, "--cleanup/--no-cleanup", help="Run queue cleanup before preparing the editorial pack."),
    full_collect: bool = typer.Option(False, "--full-collect", help="Bypass source cadence during collect."),
    min_score: float = typer.Option(0.68, "--min-score", help="Strict publish threshold used for diagnostics."),
    max_source_age_hours: int = typer.Option(24, "--max-source-age-hours", help="Maximum source age for headline board freshness and auto publish diagnostics."),
    limit: int = typer.Option(20, "--limit", help="How many headline candidates to return."),
    json_output: bool = typer.Option(False, "--json", help="Emit machine-readable JSON."),
) -> None:
    """Prepare a compact editorial pack for Asteria to rewrite/review before publishing.

    This command does technical prep only. It intentionally does not publish and does
    not replace Asteria's editorial judgment.
    """
    root = Path.cwd()
    payload = _prepare_one_payload(
        root,
        collect=collect,
        process=process,
        cleanup=cleanup,
        full_collect=full_collect,
        min_score=min_score,
        max_source_age_hours=max_source_age_hours,
        limit=limit,
    )
    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        typer.echo(f"{payload['result']}: {len(payload['candidates'])} candidate(s) prepared")


def board_read_command(
    input_path: Path = typer.Option(Path(DEFAULT_PREWARM_BOARD_PATH), "--input", "-i", help="Prewarmed board artifact path."),
    max_age_minutes: int = typer.Option(15, "--max-age-minutes", min=1, help="Maximum acceptable board age."),
    json_output: bool = typer.Option(False, "--json", help="Emit machine-readable JSON."),
) -> None:
    """Read a prewarmed board only when it is fresh enough for Asteria."""
    root = Path.cwd()
    path = input_path if input_path.is_absolute() else root / input_path
    payload = _board_read_payload(path, max_age_minutes=max_age_minutes)
    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    if payload.get("fresh"):
        typer.echo(f"{payload.get('result')}: {len(payload.get('candidates') or [])} fresh candidate(s) from {path}")
    else:
        typer.echo(f"{payload.get('result')}: {payload.get('reason')} ({path})")


def board_prewarm_command(
    collect: bool = typer.Option(True, "--collect/--no-collect", help="Run collect before preparing the prewarmed board."),
    process: bool = typer.Option(True, "--process/--no-process", help="Run process before preparing the prewarmed board."),
    cleanup: bool = typer.Option(True, "--cleanup/--no-cleanup", help="Run queue cleanup before preparing the prewarmed board."),
    full_collect: bool = typer.Option(False, "--full-collect", help="Bypass source cadence during collect."),
    min_score: float = typer.Option(0.68, "--min-score", help="Strict publish threshold used for diagnostics."),
    max_source_age_hours: int = typer.Option(24, "--max-source-age-hours", help="Maximum source age for headline board freshness and auto publish diagnostics."),
    limit: int = typer.Option(6, "--limit", help="How many headline candidates to return."),
    output: Path = typer.Option(Path(DEFAULT_PREWARM_BOARD_PATH), "--output", "-o", help="Prewarmed board artifact path."),
    max_age_minutes: int = typer.Option(15, "--max-age-minutes", min=1, help="Freshness window consumers should enforce."),
    json_output: bool = typer.Option(False, "--json", help="Emit the written payload as JSON."),
) -> None:
    """Precompute Asteria's headline board outside the model session.

    The output is written atomically so the scheduled Asteria run never consumes
    a partially-written board.
    """
    root = Path.cwd()
    started_at = datetime.now(UTC)
    payload = _prepare_one_payload(
        root,
        collect=collect,
        process=process,
        cleanup=cleanup,
        full_collect=full_collect,
        min_score=min_score,
        max_source_age_hours=max_source_age_hours,
        limit=limit,
        command="heartbeat board-prewarm",
    )
    generated_at = datetime.now(UTC)
    expires_at = generated_at + timedelta(minutes=max_age_minutes)
    output_path = output if output.is_absolute() else root / output
    payload["prewarm"] = {
        "artifactPath": str(output_path),
        "startedAt": started_at.isoformat(),
        "generatedAt": generated_at.isoformat(),
        "expiresAt": expires_at.isoformat(),
        "maxAgeMinutes": max_age_minutes,
        "consumer": "Asteria isolated cron",
    }
    _atomic_write_json(output_path, payload)

    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        typer.echo(f"{payload['result']}: wrote {len(payload['candidates'])} candidate(s) to {output_path}")
