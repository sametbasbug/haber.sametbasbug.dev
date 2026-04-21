from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha1
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class RawArticle(BaseModel):
    source_id: str
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    url: HttpUrl
    title: str
    summary: str = ""
    published_at: datetime | None = None
    image_url: HttpUrl | None = None
    raw_html_path: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class NormalizedArticle(BaseModel):
    id: str
    source_id: str
    source_name: str
    canonical_url: HttpUrl
    title: str
    summary: str = ""
    published_at: datetime | None = None
    image_url: HttpUrl | None = None
    content_snippet: str = ""
    category_hints: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    language: str = "tr"
    fingerprint: str
    cluster_key: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def build_fingerprint(cls, title: str, summary: str) -> str:
        key = f"{title.strip().lower()}::{summary.strip().lower()}"
        return sha1(key.encode("utf-8")).hexdigest()

    @classmethod
    def build_cluster_key(cls, title: str) -> str:
        normalized = " ".join(title.strip().lower().split())
        return sha1(normalized.encode("utf-8")).hexdigest()[:12]
