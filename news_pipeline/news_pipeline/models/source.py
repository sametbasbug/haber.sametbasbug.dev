from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, HttpUrl


SourceKind = Literal["rss", "atom", "sitemap", "html"]


class SourceConfig(BaseModel):
    id: str
    name: str
    kind: SourceKind
    url: HttpUrl
    category_hints: list[str] = []
    enabled: bool = True
