from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


QueueStatus = Literal["new", "reviewing", "approved", "rejected", "published"]


class DraftSource(BaseModel):
    name: str
    url: HttpUrl


class QueueItem(BaseModel):
    queue_id: str
    status: QueueStatus = "new"
    normalized_id: str
    cluster_key: str = ""
    editorial_priority: float = 0.0
    draft_title: str
    draft_description: str
    draft_category: str | None = None
    draft_tags: list[str] = Field(default_factory=list)
    draft_sources: list[DraftSource] = Field(default_factory=list)
    draft_facts: list[str] = Field(default_factory=list)
    supporting_sources: list[DraftSource] = Field(default_factory=list)
    related_queue_ids: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    published_slug: str | None = None
