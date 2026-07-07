from __future__ import annotations

import json
from pathlib import Path

import typer

from news_pipeline.extractors.article_text import ArticleDetails, fetch_article_details
from news_pipeline.queue.service import QueueService


def queue_source_text_command(
    queue_id: str,
    source_index: int = typer.Option(0, "--source-index", min=0, help="Zero-based draft source index to read."),
    max_paragraphs: int = typer.Option(12, "--max-paragraphs", min=1, max=30, help="Maximum extracted paragraphs."),
    max_chars: int = typer.Option(6000, "--max-chars", min=500, max=12000, help="Maximum extracted text characters."),
    json_output: bool = typer.Option(False, "--json", help="Emit structured JSON."),
) -> None:
    if not isinstance(source_index, int):
        source_index = 0
    if not isinstance(max_paragraphs, int):
        max_paragraphs = 12
    if not isinstance(max_chars, int):
        max_chars = 6000
    if not isinstance(json_output, bool):
        json_output = False

    root = Path.cwd()
    service = QueueService(root / "news_pipeline/data/queue")
    item = service.store.load(queue_id)
    if item is None:
        raise typer.BadParameter(f"queue item not found: {queue_id}")
    if source_index >= len(item.draft_sources):
        raise typer.BadParameter(f"source index out of range: {source_index}")

    source = item.draft_sources[source_index]
    details = fetch_article_details(str(source.url), max_paragraphs=max_paragraphs, max_chars=max_chars)
    payload = {
        "queueId": item.queue_id,
        "title": item.draft_title,
        "source": {
            "index": source_index,
            "name": source.name,
            "url": str(source.url),
        },
        "publishedAt": details.published_at.isoformat() if details.published_at else None,
        "textChars": len(details.snippet),
        "text": details.snippet,
    }
    if json_output:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    print(f"queue_id: {payload['queueId']}")
    print(f"title: {payload['title']}")
    print(f"source: {source.name}: {source.url}")
    if payload["publishedAt"]:
        print(f"published_at: {payload['publishedAt']}")
    print(f"text_chars: {payload['textChars']}")
    print()
    print(details.snippet)
