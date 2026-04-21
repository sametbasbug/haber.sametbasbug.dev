from __future__ import annotations

from news_pipeline.models.article import NormalizedArticle, RawArticle
from news_pipeline.models.source import SourceConfig
from news_pipeline.utils.text import clean_text


class ArticleNormalizer:
    def normalize(self, raw: RawArticle, source: SourceConfig) -> NormalizedArticle:
        title = clean_text(raw.title)
        summary = clean_text(raw.summary)
        article_snippet = clean_text(str(raw.metadata.get("article_snippet", "")))
        fingerprint = NormalizedArticle.build_fingerprint(title=title, summary=summary)
        return NormalizedArticle(
            id=fingerprint[:16],
            source_id=source.id,
            source_name=source.name,
            canonical_url=raw.url,
            title=title,
            summary=summary,
            published_at=raw.published_at,
            image_url=raw.image_url,
            content_snippet=article_snippet or summary,
            category_hints=source.category_hints,
            fingerprint=fingerprint,
            cluster_key=NormalizedArticle.build_cluster_key(title),
        )
