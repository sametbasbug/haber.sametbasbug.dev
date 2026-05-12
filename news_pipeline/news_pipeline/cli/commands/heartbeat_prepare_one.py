from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
import json
from pathlib import Path
import re
from typing import Any

import typer
from rapidfuzz.fuzz import token_set_ratio

from news_pipeline.cli.commands.heartbeat_publish_one import _is_excluded_source_format, _run_pipeline_command, _source_is_fresh
from news_pipeline.editorial.autonomy import is_autopublish_candidate
from news_pipeline.models.article import NormalizedArticle
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore

MAX_PER_SOURCE = 3
MIN_CATEGORY_TARGETS = {"Bilim": 2, "Kültür": 2, "Ekonomi": 2, "Teknoloji": 3, "Siyaset": 3}
RISKY_HEADLINE_TERMS = {
    "lawsuit",
    "trial",
    "sues",
    "alleged",
    "allegations",
    "epstein",
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
EXCLUDED_NOTE_PREFIXES = (
    "unpublished:",
    "autopublish-withdrawn:",
    "manual-review:",
)
POSITIVE_HEADLINE_TERMS = {
    "nasa",
    "science",
    "research",
    "study",
    "climate",
    "space",
    "security",
    "cyber",
    "ai",
    "chip",
    "medicine",
    "energy",
    "market",
    "eu",
    "europe",
    "ukraine",
}


def _source_name(item: Any) -> str:
    return item.draft_sources[0].name if item.draft_sources else "-"


def _headline_text(root: Path, item: Any) -> str:
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    article = normalized_store.load(item.normalized_id)
    return article.title if article else item.draft_title


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _headline_has_term(headline: str, term: str) -> bool:
    if len(term) <= 3:
        return re.search(rf"\b{re.escape(term)}\b", headline) is not None
    return term in headline


def _board_score(root: Path, item: Any) -> tuple[float, list[str]]:
    headline = _normalized(_headline_text(root, item))
    category = item.draft_category or ""
    score = float(item.editorial_priority)
    reasons: list[str] = []
    for term in RISKY_HEADLINE_TERMS:
        if _headline_has_term(headline, term):
            score -= 0.10
            reasons.append(f"risk_penalty:{term}")
            break
    for term in POSITIVE_HEADLINE_TERMS:
        if _headline_has_term(headline, term):
            score += 0.035
            reasons.append(f"signal_boost:{term}")
            break
    if category in {"Bilim", "Kültür"}:
        score += 0.025
        reasons.append(f"category_boost:{category}")
    return round(score, 3), reasons


def _passes_basic_board_filter(root: Path, item: Any, max_source_age_hours: int) -> tuple[bool, str | None]:
    if item.status != "new":
        return False, "status is not new"
    if _is_excluded_source_format(item):
        return False, "excluded source format (podcast/liveblog)"
    fresh, stale_reason = _source_is_fresh(root, item, max_source_age_hours)
    if not fresh:
        return False, stale_reason
    if any(note.startswith(EXCLUDED_NOTE_PREFIXES) for note in item.notes):
        return False, "excluded by editorial note"
    headline = _normalized(_headline_text(root, item))
    if any(term in headline for term in {"podcast", "newsletter", "live updates", "puzzle", "quiz"}):
        return False, "blocked headline format"
    if any(term in headline for term in BLOCKED_BOARD_TERMS):
        return False, "blocked low-signal headline"
    return True, None


def _select_headline_board(root: Path, items: list[Any], limit: int, max_source_age_hours: int) -> tuple[list[Any], list[dict[str, Any]], dict[str, Any]]:
    eligible: list[tuple[Any, float, list[str]]] = []
    skipped: list[dict[str, Any]] = []
    for item in items:
        ok, reason = _passes_basic_board_filter(root, item, max_source_age_hours)
        if not ok:
            if len(skipped) < 12:
                skipped.append({"queueId": item.queue_id, "score": round(float(item.editorial_priority), 3), "title": item.draft_title, "reason": reason})
            continue
        board_score, reasons = _board_score(root, item)
        eligible.append((item, board_score, reasons))

    eligible.sort(key=lambda row: row[1], reverse=True)
    selected: list[Any] = []
    selected_ids: set[str] = set()
    selected_headlines: list[str] = []
    source_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()

    def add(item: Any) -> bool:
        if item.queue_id in selected_ids:
            return False
        headline = _normalized(_headline_text(root, item))
        if any(token_set_ratio(headline, existing) >= 88 for existing in selected_headlines):
            return False
        source = _source_name(item)
        if source_counts[source] >= MAX_PER_SOURCE:
            return False
        selected.append(item)
        selected_ids.add(item.queue_id)
        selected_headlines.append(headline)
        source_counts[source] += 1
        category_counts[item.draft_category or "-"] += 1
        return True

    for category, target in MIN_CATEGORY_TARGETS.items():
        for item, _, _ in eligible:
            if len(selected) >= limit or category_counts[category] >= target:
                break
            if item.draft_category == category:
                add(item)

    for item, _, _ in eligible:
        if len(selected) >= limit:
            break
        add(item)

    score_map = {item.queue_id: (score, reasons) for item, score, reasons in eligible}
    diagnostics = {
        "eligibleCount": len(eligible),
        "sourceCounts": dict(source_counts),
        "categoryCounts": dict(category_counts),
        "maxPerSource": MAX_PER_SOURCE,
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


def _candidate_reason(root: Path, item: Any, min_score: float, max_source_age_hours: int) -> tuple[bool, str | None]:
    if _is_excluded_source_format(item):
        return False, "excluded source format (podcast/liveblog)"
    fresh, stale_reason = _source_is_fresh(root, item, max_source_age_hours)
    if not fresh:
        return False, stale_reason
    return is_autopublish_candidate(item, min_score=min_score)


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
    steps: list[dict[str, Any]] = []
    if collect:
        args = ["collect"] + (["--full"] if full_collect else [])
        steps.append(_run_pipeline_command("collect", args, timeout=180))
    if process:
        steps.append(_run_pipeline_command("process", ["process"], timeout=180))
    if cleanup:
        steps.append(_run_pipeline_command("queue-cleanup", ["queue", "cleanup"], timeout=90))

    service = QueueService(root / "news_pipeline/data/queue")
    items = sorted(service.list_items(), key=lambda item: item.editorial_priority, reverse=True)
    selected, skipped, board_meta = _select_headline_board(root, items, limit, max_source_age_hours)
    score_map = board_meta["scores"]
    packs: list[dict[str, Any]] = []
    for item in selected:
        ok, reason = _candidate_reason(root, item, min_score, max_source_age_hours)
        payload = _article_payload(root, item)
        board_score, board_reasons = score_map.get(item.queue_id, (round(float(item.editorial_priority), 3), []))
        payload["boardScore"] = board_score
        payload["boardReasons"] = board_reasons
        payload["strictGate"] = {"passesNow": ok, "reason": reason}
        packs.append(payload)

    result = "ready" if packs else "no_candidates"
    payload = {
        "schemaVersion": 1,
        "command": "heartbeat prepare-one",
        "result": result,
        "instruction": "Headline board only. Asteria must choose promising headlines, fetch/read the selected article herself, write Turkish title/description/body/facts plus heroPrompt/heroAlt, apply them with `queue polish`, then run `heartbeat publish-one --execute --no-collect --json`. Python summaries and drafts are intentionally hidden to avoid anchoring.",
        "steps": steps,
        "candidates": packs,
        "board": board_meta["diagnostics"],
        "skippedSamples": skipped,
    }
    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        typer.echo(f"{result}: {len(packs)} candidate(s) prepared")
