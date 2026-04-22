from __future__ import annotations

from news_pipeline.models.article import NormalizedArticle, RawArticle
from news_pipeline.models.source import SourceConfig
from news_pipeline.utils.text import clean_text

BOILERPLATE_MARKERS = (
    "işbu aydınlatma metni",
    "veri sorumlusu",
    "kişisel verilerin korun",
    "kvkk",
    "e-bülten aboneliği",
    "ticari elektronik ileti",
    "gizlilik sözleşmesi",
    "privacy policy",
)


def _strip_feed_tail(summary: str, title: str, source_name: str) -> str:
    compact_summary = clean_text(summary)
    compact_title = clean_text(title)
    compact_source = clean_text(source_name)
    suffix = f"{compact_title} {compact_source}".strip().lower()
    lowered = compact_summary.lower().rstrip(" .")
    if suffix and lowered.endswith(suffix):
        trimmed = compact_summary[: -(len(compact_title) + len(compact_source))].rstrip(" .")
        return trimmed.strip()
    if compact_source and lowered.endswith(compact_source.lower()):
        trimmed = compact_summary[: -len(compact_source)].rstrip(" .")
        return trimmed.strip()
    return compact_summary


class ArticleNormalizer:
    def normalize(self, raw: RawArticle, source: SourceConfig) -> NormalizedArticle:
        title = clean_text(raw.title)
        summary = _strip_feed_tail(clean_text(raw.summary), title, source.name)
        article_snippet = clean_text(str(raw.metadata.get("article_snippet", "")))
        lowered_snippet = article_snippet.lower()
        if any(marker in lowered_snippet for marker in BOILERPLATE_MARKERS):
            article_snippet = ""
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
