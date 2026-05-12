from __future__ import annotations

import json
from pathlib import Path

import typer

from news_pipeline.models.queue import QueueItem
from news_pipeline.queue.service import QueueService
from news_pipeline.utils.logging import get_logger


VALID_CATEGORIES = {"Siyaset", "Ekonomi", "Teknoloji", "Bilim", "Kültür"}


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
    category: str = typer.Option(..., "--category", help="One of: Siyaset, Ekonomi, Teknoloji, Bilim, Kültür."),
    facts_json: str = typer.Option(..., "--facts-json", help="JSON array of 2-4 Asteria-edited Turkish fact sentences."),
    tags_json: str | None = typer.Option(None, "--tags-json", help="Optional JSON array of tags."),
    note: str = typer.Option("asteria-editorial-polish", "--note", help="Editorial note to attach to the queue item."),
    json_output: bool = typer.Option(False, "--json", help="Emit JSON result."),
) -> None:
    """Apply Asteria's editorial rewrite to a queue item before publish-one."""
    logger = get_logger()
    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    item = service.store.load(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    if item.status not in {"new", "reviewing", "approved"}:
        raise typer.BadParameter(f"queue item status is not editable: {item.status}")
    if category not in VALID_CATEGORIES:
        raise typer.BadParameter(f"invalid category: {category}")

    facts = _parse_json_list(facts_json, field_name="facts-json") or []
    tags = _parse_json_list(tags_json, field_name="tags-json") if tags_json is not None else item.draft_tags

    item.draft_title = title.strip()
    item.draft_description = description.strip()[:240]
    item.draft_category = category
    item.draft_facts = facts[:4]
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
        "tags": item.draft_tags,
    }
    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        logger.info(f"polished queue item: {item.queue_id}")
