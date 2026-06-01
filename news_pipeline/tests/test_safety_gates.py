from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import typer

from news_pipeline.cli.commands.audit_content import audit_content_command
from news_pipeline.cli.commands.heartbeat_publish_one import _select_candidate
from news_pipeline.cli.commands.publish import _assert_not_duplicate_live, _assert_not_duplicate_topic, publish_command, publish_queue_item
from news_pipeline.editorial.autonomy import is_autopublish_candidate
from news_pipeline.models.article import NormalizedArticle
from news_pipeline.models.queue import DraftSource, QueueItem
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
