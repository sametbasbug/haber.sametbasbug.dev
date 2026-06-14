from __future__ import annotations

import json
from pathlib import Path

import typer

from news_pipeline.models.queue import QueueItem
from news_pipeline.queue.service import QueueService
from news_pipeline.utils.logging import get_logger


VALID_CATEGORIES = {"Siyaset", "Ekonomi", "Teknoloji", "Bilim"}


def _parse_json_list(value: str | None, *, field_name: str) -> list[str] | None:
    if value is None:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise typer.BadParameter(f"{field_name} must be a JSON array of strings") from exc
    if not isinstance(parsed, list) or not all(isinstance(item, str) and item.strip() for item in parsed):
        raise typer.BadParameter(f"{field_name} must be a JSON array of non-empty strings")
    return [item.strip() for item in parsed]


def queue_polish_command(
    queue_id: str,
    title: str = typer.Option(..., "--title", help="Asteria-edited Turkish headline."),
    description: str = typer.Option(..., "--description", help="Asteria-edited Turkish deck/description."),
    category: str = typer.Option(..., "--category", help="One of: Siyaset, Ekonomi, Teknoloji, Bilim."),
    facts_json: str = typer.Option(..., "--facts-json", help="JSON array of 2-4 Asteria-edited Turkish fact sentences."),
    body: str = typer.Option(..., "--body", help="Asteria-written Turkish article body, without the sources section."),
    hero_prompt: str = typer.Option(..., "--hero-prompt", help="Asteria-written image generation prompt for the hero visual."),
    hero_alt: str = typer.Option(..., "--hero-alt", help="Short Turkish alt text for the generated hero image."),
    tags_json: str | None = typer.Option(None, "--tags-json", help="Optional JSON array of tags."),
    note: str = typer.Option("asteria-editorial-polish", "--note", help="Editorial note to attach to the queue item."),
    allow_duplicate_retry: bool = typer.Option(False, "--allow-duplicate-retry", help="Explicitly allow polishing an item previously rejected by the live duplicate gate."),
    json_output: bool = typer.Option(False, "--json", help="Emit JSON result."),
) -> None:
    """Apply Asteria's editorial rewrite to a queue item before publish-one."""
    # Typer injects real values through the CLI, but tests and internal callers
    # call the function directly. In that path, omitted typer.Option defaults are
    # OptionInfo objects; never let those leak into queue JSON.
    if not isinstance(note, str):
        note = "asteria-editorial-polish"
    if not isinstance(allow_duplicate_retry, bool):
        allow_duplicate_retry = False
    if not isinstance(json_output, bool):
        json_output = False

    logger = get_logger()
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    item = service.store.load(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    if item.status not in {"new", "reviewing", "approved"}:
        raise typer.BadParameter(f"queue item status is not editable: {item.status}")
    has_duplicate_rejection = any(existing_note.startswith("duplicate-publish-gate:") for existing_note in item.notes)
    if has_duplicate_rejection and not allow_duplicate_retry:
        raise typer.BadParameter("queue item has duplicate-publish-gate note; choose another candidate or explicitly reset with --allow-duplicate-retry")
    if has_duplicate_rejection and allow_duplicate_retry:
        item.notes = [existing_note for existing_note in item.notes if not existing_note.startswith("duplicate-publish-gate:")]
        reset_note = "duplicate-retry-reset: duplicate-publish-gate cleared by explicit queue polish retry"
        if reset_note not in item.notes:
            item.notes.append(reset_note)
    if category not in VALID_CATEGORIES:
        raise typer.BadParameter(f"invalid category: {category}")

    facts = _parse_json_list(facts_json, field_name="facts-json") or []
    tags = _parse_json_list(tags_json, field_name="tags-json") if tags_json is not None else item.draft_tags

    item.draft_title = title.strip()
    item.draft_description = description.strip()[:240]
    item.draft_category = category
    item.draft_facts = facts[:4]
    item.draft_body = body.strip()
    item.hero_prompt = hero_prompt.strip()
    item.hero_alt = hero_alt.strip()
    item.draft_tags = tags[:6]
    if note and note not in item.notes:
        item.notes.append(note)
    item.status = "new"
    service.save(item)

    payload = {
        "ok": True,
        "queueId": item.queue_id,
        "title": item.draft_title,
        "description": item.draft_description,
        "category": item.draft_category,
        "facts": item.draft_facts,
        "bodyChars": len(item.draft_body),
        "heroPromptChars": len(item.hero_prompt),
        "heroAlt": item.hero_alt,
        "tags": item.draft_tags,
    }
    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        logger.info(f"polished queue item: {item.queue_id}")
