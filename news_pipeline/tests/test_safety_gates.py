from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import typer

from news_pipeline.cli.commands.audit_content import audit_content_command
from news_pipeline.cli.commands import heartbeat_publish_one
from news_pipeline.cli.commands.heartbeat_publish_one import _select_candidate, publish_one_command
from news_pipeline.cli.commands.heartbeat_prepare_one import _board_score, _recent_live_posts
from news_pipeline.cli.commands.publish import _assert_not_duplicate_live, _assert_not_duplicate_topic, publish_command, publish_queue_item
from news_pipeline.editorial.autonomy import is_autopublish_candidate
from news_pipeline.extractors.article_text import _extract_published_at
from news_pipeline.models.article import NormalizedArticle, RawArticle
from news_pipeline.models.queue import DraftSource, QueueItem
from news_pipeline.models.source import SourceConfig
from news_pipeline.normalize.cleaner import ArticleNormalizer
from news_pipeline.storage.json_store import JsonStore


def _article(article_id: str, *, url: str, published_at: datetime | None = None) -> NormalizedArticle:
    now = datetime.now(UTC)
    return NormalizedArticle(
        id=article_id,
        source_id="demo-source",
        source_name="Demo Source",
        canonical_url=url,
        title="Demo source title",
        summary="Demo source summary",
        published_at=published_at or now,
        image_url=None,
        content_snippet="Synthetic provider-free fixture.",
        category_hints=["Teknoloji"],
        tags=["demo"],
        language="en",
        fingerprint=f"{article_id}-fingerprint",
        cluster_key=article_id,
        created_at=published_at or now,
    )


def _body() -> str:
    return " ".join(
        [
            "Demo kent yönetimi, ulaşım uyarıları için yeni bir yapay zeka güvenlik panosu başlattı.",
            "Sistem, acil durum mesajlarını tek merkezde topluyor ve kamu ekiplerine daha hızlı karar desteği sunmayı hedefliyor.",
            "Pilot uygulama önce metro ve otobüs hatlarında denenecek, sonuçlar bağımsız bir teknik raporla değerlendirilecek.",
            "Yetkililer, aracın insan kararının yerine geçmeyeceğini ve yalnızca önceliklendirme desteği sağlayacağını vurguluyor.",
            "Bu sınırlı kapsam, haberin düşük riskli bir teknoloji güncellemesi olarak izlenmesini sağlıyor.",
        ]
    )


def _item(
    queue_id: str = "demo-queue",
    *,
    normalized_id: str = "demo-article",
    status: str = "new",
    url: str = "https://example.org/demo/story",
    notes: list[str] | None = None,
    priority: float = 0.91,
) -> QueueItem:
    return QueueItem(
        queue_id=queue_id,
        status=status,  # type: ignore[arg-type]
        normalized_id=normalized_id,
        cluster_key="demo-cluster",
        editorial_priority=priority,
        draft_title="Demo kent, ulaşım uyarıları için güvenlik panosu açtı",
        draft_description="Sentetik demo haberi, kamu hizmetlerinde kullanılan yapay zeka destekli bir uyarı panosunun sınırlı pilotunu anlatıyor.",
        draft_category="Teknoloji",
        draft_tags=["demo", "teknoloji"],
        draft_sources=[DraftSource(name="Demo Source", url=url)],
        draft_facts=[
            "Demo kent yönetimi, ulaşım uyarılarını tek panoda izleyen sınırlı bir pilot başlattı.",
            "Sistem, kamu ekiplerine önceliklendirme desteği veriyor ama insan kararının yerini almıyor.",
            "Pilot sonuçlarının bağımsız bir teknik raporla değerlendirilmesi planlanıyor.",
        ],
        draft_body=_body(),
        hero_prompt="Editorial illustration of a city transit control room with abstract AI signal panels, no logos, no text.",
        hero_alt="Ulaşım uyarılarını gösteren soyut bir kontrol panosu",
        supporting_sources=[],
        related_queue_ids=[],
        notes=notes if notes is not None else ["asteria-editorial-polish"],
    )


def _save_runtime(root: Path, item: QueueItem, article: NormalizedArticle) -> None:
    JsonStore(root / "news_pipeline/data/queue", QueueItem).save(item.queue_id, item)
    JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle).save(article.id, article)


