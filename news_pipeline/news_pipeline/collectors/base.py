from __future__ import annotations

from abc import ABC, abstractmethod

from news_pipeline.models.article import RawArticle
from news_pipeline.models.source import SourceConfig


class BaseCollector(ABC):
    def __init__(self, source: SourceConfig) -> None:
        self.source = source

    @abstractmethod
    async def collect(self) -> list[RawArticle]:
        raise NotImplementedError
