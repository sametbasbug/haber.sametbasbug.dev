from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


SourceKind = Literal["rss", "atom", "sitemap", "html"]
SourceQuality = Literal["trusted", "usable", "noisy", "restricted"]


class SourceConfig(BaseModel):
    id: str
    name: str
    kind: SourceKind
    url: HttpUrl
    category_hints: list[str] = []
    enabled: bool = True
    cadence: str = "hourly"
    max_items: int | None = Field(default=None, ge=1)
    fetch_snippets: bool = True
    snippet_limit: int | None = Field(default=None, ge=0)
    source_quality: SourceQuality = "usable"
