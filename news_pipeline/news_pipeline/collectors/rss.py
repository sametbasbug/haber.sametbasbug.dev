from __future__ import annotations

from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import feedparser

from news_pipeline.collectors.base import BaseCollector
from news_pipeline.extractors.article_text import fetch_article_details
from news_pipeline.models.article import RawArticle
from news_pipeline.utils.text import clean_text


class RssCollector(BaseCollector):
    async def collect(self) -> list[RawArticle]:
        parsed = feedparser.parse(str(self.source.url))
        articles: list[RawArticle] = []

        entries = list(parsed.entries)
        if getattr(parsed, "bozo", False) and not entries:
            raise RuntimeError(f"feed parse failed: {getattr(parsed, 'bozo_exception', 'unknown parse error')}")
        if self.source.max_items is not None:
            entries = entries[: self.source.max_items]

        for index, entry in enumerate(entries):
            published_at = None
            if getattr(entry, "published", None):
                try:
                    published_at = parsedate_to_datetime(entry.published).astimezone(UTC)
                except Exception:
                    published_at = None

            image_url = None
            media_content = getattr(entry, "media_content", None) or []
            if media_content:
                image_url = media_content[0].get("url")

            article_url = entry.link
            summary = clean_text(getattr(entry, "summary", ""))
            should_fetch_snippet = self.source.fetch_snippets and (
                self.source.snippet_limit is None or index < self.source.snippet_limit
            )
            article_details = fetch_article_details(article_url) if should_fetch_snippet else None
            article_snippet = article_details.snippet if article_details else ""
            page_published_at = article_details.published_at if article_details else None

            articles.append(
                RawArticle(
                    source_id=self.source.id,
                    url=article_url,
                    title=clean_text(getattr(entry, "title", "")),
                    summary=summary,
                    published_at=published_at or page_published_at,
                    image_url=image_url,
                    metadata={
                        "feed_title": getattr(parsed.feed, "title", self.source.name),
                        "article_snippet": article_snippet,
                        "page_published_at": page_published_at.isoformat() if page_published_at else None,
                    },
                )
            )

        return articles