def test_duplicate_url_and_topic_guard(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    existing = content / "existing.md"
    existing.write_text(
        """---
title: "Demo kent ulaşım uyarıları için güvenlik panosu açtı"
description: "Kamu hizmetlerinde kullanılan yapay zeka destekli uyarı panosu sınırlı pilotla deneniyor."
sources:
  - name: "Demo Source"
    url: "https://example.org/demo/story"
---
Demo kent yönetimi ulaşım uyarıları için yapay zeka güvenlik panosu başlattı.
""",
        encoding="utf-8",
    )

    with pytest.raises(typer.BadParameter, match="duplicate live source URL"):
        _assert_not_duplicate_live(
            content,
            "Demo kent, ulaşım uyarıları için güvenlik panosu açtı",
            "Kamu hizmetlerinde kullanılan yapay zeka destekli uyarı panosu sınırlı pilotla deneniyor.",
            {"https://example.org/demo/story"},
            "new-story",
        )

    with pytest.raises(typer.BadParameter, match="near-duplicate live title|near-duplicate live topic"):
        _assert_not_duplicate_live(
            content,
            "Demo kent ulaşım uyarıları için güvenlik panosu açtı",
            "Kamu hizmetlerinde kullanılan yapay zeka destekli uyarı panosu sınırlı pilotla deneniyor.",
            {"https://example.org/demo/story-variant"},
            "new-story",
        )

    with pytest.raises(typer.BadParameter, match="near-duplicate live topic"):
        _assert_not_duplicate_topic(
            existing,
            existing.read_text(encoding="utf-8"),
            "Ulaşım güvenlik panosu kamu hizmetlerinde yapay zeka destekli pilot olarak deneniyor",
            {"https://example.org/demo/story-variant"},
            {"https://example.org/demo/story"},
        )


def test_source_age_rejection_blocks_publish(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    old_article = _article(
        "demo-old",
        url="https://example.org/demo/old",
        published_at=datetime.now(UTC) - timedelta(hours=96),
    )
    item = _item(normalized_id=old_article.id, status="approved", url="https://example.org/demo/old")
    _save_runtime(tmp_path, item, old_article)
    (tmp_path / "src/content/anlikHaber").mkdir(parents=True)

    with pytest.raises(typer.BadParameter, match="source item is too old"):
        publish_queue_item(item.queue_id, max_source_age_hours=72)


def test_disabled_direct_publish_command() -> None:
    with pytest.raises(typer.Exit) as exc:
        publish_command("demo-queue")
    assert exc.value.exit_code == 2


def test_content_audit_detects_internal_note_leak(tmp_path: Path) -> None:
    content = tmp_path / "articles"
    content.mkdir()
    (content / "leak.md").write_text(
        """---
title: "Temiz Türkçe başlık"
description: "Bu açıklama Türkçe sinyal taşıyor ve haber gibi görünüyor."
---
Gövde.

- manual-review: bu iç not okuyucuya sızmamalı
""",
        encoding="utf-8",
    )

    with pytest.raises(typer.Exit) as exc:
        audit_content_command(content_dir=content)
    assert exc.value.exit_code == 1


def test_manual_review_gate_behavior(tmp_path: Path) -> None:
    manual = _item(queue_id="manual", normalized_id="manual-article", notes=["asteria-editorial-polish", "manual-review: synthetic legal-risk fixture"])
    ok, reason = is_autopublish_candidate(manual)
    assert ok is False
    assert reason == "manual-review item"

    root = tmp_path
    _save_runtime(root, manual, _article("manual-article", url="https://example.org/demo/manual"))
    candidate, rejections = _select_candidate(root, min_score=0.68, max_source_age_hours=72)
    assert candidate is None
    assert rejections
    assert rejections[0]["reason"] == "manual-review item"



def test_headline_board_penalizes_recent_company_saturation(tmp_path: Path) -> None:
    article = _article("claude-article", url="https://example.org/demo/claude")
    article.title = "Claude gets a new enterprise security feature"
    article.summary = "Anthropic is expanding Claude for enterprise customers."
    article.tags = ["claude", "anthropic"]
    item = _item(
        normalized_id=article.id,
        url="https://example.org/demo/claude",
        priority=0.90,
    )
    item.draft_title = "Claude, kurumsal güvenlik özelliğini genişletiyor"
    item.draft_description = "Anthropic, Claude için yeni kurumsal güvenlik özellikleri duyurdu."
    _save_runtime(tmp_path, item, article)

    score, reasons = _board_score(
        tmp_path,
        item,
        recent_posts=[
            {"source": "TechCrunch", "companies": "Anthropic", "title": "Anthropic story one"},
            {"source": "CNBC Technology", "companies": "Anthropic,OpenAI", "title": "Anthropic story two"},
        ],
    )

    assert score < item.editorial_priority
    assert "recency_penalty:company_repeat:Anthropic:2" in reasons



def test_headline_board_ignores_incidental_company_mentions_in_body(tmp_path: Path) -> None:
    article = _article("drone-article", url="https://example.org/demo/drone")
    article.title = "Europe expands drone defense innovation funding"
    article.summary = "European agencies are coordinating anti-drone technology funding; a later quote mentions OpenAI incidentally."
    item = _item(
        normalized_id=article.id,
        url="https://example.org/demo/drone",
        priority=0.90,
    )
    item.draft_title = "Avrupa, drone savunması için inovasyon fonlarını genişletiyor"
    item.draft_description = "Yeni program, havaalanları ve kritik altyapı çevresinde drone savunmasını hedefliyor."
    item.draft_body = "Bu metnin sonunda yalnız alıntı bağlamında OpenAI adı geçiyor."
    item.draft_tags = ["pipeline", "haber", "openai"]
    _save_runtime(tmp_path, item, article)

    _, reasons = _board_score(
        tmp_path,
        item,
        recent_posts=[
            {"source": "TechCrunch", "companies": "OpenAI", "title": "OpenAI story one"},
            {"source": "Engadget", "companies": "OpenAI", "title": "OpenAI story two"},
        ],
    )

    assert not any("company_repeat" in reason for reason in reasons)

def test_recent_live_posts_detects_company_signals_beyond_title(tmp_path: Path) -> None:
    content = tmp_path / "src/content/anlikHaber"
    content.mkdir(parents=True)
    (content / "memory.md").write_text(
        """---
title: "Yeni hafıza sistemi ücretsiz kullanıcılara açılıyor"
description: "ChatGPT kullanıcılarına yönelik yeni hafıza mimarisi duyuruldu."
pubDate: '2026-06-05T14:59:06+03:00'
tags: ["openai", "chatgpt", "hafıza"]
category: "Teknoloji"
sources:
  - name: "Engadget"
    url: "https://example.org/memory"
---
Gövde OpenAI adını ayrıca geçiriyor.
""",
        encoding="utf-8",
    )

    recent = _recent_live_posts(tmp_path, limit=1)

    assert recent[0]["companies"] == "OpenAI"

def test_publish_one_rejects_duplicate_gate_candidate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    article = _article("duplicate-article", url="https://example.org/demo/duplicate")
    item = _item(status="approved", normalized_id=article.id, url="https://example.org/demo/duplicate")
    _save_runtime(tmp_path, item, article)
    (tmp_path / "src/content/anlikHaber").mkdir(parents=True)

    def duplicate_publish(*args, **kwargs):
        raise typer.BadParameter("near-duplicate live topic from same source already published in existing.md")

    monkeypatch.setattr(heartbeat_publish_one, "publish_queue_item", duplicate_publish)

    with pytest.raises(typer.Exit) as exc:
        publish_one_command(
            execute=True,
            collect_first=False,
            json_output=True,
            push=False,
            build=False,
            min_score=0.68,
            max_source_age_hours=72,
            commit_message="test duplicate rejection",
            min_interval_seconds=0,
            force=True,
        )

    assert exc.value.exit_code == 1
    stored = JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).load(item.queue_id)
    assert stored is not None
    assert stored.status == "rejected"
    assert stored.editorial_priority == 0.0
    assert any(note.startswith("duplicate-publish-gate:") for note in stored.notes)


def test_normalizer_uses_raw_fetch_time_when_source_date_missing() -> None:
    fetched_at = datetime(2026, 4, 29, 19, 1, tzinfo=UTC)
    raw = RawArticle(
        source_id="fast-company-tech",
        fetched_at=fetched_at,
        url="https://www.fastcompany.com/91533167/why-manus-has-become-a-crucial-prize-in-the-global-ai-race",
        title="Why Manus has become a crucial prize in the global AI race",
        summary="China blocked Meta from acquiring Manus.",
        published_at=None,
        metadata={"article_snippet": "China blocked Meta from acquiring Manus."},
    )
    source = SourceConfig(
        id="fast-company-tech",
        name="Fast Company Tech",
        kind="rss",
        url="https://www.fastcompany.com/technology/rss",
        category_hints=["Teknoloji"],
    )

    normalized = ArticleNormalizer().normalize(raw, source)

    assert normalized.published_at is None
    assert normalized.created_at == fetched_at


def test_article_date_extraction_reads_common_news_metadata() -> None:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(
        """
        <html><head>
          <meta property="article:published_time" content="2026-04-28T04:14:00+00:00" />
          <script type="application/ld+json">
            {"@type":"NewsArticle","datePublished":"2026-04-27T12:00:00+00:00"}
          </script>
        </head></html>
        """,
        "html.parser",
    )

    assert _extract_published_at(soup) == datetime(2026, 4, 28, 4, 14, tzinfo=UTC)


def test_duplicate_event_core_catches_meta_manus_rewrite(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    existing = content / "china-vetoes-meta-s-2b-manus-deal-after-months-long-probe.md"
    existing.write_text(
        """---
title: "Çin, Meta'nın 2 milyar dolarlık Manus anlaşmasını durdurdu"
description: "Çin'in ekonomik planlama kurumu, Meta'nın Manus satın almasını engelledi. Karar, Zuckerberg'in yapay zekâ ajanları planına darbe vurabilir."
sources:
  - name: "TechCrunch"
    url: "https://techcrunch.com/2026/04/27/china-vetoes-metas-2b-manus-deal-after-months-long-probe/"
---
Çin, Meta'nın Manus'u satın alma planını durdurdu.
""",
        encoding="utf-8",
    )

    with pytest.raises(typer.BadParameter, match="near-duplicate live event"):
        _assert_not_duplicate_live(
            content,
            "Çin, Meta’nın Manus yapay zekâ platformunu satın almasını engelledi",
            "Fast Company’ye göre Pekin, Meta’nın Butterfly Effect’e ait Manus platformunu 2 milyar dolara satın alma girişimini algoritmaları teknoloji ihracat kontrolüne alarak fiilen durdurdu.",
            {"https://www.fastcompany.com/91533167/why-manus-has-become-a-crucial-prize-in-the-global-ai-race"},
            "cin-metanin-manus-yapay-zeka-platformunu-satin-almasini-engelledi",
        )
