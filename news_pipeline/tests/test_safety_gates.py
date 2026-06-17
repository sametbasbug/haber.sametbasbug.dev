from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import typer

from news_pipeline.cli.commands.audit_content import audit_content_command
from news_pipeline.cli.commands.collect import _is_due
from news_pipeline.cli.commands import heartbeat_publish_one
from news_pipeline.cli.commands.process import process_command
from news_pipeline.cli.commands.queue_approve import queue_approve_command
from news_pipeline.cli.commands.queue_cleanup import queue_cleanup_command
from news_pipeline.cli.commands.queue_polish import queue_polish_command
from news_pipeline.cli.commands.heartbeat_publish_one import _is_excluded_source_format, _select_candidate, publish_one_command
from news_pipeline.cli.commands.heartbeat_prepare_one import _board_score, _build_editorial_packs, _candidate_reason, _hot_category, _recent_live_posts, _select_headline_board, _selection_policy
from news_pipeline.cli.commands.publish import _assert_not_duplicate_live, _assert_not_duplicate_topic, publish_command, publish_queue_item
from news_pipeline.editorial.autonomy import body_looks_too_english, is_autopublish_candidate
from news_pipeline.extractors.article_text import _extract_published_at
from news_pipeline.models.article import NormalizedArticle, RawArticle
from news_pipeline.models.queue import DraftSource, QueueItem
from news_pipeline.models.source import SourceConfig
from news_pipeline.normalize.cleaner import ArticleNormalizer
from news_pipeline.queue.service import QueueService
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




def test_collect_cadence_grace_handles_near_hourly_boundary() -> None:
    now = datetime.now(UTC)
    source = SourceConfig(
        id="hourly-demo",
        name="Hourly Demo",
        kind="rss",
        url="https://example.org/rss.xml",
        cadence="hourly",
    )
    state = {"hourly-demo": {"lastCollectedAt": (now - timedelta(minutes=59)).isoformat()}}

    due_without_grace, reason = _is_due(source, state, now, full=False, cadence_grace_seconds=0)
    due_with_grace, _ = _is_due(source, state, now, full=False, cadence_grace_seconds=300)

    assert due_without_grace is False
    assert reason == "cadence_wait:3540s/3600s"
    assert due_with_grace is True


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


def test_duplicate_event_guard_allows_distinct_ai_policy_events(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    (content / "china-vetoes-meta-manus.md").write_text(
        """---
title: "Çin, Meta'nın 2 milyar dolarlık Manus anlaşmasını durdurdu"
description: "Çin'in ekonomik planlama kurumu, Meta'nın Manus satın almasını engelledi. Karar, Zuckerberg'in yapay zekâ ajanları planına darbe vurabilir."
sources:
  - name: "TechCrunch"
    url: "https://techcrunch.com/2026/04/27/china-vetoes-metas-2b-manus-deal-after-months-long-probe/"
---
Çin, Meta'nın Manus'u satın alma planını durdurdu. Böylece şirketin yapay zekâ ajanları alanındaki genişleme hamlesi önemli bir engelle karşılaştı.
""",
        encoding="utf-8",
    )

    _assert_not_duplicate_live(
        content,
        "ABD, Anthropic’in en yeni yapay zekâ modellerine yabancı erişimini durdurmasını istedi",
        "Anthropic, ABD hükümetinin ulusal güvenlik gerekçesiyle Fable 5 ve Mythos 5 modellerine yabancı uyrukluların erişimini askıya almasını istediğini açıkladı; karar, gelişmiş yapay zekâda ihracat kontrolü tartışmasını büyüttü.",
        {"https://www.aljazeera.com/news/2026/6/14/us-asks-anthropic-to-block-global-access-to-top-ai-models-why-it-matters"},
        "abd-anthropic-yabanci-erisim",
    )


def test_duplicate_event_guard_blocks_same_ai_access_restriction_from_different_angle(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    (content / "anthropic-europe-sovereignty.md").write_text(
        """---
title: "Anthropic kararı Avrupa’da egemen yapay zekâ tartışmasını büyüttü"
description: "ABD yönetiminin talimatı sonrası Anthropic’in bazı üst seviye modellerine yabancı kullanıcı erişimini durdurması, Avrupa’da teknoloji bağımlılığı ve yerli yapay zekâ yatırımları tartışmasını yeniden öne çıkardı."
sources:
  - name: "Euronews World"
    url: "https://www.euronews.com/2026/06/13/wake-up-call-europe-reacts-to-anthropic-halting-access-to-its-fable-5-and-mythos-5-ai-mode"
---
ABD merkezli Anthropic’in Fable 5 ve Mythos 5 modellerine yabancı kullanıcı erişimini durdurması, Avrupa’da yapay zekâ egemenliği tartışmasını sertleştirdi.
""",
        encoding="utf-8",
    )

    with pytest.raises(typer.BadParameter, match="near-duplicate live event"):
        _assert_not_duplicate_live(
            content,
            "ABD, Anthropic’in en yeni yapay zekâ modellerine yabancı erişimini durdurmasını istedi",
            "Anthropic, ABD hükümetinin ulusal güvenlik gerekçesiyle Fable 5 ve Mythos 5 modellerine yabancı uyrukluların erişimini askıya almasını istediğini açıkladı; karar, gelişmiş yapay zekâda ihracat kontrolü tartışmasını büyüttü.",
            {"https://www.aljazeera.com/news/2026/6/14/us-asks-anthropic-to-block-global-access-to-top-ai-models-why-it-matters"},
            "abd-anthropic-yabanci-erisim",
        )


def test_duplicate_event_guard_does_not_match_ai_lab_policy_without_shared_product(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    (content / "anthropic-dod-blacklist.md").write_text(
        """---
title: "Anthropic ile ABD Savunma Bakanlığı kara liste davasında karşı karşıya geliyor"
description: "Washington’daki temyiz mahkemesi, Pentagon’un Anthropic’i tedarik zinciri riski ilan etmesine karşı açılan davada tarafları dinleyecek."
sources:
  - name: "CNBC Technology"
    url: "https://www.cnbc.com/2026/05/19/anthropic-dod-blacklist-court-opening-arguments.html"
---
Dosyanın merkezinde, Pentagon ile şirket arasında aylar süren müzakerelerin çökmesi var. Bakanlık Anthropic modellerine tüm yasal amaçlar için sınırsız erişim isterken, şirket teknolojisinin tamamen otonom silahlarda veya ülke içinde kitlesel gözetimde kullanılmayacağına dair güvence aradı.
""",
        encoding="utf-8",
    )

    _assert_not_duplicate_live(
        content,
        "ABD’nin Anthropic kararı, Avrupa’da yapay zekâ bağımlılığı tartışmasını büyüttü",
        "Washington’ın Anthropic’in en yeni modellerine yabancı erişimini durdurma emri, Avrupa’da yapay zekâ altyapısında ABD’ye bağımlılık tartışmasını yeniden öne çıkardı.",
        {"https://www.politico.eu/article/us-anthropic-order-exposes-eu-ai-dependency/"},
        "abd-anthropic-avrupa-bagimlilik",
    )


def test_duplicate_event_guard_matches_ai_access_story_with_shared_models(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    (content / "anthropic-europe-sovereignty.md").write_text(
        """---
title: "Anthropic kararı Avrupa’da egemen yapay zekâ tartışmasını büyüttü"
description: "ABD yönetiminin talimatı sonrası Anthropic’in bazı üst seviye modellerine yabancı kullanıcı erişimini durdurması, Avrupa’da teknoloji bağımlılığı ve yerli yapay zekâ yatırımları tartışmasını yeniden öne çıkardı."
sources:
  - name: "Euronews World"
    url: "https://www.euronews.com/2026/06/13/wake-up-call-europe-reacts-to-anthropic-halting-access-to-its-fable-5-and-mythos-5-ai-mode"
---
ABD merkezli Anthropic’in Fable 5 ve Mythos 5 modellerine yabancı kullanıcı erişimini durdurması, Avrupa’da yapay zekâ egemenliği tartışmasını sertleştirdi.
""",
        encoding="utf-8",
    )

    with pytest.raises(typer.BadParameter, match="near-duplicate live event"):
        _assert_not_duplicate_live(
            content,
            "US’s Anthropic order exposes EU’s AI dependency",
            "Washington's export controls on Anthropic spark renewed calls for Europe to accelerate development of its own cutting-edge AI models. The net effect of this order is that we must abruptly disable Fable 5 and Mythos 5 for all our customers to ensure compliance, Anthropic said.",
            {"https://www.politico.eu/article/us-anthropic-order-exposes-eu-ai-dependency/"},
            "us-anthropic-order-eu-ai-dependency",
        )


def test_duplicate_event_guard_blocks_same_shadow_fleet_tanker_from_different_source(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    (content / "britanya-rusyanin-golge-filosu-ile-baglantili-tankeri-mansta-alikoydu.md").write_text(
        """---
title: "Britanya, Rusya’nın “gölge filosu” ile bağlantılı tankeri Manş’ta alıkoydu"
description: "Britanya Savunma Bakanlığı, yaptırım listesinde yer alan Smyrtos adlı petrol tankerinin Manş Denizi’nde durdurulduğunu ve Rusya’ya yönelik yaptırımların ihlali şüphesiyle inceleneceğini açıkladı."
sources:
  - name: "Al Jazeera World"
    url: "https://www.aljazeera.com/news/2026/6/14/uk-detains-shadow-fleet-tanker-in-channel"
---
Britanya, Rusya'nın petrol yaptırımlarını aşmak için kullandığı belirtilen gölge filo ile bağlantılı olduğundan şüphelenilen Smyrtos adlı tankeri Manş Denizi'nde alıkoydu.

Başbakan Keir Starmer, yaptırım kapsamındaki geminin Rusya'nın Ukrayna'daki savaşını finanse eden akışlara yönelik yeni bir darbe olduğunu söyledi.

Savunma Bakanlığı, Smyrtos'un İngiltere'nin güney kıyısı açıklarında tutulacağını ve soruşturma süresince izleneceğini açıkladı.
""",
        encoding="utf-8",
    )

    with pytest.raises(typer.BadParameter, match="near-duplicate live event"):
        _assert_not_duplicate_live(
            content,
            "İngiltere seizes suspected Russian shadow fleet tanker",
            "The İngiltere Ministry of Defence on Sunday issued a press release announcing that Royal Marine Commandos had captured a sanctioned Russian tanker in the Channel in what it called the latest blow to Russia's war economy.",
            {"https://www.dw.com/en/uk-seizes-suspected-russian-shadow-fleet-tanker/a-77545832"},
            "ingiltere-golge-filo-tanker",
        )


def test_duplicate_event_guard_allows_distinct_ukraine_russia_energy_update(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    (content / "ukrayna-rus-enerji-terminalini-vurdu.md").write_text(
        """---
title: "Ukrayna, Rusya’nın deniz terminalini vurduğunu açıkladı"
description: "Kiev, Rus enerji altyapısına yönelik saldırıda bir deniz terminalinin hedef alındığını bildirdi."
sources:
  - name: "Demo Source"
    url: "https://example.org/ukraine-terminal"
---
Ukrayna, Rusya'nın enerji altyapısına yönelik ayrı bir saldırıyı duyurdu.
""",
        encoding="utf-8",
    )

    _assert_not_duplicate_live(
        content,
        "Ukrayna, Rus sanayi tesislerine geniş çaplı saldırı düzenlediğini duyurdu",
        "Kiev, farklı bölgelerdeki Rus sanayi tesislerinin yeni bir drone saldırısıyla hedef alındığını açıkladı.",
        {"https://example.org/ukraine-industrial-strike"},
        "ukrayna-rus-sanayi-tesisleri",
    )


def test_duplicate_live_source_url_canonicalizes_tracking_and_www(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    (content / "existing.md").write_text(
        """---
title: "Mevcut haber"
description: "Mevcut haber açıklaması"
sources:
  - name: "Demo"
    url: "https://example.org/news/story?utm_source=rss&utm_medium=feed"
---
Gövde.
""",
        encoding="utf-8",
    )

    with pytest.raises(typer.BadParameter, match="duplicate live source URL"):
        _assert_not_duplicate_live(
            content,
            "Yeni haber",
            "Yeni haber açıklaması",
            {"http://www.example.org/news/story/?utm_campaign=social"},
            "new-story",
        )


def test_publish_blocks_recent_topic_family_saturation(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    for index, title in enumerate(
        [
            "Putin Ukrayna saldırılarının ekonomiye zarar verdiğini kabul etti",
            "Bulgaristan Ukrayna için devlet stoklarından sevkiyatı durdurdu",
        ],
        start=1,
    ):
        (content / f"recent-ukraine-{index}.md").write_text(
            f"""---
title: "{title}"
description: "Ukrayna ve Rusya savaşına ilişkin yeni gelişme aktarıldı."
pubDate: '2026-06-13T1{index}:00:00+03:00'
tags: ["Ukrayna", "Rusya", "savaş"]
sources:
  - name: "Demo Source"
    url: "https://example.org/recent-ukraine-{index}"
---
Gövde.
""",
            encoding="utf-8",
        )

    with pytest.raises(typer.BadParameter, match="topic-family saturation guard: Ukraine/Russia war"):
        _assert_not_duplicate_live(
            content,
            "Ukrayna, AB üyelik görüşmelerinde yeni aşamaya geçti",
            "Avrupa Birliği, Ukrayna ve Moldova ile üyelik sürecinde yeni başlık açmaya hazırlanıyor.",
            {"https://example.org/new-ukraine"},
            "ukrayna-ab-uyelik-gorusmeleri",
        )


def test_prepare_duplicate_probe_can_skip_topic_family_saturation(tmp_path: Path) -> None:
    content = tmp_path / "content"
    content.mkdir()
    for index, title in enumerate(
        [
            "Putin Ukrayna saldırılarının ekonomiye zarar verdiğini kabul etti",
            "Bulgaristan Ukrayna için devlet stoklarından sevkiyatı durdurdu",
        ],
        start=1,
    ):
        (content / f"recent-ukraine-{index}.md").write_text(
            f"""---
title: "{title}"
description: "Ukrayna ve Rusya savaşına ilişkin yeni gelişme aktarıldı."
pubDate: '2026-06-13T1{index}:00:00+03:00'
tags: ["Ukrayna", "Rusya", "savaş"]
sources:
  - name: "Demo Source"
    url: "https://example.org/recent-ukraine-{index}"
---
Gövde.
""",
            encoding="utf-8",
        )

    _assert_not_duplicate_live(
        content,
        "Ukrayna, AB üyelik görüşmelerinde yeni aşamaya geçti",
        "Avrupa Birliği, Ukrayna ve Moldova ile üyelik sürecinde yeni başlık açmaya hazırlanıyor.",
        {"https://example.org/new-ukraine"},
        "ukrayna-ab-uyelik-gorusmeleri",
        enforce_topic_family_saturation=False,
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
    (tmp_path / "src/content/equinoxHaber").mkdir(parents=True)

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


def test_asteria_polish_does_not_bypass_low_importance_score_floor(tmp_path: Path) -> None:
    low_article = _article("low-importance", url="https://example.org/demo/low-importance")
    low_item = _item(
        "low-importance",
        normalized_id=low_article.id,
        url="https://example.org/demo/low-importance",
        priority=0.59,
        notes=["asteria-editorial-polish"],
    )
    _save_runtime(tmp_path, low_item, low_article)

    candidate, rejections = _select_candidate(tmp_path, min_score=0.68, max_source_age_hours=72)

    assert candidate is None
    assert rejections
    assert rejections[0]["queueId"] == "low-importance"
    assert rejections[0]["reason"] == "score below threshold (0.590)"


def test_prepare_diagnostic_does_not_claim_board_boosted_low_raw_score_passes(tmp_path: Path) -> None:
    article = _article("ipo-ai", url="https://example.org/demo/ipo-ai")
    article.title = "AI companies race to go public as markets heat up"
    article.summary = "Technology market investors are watching artificial intelligence listings."
    item = _item("ipo-ai", normalized_id=article.id, url="https://example.org/demo/ipo-ai", priority=0.669)
    item.draft_title = "Yapay zekâ şirketleri halka arz yarışında sermaye baskısını artırıyor"
    item.draft_description = "Teknoloji piyasaları, yapay zekâ şirketlerinin halka arz planlarına odaklanıyor."
    item.draft_category = "Teknoloji"
    _save_runtime(tmp_path, item, article)

    board_score, reasons = _board_score(tmp_path, item, recent_posts=[])
    ok, reason = _candidate_reason(tmp_path, item, min_score=0.68, max_source_age_hours=72, board_score=board_score)

    assert board_score >= 0.68
    assert any(reason.startswith("signal_boost:") for reason in reasons)
    assert ok is False
    assert reason == "score below threshold (0.669)"


def test_prepare_board_excludes_raw_score_floor_failures_even_when_board_boosted(tmp_path: Path) -> None:
    article = _article("ipo-ai-board", url="https://example.org/demo/ipo-ai-board")
    article.title = "AI companies race to go public as markets heat up"
    article.summary = "Technology market investors are watching artificial intelligence listings."
    item = _item("ipo-ai-board", normalized_id=article.id, url="https://example.org/demo/ipo-ai-board", priority=0.669)
    item.draft_title = "Yapay zekâ şirketleri halka arz yarışında sermaye baskısını artırıyor"
    item.draft_description = "Teknoloji piyasaları, yapay zekâ şirketlerinin halka arz planlarına odaklanıyor."
    item.draft_category = "Teknoloji"
    _save_runtime(tmp_path, item, article)

    packs, skipped, _ = _build_editorial_packs(tmp_path, min_score=0.68, max_source_age_hours=72, limit=20)

    assert packs == []
    assert any(row["queueId"] == item.queue_id and row["reason"] == "score below threshold (0.669)" for row in skipped)


def test_prepare_board_excludes_near_duplicate_live_events_before_asteria_polish(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
    content.mkdir(parents=True)
    (content / "britanya-rusyanin-golge-filosu-ile-baglantili-tankeri-mansta-alikoydu.md").write_text(
        """---
title: "Britanya, Rusya’nın “gölge filosu” ile bağlantılı tankeri Manş’ta alıkoydu"
description: "Britanya Savunma Bakanlığı, yaptırım listesinde yer alan Smyrtos adlı petrol tankerinin Manş Denizi’nde durdurulduğunu ve Rusya’ya yönelik yaptırımların ihlali şüphesiyle inceleneceğini açıkladı."
sources:
  - name: "Al Jazeera World"
    url: "https://www.aljazeera.com/news/2026/6/14/uk-detains-shadow-fleet-tanker-in-channel"
---
Britanya, Rusya'nın petrol yaptırımlarını aşmak için kullandığı belirtilen gölge filo ile bağlantılı olduğundan şüphelenilen Smyrtos adlı tankeri Manş Denizi'nde alıkoydu.

Başbakan Keir Starmer, yaptırım kapsamındaki geminin Rusya'nın Ukrayna'daki savaşını finanse eden akışlara yönelik yeni bir darbe olduğunu söyledi.

Savunma Bakanlığı, Smyrtos'un İngiltere'nin güney kıyısı açıklarında tutulacağını ve soruşturma süresince izleneceğini açıkladı.
""",
        encoding="utf-8",
    )
    article = _article("shadow-fleet-dupe", url="https://www.dw.com/en/uk-seizes-suspected-russian-shadow-fleet-tanker/a-77545832")
    item = _item("shadow-fleet-dupe", normalized_id=article.id, url=str(article.canonical_url), priority=0.91)
    item.draft_title = "İngiltere seizes suspected Russian shadow fleet tanker"
    item.draft_description = "The İngiltere Ministry of Defence announced that Royal Marine Commandos had captured a sanctioned Russian tanker in the Channel."
    item.draft_category = "Siyaset"
    _save_runtime(tmp_path, item, article)

    packs, skipped, _ = _build_editorial_packs(tmp_path, min_score=0.68, max_source_age_hours=72, limit=20)

    assert packs == []
    assert any(row["queueId"] == item.queue_id and row["reason"] == "near-duplicate live event" for row in skipped)


def test_prepare_board_excludes_ai_access_duplicate_using_normalized_context(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
    content.mkdir(parents=True)
    (content / "anthropic-karari-avrupada-egemen-yapay-zeka-tartismasini-buyuttu.md").write_text(
        """---
title: "Anthropic kararı Avrupa’da egemen yapay zekâ tartışmasını büyüttü"
description: "ABD yönetiminin talimatı sonrası Anthropic’in bazı üst seviye modellerine yabancı kullanıcı erişimini durdurması, Avrupa’da teknoloji bağımlılığı ve yerli yapay zekâ yatırımları tartışmasını yeniden öne çıkardı."
sources:
  - name: "Euronews World"
    url: "https://www.euronews.com/2026/06/13/wake-up-call-europe-reacts-to-anthropic-halting-access-to-its-fable-5-and-mythos-5-ai-mode"
---
ABD merkezli Anthropic’in Fable 5 ve Mythos 5 modellerine yabancı kullanıcı erişimini durdurması, Avrupa’da yapay zekâ egemenliği tartışmasını sertleştirdi.
""",
        encoding="utf-8",
    )
    article = _article("anthropic-eu-dependency", url="https://www.politico.eu/article/us-anthropic-order-exposes-eu-ai-dependency/")
    article.title = "US’s Anthropic order exposes EU’s AI dependency"
    article.summary = "Washington's export controls on Anthropic spark renewed calls for Europe to accelerate development of its own cutting-edge AI models"
    article.content_snippet = "The net effect of this order is that we must abruptly disable Fable 5 and Mythos 5 for all our customers to ensure compliance, Anthropic said."
    item = _item("anthropic-eu-dependency", normalized_id=article.id, url=str(article.canonical_url), priority=0.91)
    item.draft_title = "US’s Anthropic order exposes EU’s AI dependency"
    item.draft_description = article.summary
    item.draft_category = "Teknoloji"
    _save_runtime(tmp_path, item, article)

    packs, skipped, _ = _build_editorial_packs(tmp_path, min_score=0.68, max_source_age_hours=72, limit=20)

    assert packs == []
    assert any(row["queueId"] == item.queue_id and row["reason"] == "near-duplicate live event" for row in skipped)


def test_prepare_board_keeps_clean_candidate_that_only_needs_asteria_polish(tmp_path: Path) -> None:
    article = _article("clean-polish-needed", url="https://example.org/demo/clean-polish-needed")
    article.title = "European regulators approve major AI infrastructure plan"
    article.summary = "Regulators approved a large artificial intelligence infrastructure investment plan."
    item = _item("clean-polish-needed", normalized_id=article.id, url=str(article.canonical_url), priority=0.82, notes=[])
    item.draft_title = "Avrupalı düzenleyiciler büyük yapay zekâ altyapı planını onayladı"
    item.draft_description = "Karar, veri merkezi ve çip kapasitesini büyütmeyi hedefleyen yeni planı kapsıyor."
    item.draft_category = "Teknoloji"
    _save_runtime(tmp_path, item, article)

    packs, skipped, _ = _build_editorial_packs(tmp_path, min_score=0.68, max_source_age_hours=72, limit=20)

    assert [pack["queueId"] for pack in packs] == [item.queue_id]
    assert packs[0]["strictGate"] == {"passesNow": False, "reason": "missing Asteria editorial polish"}
    assert not any(row.get("queueId") == item.queue_id for row in skipped)


def test_duplicate_publish_gate_note_excludes_candidate_from_publish_and_board(tmp_path: Path) -> None:
    article = _article("duplicate-note", url="https://example.org/demo/duplicate-note")
    item = _item(
        "duplicate-note",
        normalized_id=article.id,
        url="https://example.org/demo/duplicate-note",
        priority=0.91,
        notes=["asteria-editorial-polish", "duplicate-publish-gate: near-duplicate live event already published in existing.md"],
    )
    _save_runtime(tmp_path, item, article)

    candidate, rejections = _select_candidate(tmp_path, min_score=0.68, max_source_age_hours=72)
    selected, skipped, _ = _select_headline_board(tmp_path, [item], limit=10, max_source_age_hours=72)

    assert candidate is None
    assert rejections[0]["reason"] == "duplicate-publish-gate item"
    assert selected == []
    assert skipped[0]["reason"] == "excluded by editorial note"


def test_missing_normalized_article_blocks_publish_and_board_selection(tmp_path: Path) -> None:
    item = _item("missing-normalized", normalized_id="missing-normalized", url="https://example.org/demo/missing-normalized", priority=0.91)
    JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).save(item.queue_id, item)

    candidate, rejections = _select_candidate(tmp_path, min_score=0.68, max_source_age_hours=72)
    selected, skipped, _ = _select_headline_board(tmp_path, [item], limit=10, max_source_age_hours=72)

    assert candidate is None
    assert rejections[0]["reason"] == "missing normalized article"
    assert selected == []
    assert skipped[0]["reason"] == "missing normalized article"


def test_direct_publish_refuses_missing_normalized_article(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    item = _item("missing-normalized-publish", normalized_id="missing-normalized-publish", url="https://example.org/demo/missing-normalized-publish", priority=0.91)
    item.status = "approved"  # type: ignore[assignment]
    JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).save(item.queue_id, item)

    with pytest.raises(typer.BadParameter, match="normalized article missing"):
        publish_queue_item(item.queue_id)


def test_tv_show_source_format_is_excluded_from_publish_and_board(tmp_path: Path) -> None:
    article = _article(
        "tv-show-format",
        url="https://www.france24.com/en/tv-shows/tech-24/20260614-tech-24-takes-to-the-skies",
    )
    item = _item("tv-show-format", normalized_id=article.id, url=str(article.canonical_url), priority=0.91)
    item.draft_title = "Tech 24 takes to the skies as VivaTech takes over the Champs-Elysées"
    item.draft_description = "France's biggest geek get-together started with a bang this year."
    _save_runtime(tmp_path, item, article)

    candidate, rejections = _select_candidate(tmp_path, min_score=0.68, max_source_age_hours=72)
    selected, skipped, _ = _select_headline_board(tmp_path, [item], limit=10, max_source_age_hours=72)

    assert candidate is None
    assert rejections[0]["reason"] == "excluded source format (podcast/liveblog)"
    assert selected == []
    assert skipped[0]["reason"] == "excluded source format (podcast/liveblog)"


def test_publish_one_retries_next_candidate_after_duplicate_publish_gate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    first_article = _article("dup-first", url="https://example.org/demo/dup-first")
    second_article = _article("clean-second", url="https://example.org/demo/clean-second")
    first = _item("dup-first", normalized_id=first_article.id, url="https://example.org/demo/dup-first", priority=0.93)
    second = _item("clean-second", normalized_id=second_article.id, url="https://example.org/demo/clean-second", priority=0.91)
    _save_runtime(tmp_path, first, first_article)
    _save_runtime(tmp_path, second, second_article)
    calls: list[str] = []

    def fake_publish(queue_id: str, **_: object) -> None:
        calls.append(queue_id)
        if queue_id == first.queue_id:
            raise typer.BadParameter("near-duplicate live event already published in existing.md")
        print("published: src/content/equinoxHaber/clean-second.md")

    monkeypatch.setattr(heartbeat_publish_one, "publish_queue_item", fake_publish)
    monkeypatch.setattr(heartbeat_publish_one, "audit_images_command", lambda: None)
    monkeypatch.setattr(heartbeat_publish_one, "audit_content_command", lambda **_: None)
    monkeypatch.setattr(heartbeat_publish_one, "_git_commit_and_push", lambda message, push: [{"name": "git", "ok": True, "stdout": "no changes"}])
    monkeypatch.setattr(heartbeat_publish_one, "_run_shell", lambda *args, **kwargs: {"name": args[0], "ok": True, "stdout": "build ok", "stderr": ""})
    monkeypatch.setattr(heartbeat_publish_one, "_mark_cycle_completed", lambda root, result: None)
    monkeypatch.setattr(heartbeat_publish_one, "_recent_cycle_guard", lambda root, min_interval_seconds, force: (True, {"forced": True}))

    publish_one_command(execute=True, json_output=True, push=False, collect_first=False, build=False, duplicate_retry_limit=1)

    assert calls == [first.queue_id, second.queue_id]
    stored_first = JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).load(first.queue_id)
    assert stored_first is not None
    assert stored_first.status == "rejected"
    assert any(note.startswith("duplicate-publish-gate:") for note in stored_first.notes)


def test_queue_polish_requires_explicit_retry_for_duplicate_rejected_item(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    article = _article("dup-polish", url="https://example.org/demo/dup-polish")
    item = _item(
        "dup-polish",
        normalized_id=article.id,
        url="https://example.org/demo/dup-polish",
        notes=["duplicate-publish-gate: near-duplicate live event already published in existing.md"],
    )
    _save_runtime(tmp_path, item, article)

    with pytest.raises(typer.BadParameter, match="duplicate-publish-gate"):
        queue_polish_command(
            item.queue_id,
            title=item.draft_title,
            description=item.draft_description,
            category="Teknoloji",
            facts_json='["Birinci Türkçe gerçek cümlesi yayıma uygun bağlam taşıyor.", "İkinci Türkçe gerçek cümlesi kaynak kararını açıklıyor."]',
            body=item.draft_body,
            hero_prompt=item.hero_prompt,
            hero_alt=item.hero_alt,
            tags_json='["demo"]',
            json_output=True,
        )


def test_queue_polish_explicit_duplicate_retry_clears_blocking_note(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    article = _article("dup-polish-reset", url="https://example.org/demo/dup-polish-reset")
    item = _item(
        "dup-polish-reset",
        normalized_id=article.id,
        url="https://example.org/demo/dup-polish-reset",
        priority=0.91,
        notes=["duplicate-publish-gate: near-duplicate live event already published in existing.md"],
    )
    _save_runtime(tmp_path, item, article)

    queue_polish_command(
        item.queue_id,
        title=item.draft_title,
        description=item.draft_description,
        category="Teknoloji",
        facts_json='["Birinci Türkçe gerçek cümlesi yayıma uygun bağlam taşıyor.", "İkinci Türkçe gerçek cümlesi kaynak kararını açıklıyor."]',
        body=item.draft_body,
        hero_prompt=item.hero_prompt,
        hero_alt=item.hero_alt,
        tags_json='["demo"]',
        allow_duplicate_retry=True,
        json_output=True,
    )

    stored = JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).load(item.queue_id)
    assert stored is not None
    assert not any(note.startswith("duplicate-publish-gate:") for note in stored.notes)
    assert any(note.startswith("duplicate-retry-reset:") for note in stored.notes)


def test_process_preserves_rejected_polished_item_instead_of_rewriting_or_resurrecting(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    config = tmp_path / "news_pipeline/news_pipeline/config"
    config.mkdir(parents=True)
    (config / "sources.yaml").write_text(
        "sources:\n  - id: demo-source\n    name: Demo Source\n    kind: rss\n    url: https://example.org/rss.xml\n    category_hints: [Teknoloji]\n",
        encoding="utf-8",
    )
    raw = RawArticle(
        source_id="demo-source",
        fetched_at=datetime.now(UTC),
        url="https://example.org/demo/process-overwrite",
        title="English source title should not overwrite rejected polish",
        summary="English summary should not overwrite Asteria's Turkish polish.",
        published_at=datetime.now(UTC),
        metadata={},
    )
    raw_store = JsonStore(tmp_path / "news_pipeline/data/raw", RawArticle)
    raw_store.save("raw-process-overwrite", raw)

    normalized = ArticleNormalizer().normalize(
        raw,
        SourceConfig(id="demo-source", name="Demo Source", kind="rss", url="https://example.org/rss.xml", category_hints=["Teknoloji"]),
    )
    item = _item(
        "process-overwrite",
        normalized_id=normalized.id,
        status="rejected",
        url="https://example.org/demo/process-overwrite",
        notes=["asteria-editorial-polish", "duplicate-publish-gate: near-duplicate live event already published in existing.md"],
    )
    item.draft_title = "Asteria'nın Türkçe başlığı korunmalı"
    item.draft_description = "Asteria'nın Türkçe açıklaması yeniden işleme sırasında ezilmemeli."
    _save_runtime(tmp_path, item, normalized)

    process_command(config_path="news_pipeline/news_pipeline/config/sources.yaml", verbose=False, reprocess_all=False, purge_stale_raw_hours=0)

    stored = JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).load(item.queue_id)
    assert stored is not None
    assert stored.status == "rejected"
    assert stored.draft_title == "Asteria'nın Türkçe başlığı korunmalı"
    assert stored.draft_description == "Asteria'nın Türkçe açıklaması yeniden işleme sırasında ezilmemeli."


def test_process_reprocess_all_preserves_active_rejected_terminal_item(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    config = tmp_path / "news_pipeline/news_pipeline/config"
    config.mkdir(parents=True)
    (config / "sources.yaml").write_text(
        "sources:\n  - id: demo-source\n    name: Demo Source\n    kind: rss\n    url: https://example.org/rss.xml\n    category_hints: [Teknoloji]\n",
        encoding="utf-8",
    )
    raw = RawArticle(
        source_id="demo-source",
        fetched_at=datetime.now(UTC),
        url="https://example.org/demo/process-reprocess-terminal",
        title="English source title should not overwrite rejected terminal",
        summary="English summary should not overwrite terminal queue evidence.",
        published_at=datetime.now(UTC),
        metadata={},
    )
    raw_store = JsonStore(tmp_path / "news_pipeline/data/raw", RawArticle)
    raw_store.save("raw-process-reprocess-terminal", raw)
    normalized = ArticleNormalizer().normalize(
        raw,
        SourceConfig(id="demo-source", name="Demo Source", kind="rss", url="https://example.org/rss.xml", category_hints=["Teknoloji"]),
    )
    item = _item("process-reprocess-terminal", normalized_id=normalized.id, status="rejected", url="https://example.org/demo/process-reprocess-terminal")
    item.draft_title = "Terminal Türkçe başlık korunmalı"
    item.draft_description = "Terminal açıklama yeniden işleme sırasında ezilmemeli."
    _save_runtime(tmp_path, item, normalized)

    process_command(config_path="news_pipeline/news_pipeline/config/sources.yaml", verbose=False, reprocess_all=True, purge_stale_raw_hours=0)

    stored = JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).load(item.queue_id)
    assert stored is not None
    assert stored.status == "rejected"
    assert stored.draft_title == "Terminal Türkçe başlık korunmalı"
    assert stored.draft_description == "Terminal açıklama yeniden işleme sırasında ezilmemeli."


def test_queue_reject_preserves_pre_reject_priority(tmp_path: Path) -> None:
    article = _article("reject-score", url="https://example.org/demo/reject-score")
    item = _item("reject-score", normalized_id=article.id, url="https://example.org/demo/reject-score", priority=0.734)
    _save_runtime(tmp_path, item, article)
    service = QueueService(tmp_path / "news_pipeline/data/queue")

    rejected = service.reject(item.queue_id, note="manual test reject")

    assert rejected is not None
    assert rejected.editorial_priority == 0.0
    assert "pre-reject-priority: 0.734" in rejected.notes
    assert "manual test reject" in rejected.notes


def test_queue_cleanup_auto_reject_preserves_pre_reject_priority(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    article = _article("cleanup-reject-score", url="https://example.org/demo/cleanup-reject-score")
    item = _item("cleanup-reject-score", normalized_id=article.id, url="https://example.org/demo/cleanup-reject-score", priority=0.49)
    _save_runtime(tmp_path, item, article)

    queue_cleanup_command(
        low_score_reject=0.50,
        low_score_grace_hours=0,
        archive_terminal_hours=999,
        stale_source_hours=999,
        purge_rejected_archive_hours=999,
        purge_published_archive_hours=999,
    )

    stored = JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).load(item.queue_id)
    assert stored is not None
    assert stored.status == "rejected"
    assert stored.editorial_priority == 0.0
    assert "pre-reject-priority: 0.490" in stored.notes
    assert any(note.startswith("low-score-auto-reject:") for note in stored.notes)


def test_process_does_not_resurrect_archived_terminal_item(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    config = tmp_path / "news_pipeline/news_pipeline/config"
    config.mkdir(parents=True)
    (config / "sources.yaml").write_text(
        "sources:\n  - id: demo-source\n    name: Demo Source\n    kind: rss\n    url: https://example.org/rss.xml\n    category_hints: [Teknoloji]\n",
        encoding="utf-8",
    )
    raw = RawArticle(
        source_id="demo-source",
        fetched_at=datetime.now(UTC),
        url="https://example.org/demo/archive-resurrection",
        title="Archived terminal story should not return",
        summary="The same raw article reappeared after it had already been archived.",
        published_at=datetime.now(UTC),
        metadata={},
    )
    raw_store = JsonStore(tmp_path / "news_pipeline/data/raw", RawArticle)
    raw_store.save("raw-archive-resurrection", raw)

    normalized = ArticleNormalizer().normalize(
        raw,
        SourceConfig(id="demo-source", name="Demo Source", kind="rss", url="https://example.org/rss.xml", category_hints=["Teknoloji"]),
    )
    archived = _item(
        "archive-resurrection",
        normalized_id=normalized.id,
        status="published",
        url="https://example.org/demo/archive-resurrection",
        notes=["asteria-editorial-polish"],
    )
    JsonStore(tmp_path / "news_pipeline/data/normalized", NormalizedArticle).save(normalized.id, normalized)
    JsonStore(tmp_path / "news_pipeline/data/queue_archive", QueueItem).save(archived.queue_id, archived)

    process_command(config_path="news_pipeline/news_pipeline/config/sources.yaml", verbose=False, reprocess_all=False, purge_stale_raw_hours=0)

    active_items = JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).list_all()
    assert active_items == []


def test_process_reprocess_all_still_does_not_resurrect_archived_terminal_item(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    config = tmp_path / "news_pipeline/news_pipeline/config"
    config.mkdir(parents=True)
    (config / "sources.yaml").write_text(
        "sources:\n  - id: demo-source\n    name: Demo Source\n    kind: rss\n    url: https://example.org/rss.xml\n    category_hints: [Teknoloji]\n",
        encoding="utf-8",
    )
    raw = RawArticle(
        source_id="demo-source",
        fetched_at=datetime.now(UTC),
        url="https://example.org/demo/archive-reprocess-all",
        title="Archived terminal story should not return under reprocess all",
        summary="The same raw article reappeared after it had already been archived.",
        published_at=datetime.now(UTC),
        metadata={},
    )
    raw_store = JsonStore(tmp_path / "news_pipeline/data/raw", RawArticle)
    raw_store.save("raw-archive-reprocess-all", raw)
    normalized = ArticleNormalizer().normalize(
        raw,
        SourceConfig(id="demo-source", name="Demo Source", kind="rss", url="https://example.org/rss.xml", category_hints=["Teknoloji"]),
    )
    archived = _item("archive-reprocess-all", normalized_id=normalized.id, status="published", url="https://example.org/demo/archive-reprocess-all")
    JsonStore(tmp_path / "news_pipeline/data/normalized", NormalizedArticle).save(normalized.id, normalized)
    JsonStore(tmp_path / "news_pipeline/data/queue_archive", QueueItem).save(archived.queue_id, archived)

    process_command(config_path="news_pipeline/news_pipeline/config/sources.yaml", verbose=False, reprocess_all=True, purge_stale_raw_hours=0)

    assert JsonStore(tmp_path / "news_pipeline/data/queue", QueueItem).list_all() == []


def test_queue_approve_refuses_rejected_item_without_explicit_recovery(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    article = _article("approve-rejected", url="https://example.org/demo/approve-rejected")
    item = _item("approve-rejected", normalized_id=article.id, url="https://example.org/demo/approve-rejected", status="rejected")
    _save_runtime(tmp_path, item, article)

    with pytest.raises(typer.BadParameter, match="queue item is rejected"):
        queue_approve_command(item.queue_id)



def test_body_english_gate_allows_turkish_body_with_english_source_name() -> None:
    body = "\n\n".join(
        [
            "Rusya’nın Ukrayna’daki kara taarruzu, aylardır süren yoğun bombardımana rağmen cephede yavaşlama işaretleri veriyor. France 24’ün AFP ve Institute for the Study of War verilerine dayandırdığı değerlendirmeye göre Rusya Savunma Bakanlığı’nın yeni yerleşim yeri ele geçirme açıklamaları daha seyrek hale geldi.",
            "AFP’nin ISW verileri üzerinden yaptığı analize göre Rus ordusu nisan ve mayıs aylarında Ukrayna’da kazandığından daha fazla toprak kaybetti. Bu değişim cephe hattını tek başına dönüştürecek büyüklükte değil, ancak Moskova’nın sayı ve teçhizat üstünlüğüne rağmen hızlı ilerleme üretemediğini gösteren önemli bir işaret sayılıyor.",
            "Askerî uzmanlar yavaşlamada drone savaşının belirleyici hale gelmesine dikkat çekiyor. Cephe hattının iki yanında yoğunlaşan insansız hava araçları, birlik hareketlerini zorlaştıran geniş bir ölü bölge yaratıyor.",
        ]
    )

    assert body_looks_too_english(body) is False



def test_body_english_gate_still_blocks_english_body() -> None:
    body = " ".join(
        [
            "The ministry said the plan will continue after the conference and officials are talking with allies.",
            "Everyone is focused on violations over the border and the exchange of intelligence through the new process.",
            "The report says the military is planning a broader campaign with partners and more announcements are expected.",
        ]
    )

    assert body_looks_too_english(body) is True



def test_headline_board_penalizes_recent_topic_family_saturation(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
    content.mkdir(parents=True)
    for index, title in enumerate(
        [
            "Ukrayna saldırıları Rus enerji altyapısını hedef aldı",
            "Bulgaristan, Ukrayna için yeni savunma kararını açıkladı",
        ],
        start=1,
    ):
        (content / f"ukraine-{index}.md").write_text(
            f"""---
title: "{title}"
description: "Ukrayna ve Rusya savaşına ilişkin yeni gelişme duyuruldu."
pubDate: '2026-06-13T1{index}:00:00+03:00'
tags: ["Ukrayna", "Rusya", "savaş"]
category: "Siyaset"
sources:
  - name: "Demo Source"
    url: "https://example.org/ukraine-{index}"
---
Gövde.
""",
            encoding="utf-8",
        )

    article = _article("ukraine-article", url="https://example.org/demo/ukraine")
    article.title = "Ukraine reports new diplomatic talks with allies"
    article.summary = "Ukraine and Russia remain central to the war diplomacy track."
    article.tags = ["ukraine", "russia", "war"]
    item = _item(
        normalized_id=article.id,
        url="https://example.org/demo/ukraine",
        priority=0.90,
    )
    item.draft_title = "Ukrayna, müttefiklerle yeni diplomasi görüşmeleri yürütüyor"
    item.draft_description = "Ukrayna savaşı çevresindeki diplomasi trafiği yeni görüşmelerle devam ediyor."
    item.draft_category = "Siyaset"
    item.draft_tags = ["Ukrayna", "Rusya", "diplomasi"]
    _save_runtime(tmp_path, item, article)

    score, reasons = _board_score(tmp_path, item, recent_posts=[])

    assert score <= item.editorial_priority - 0.20
    assert "recency_penalty:topic_family_repeat:Ukraine/Russia war:2" in reasons



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


def test_headline_board_does_not_boost_localized_kidnapping_as_security_signal(tmp_path: Path) -> None:
    article = _article("haiti-kidnap", url="https://example.org/demo/haiti-kidnap")
    article.title = "Armed men kidnap high-ranking security official in Haiti"
    article.summary = "A senior official was abducted in Port-au-Prince amid gang violence."
    item = _item(
        "haiti-kidnap",
        normalized_id=article.id,
        url="https://example.org/demo/haiti-kidnap",
        priority=0.692,
    )
    item.draft_title = "Haiti’de üst düzey güvenlik yetkilisi silahlı kişilerce kaçırıldı"
    item.draft_description = "Savunma bakanlığına yakın bir güvenlik yetkilisinin kaçırılması çete şiddeti bağlamında aktarılıyor."
    item.draft_category = "Siyaset"
    item.draft_tags = ["Haiti", "güvenlik", "kaçırılma"]
    _save_runtime(tmp_path, item, article)

    score, reasons = _board_score(tmp_path, item, recent_posts=[])

    assert score == pytest.approx(0.632)
    assert "risk_penalty:localized_crime" in reasons
    assert "signal_boost:security" not in reasons


def test_headline_board_does_not_boost_social_security_as_security_signal(tmp_path: Path) -> None:
    article = _article("social-security", url="https://example.org/demo/social-security")
    article.title = "Social Security’s COLA could rise as inflation hits a three-year high"
    article.summary = "Retirement benefit estimates changed with inflation data."
    item = _item(
        "social-security",
        normalized_id=article.id,
        url="https://example.org/demo/social-security",
        priority=0.621,
    )
    item.draft_title = "Social Security’s COLA could rise as inflation hits a three-year high"
    item.draft_description = "ABD emeklilik ödemelerine ilişkin teknik bir enflasyon hesabı aktarılıyor."
    item.draft_category = "Ekonomi"
    _save_runtime(tmp_path, item, article)

    score, reasons = _board_score(tmp_path, item, recent_posts=[])

    assert score == pytest.approx(0.621)
    assert "signal_boost:security" not in reasons



def test_headline_board_limits_same_topic_family_in_selected_board(tmp_path: Path) -> None:
    item_one_article = _article("anthropic-one", url="https://example.org/demo/anthropic-one")
    item_one_article.title = "Anthropic disables Fable 5 after government order"
    item_one_article.summary = "Anthropic and Claude model access are affected."
    item_one_article.tags = ["anthropic", "claude", "fable"]
    item_one = _item("anthropic-one", normalized_id=item_one_article.id, url="https://example.org/demo/anthropic-one", priority=0.91)
    item_one.draft_title = "Anthropic, Fable 5 erişimini hükümet kararı sonrası kapatıyor"
    item_one.draft_description = "Claude model ailesindeki erişim değişikliği yeni kısıtlamalarla bağlantılı."
    item_one.draft_tags = ["Anthropic", "Claude", "Fable"]

    item_two_article = _article("anthropic-two", url="https://example.org/demo/anthropic-two")
    item_two_article.title = "Claude users lose access to Mythos 5"
    item_two_article.summary = "Anthropic is also changing Mythos access."
    item_two_article.tags = ["anthropic", "claude", "mythos"]
    item_two = _item("anthropic-two", normalized_id=item_two_article.id, url="https://example.org/demo/anthropic-two", priority=0.89)
    item_two.draft_title = "Claude kullanıcıları Mythos 5 erişimini kaybediyor"
    item_two.draft_description = "Anthropic, model erişiminde ikinci bir kısıtlama daha uyguluyor."
    item_two.draft_tags = ["Anthropic", "Claude", "Mythos"]

    _save_runtime(tmp_path, item_one, item_one_article)
    _save_runtime(tmp_path, item_two, item_two_article)
    selected, _, meta = _select_headline_board(tmp_path, [item_one, item_two], limit=10, max_source_age_hours=72)

    assert [item.queue_id for item in selected] == ["anthropic-one"]
    assert meta["diagnostics"]["topicFamilyCounts"] == {"anthropic_models": 1}


def test_headline_board_excludes_low_score_category_fill_even_behind_stronger_global_item(tmp_path: Path) -> None:
    science_article = _article("peatlands", url="https://example.org/demo/peatlands")
    science_article.title = "Damaged boreal peatlands may triple methane emissions, reshaping climate risk"
    science_article.summary = "A climate study reports higher methane emissions from damaged peatlands."
    science_item = _item("peatlands", normalized_id=science_article.id, url="https://example.org/demo/peatlands", priority=0.59)
    science_item.draft_title = "Hasarlı kuzey turbalıkları metan salımını üç kata çıkarabilir"
    science_item.draft_description = "Bilimsel çalışma, sismik hatların turbalıklarda metan salımını artırdığını bildiriyor."
    science_item.draft_category = "Bilim"
    science_item.draft_tags = ["iklim", "metan", "turbalık"]

    ukraine_article = _article("ukraine-energy", url="https://example.org/demo/ukraine-energy")
    ukraine_article.title = "Ukraine to keep targeting Russian energy after hitting sea terminal"
    ukraine_article.summary = "Ukraine says Russian energy infrastructure will remain a target after a sea terminal strike."
    ukraine_item = _item("ukraine-energy", normalized_id=ukraine_article.id, url="https://example.org/demo/ukraine-energy", priority=0.758)
    ukraine_item.draft_title = "Ukrayna, Rus enerji altyapısını hedef almaya devam edecek"
    ukraine_item.draft_description = "Kiev, deniz terminali saldırısından sonra Rus enerji altyapısının hedefte kalacağını söylüyor."
    ukraine_item.draft_category = "Ekonomi"
    ukraine_item.draft_tags = ["Ukrayna", "Rusya", "enerji"]

    _save_runtime(tmp_path, science_item, science_article)
    _save_runtime(tmp_path, ukraine_item, ukraine_article)

    selected, skipped, meta = _select_headline_board(tmp_path, [science_item, ukraine_item], limit=10, max_source_age_hours=72)

    assert [item.queue_id for item in selected] == ["ukraine-energy"]
    assert any(row["queueId"] == "peatlands" and row["reason"] == "score below threshold (0.590)" for row in skipped)
    assert meta["diagnostics"]["minCategoryTargetScore"] == 0.68


def test_politics_is_not_treated_as_hot_category(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
    content.mkdir(parents=True)
    for index, title in enumerate(
        [
            "G7 liderleri yeni güvenlik gündemiyle toplandı",
            "Avrupa başkentleri savunma planlarını güncelledi",
            "Asya-Pasifik zirvesi yeni diplomasi başlıkları açtı",
        ],
        start=1,
    ):
        (content / f"recent-politics-{index}.md").write_text(
            f"""---
title: "{title}"
description: "Son siyasi gelişmeler küresel gündemde izleniyor."
pubDate: '2026-06-15T1{index}:00:00+03:00'
category: "Siyaset"
tags: ["siyaset", "diplomasi"]
sources:
  - name: "Recent Source {index}"
    url: "https://example.org/recent-politics-{index}"
---
Gövde.
""",
            encoding="utf-8",
        )

    assert _hot_category(tmp_path) is None


def test_economy_is_not_treated_as_hot_category(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
    content.mkdir(parents=True)
    for index, title in enumerate(
        [
            "Enerji fiyatları Avrupa sanayisi üzerinde baskı kuruyor",
            "Petrol piyasaları yeni arz beklentisiyle geriledi",
            "Merkez bankaları büyüme tahminlerini güncelledi",
        ],
        start=1,
    ):
        (content / f"recent-economy-{index}.md").write_text(
            f"""---
title: "{title}"
description: "Küresel ekonomi gündeminde yeni gelişme izleniyor."
pubDate: '2026-06-15T1{index}:00:00+03:00'
category: "Ekonomi"
tags: ["ekonomi", "piyasa"]
sources:
  - name: "Recent Economy Source {index}"
    url: "https://example.org/recent-economy-{index}"
---
Gövde.
""",
            encoding="utf-8",
        )

    assert _hot_category(tmp_path) is None


def test_non_core_category_can_still_be_hot_without_starving_board_fill(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
    content.mkdir(parents=True)
    for index, title in enumerate(
        [
            "Yeni yapay zeka güvenlik standardı açıklandı",
            "Çip üreticileri veri merkezi talebiyle büyüyor",
            "Robotik yazılım pazarı yeni yatırımlarla genişledi",
        ],
        start=1,
    ):
        (content / f"recent-tech-{index}.md").write_text(
            f"""---
title: "{title}"
description: "Teknoloji sektöründe yeni gelişme izleniyor."
pubDate: '2026-06-15T1{index}:00:00+03:00'
category: "Teknoloji"
tags: ["teknoloji", "yapay zeka"]
sources:
  - name: "Recent Tech Source {index}"
    url: "https://example.org/recent-tech-{index}"
---
Gövde.
""",
            encoding="utf-8",
        )

    politics_one_article = _article("global-education", url="https://example.org/demo/global-education")
    politics_one_article.title = "Attacks on education rise globally, monitoring study says"
    politics_one_article.summary = "A monitoring group reports attacks on schools and teachers in multiple regions."
    politics_one = _item("global-education", normalized_id=politics_one_article.id, url="https://example.org/demo/global-education", priority=0.73)
    politics_one.draft_title = "Attacks on education, pupils and staff around the world up by 40%, says study"
    politics_one.draft_description = "A monitoring group reports a global rise in attacks affecting schools, pupils and education staff."
    politics_one.draft_category = "Siyaset"
    politics_one.draft_sources = [DraftSource(name="Global Monitor", url="https://example.org/demo/global-education")]

    politics_two_article = _article("china-church", url="https://example.org/demo/china-church")
    politics_two_article.title = "China detains two leaders of influential underground church"
    politics_two_article.summary = "Authorities detained religious leaders in a case watched by rights groups."
    politics_two = _item("china-church", normalized_id=politics_two_article.id, url="https://example.org/demo/china-church", priority=0.71)
    politics_two.draft_title = "China detains two leaders of influential underground church"
    politics_two.draft_description = "Rights groups say the detentions add pressure on an influential underground church network."
    politics_two.draft_category = "Siyaset"
    politics_two.draft_sources = [DraftSource(name="Rights Wire", url="https://example.org/demo/china-church")]

    tech_article = _article("ai-security", url="https://example.org/demo/ai-security")
    tech_article.title = "New AI security framework targets espionage risks"
    tech_article.summary = "Governments are updating security guidance for artificial intelligence tools."
    tech_item = _item("ai-security", normalized_id=tech_article.id, url="https://example.org/demo/ai-security", priority=0.72)
    tech_item.draft_title = "New AI security framework targets espionage risks"
    tech_item.draft_description = "The framework asks agencies to assess AI systems against espionage and data leak risks."
    tech_item.draft_category = "Teknoloji"
    tech_item.draft_sources = [DraftSource(name="Tech Policy Wire", url="https://example.org/demo/ai-security")]

    for item, article in ((politics_one, politics_one_article), (politics_two, politics_two_article), (tech_item, tech_article)):
        _save_runtime(tmp_path, item, article)

    selected, _, meta = _select_headline_board(
        tmp_path,
        [politics_one, politics_two, tech_item],
        limit=10,
        max_source_age_hours=72,
    )

    selected_ids = {item.queue_id for item in selected}
    assert {"global-education", "china-church", "ai-security"} <= selected_ids
    assert meta["diagnostics"]["hotCategory"] == "Teknoloji"
    assert meta["diagnostics"]["hotCategoryPolicy"] == "skip_target_fill_only"
    assert meta["diagnostics"]["hotCategoryBoardLimit"] is None
    assert meta["diagnostics"]["hotCategoryExemptCategories"] == ["Ekonomi", "Siyaset"]



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


def test_prepare_board_keeps_single_recent_topic_family_as_ranking_signal(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
    content.mkdir(parents=True)
    (content / "ukraine-existing.md").write_text(
        """---
title: "Putin ve Zelenskiy, G7 öncesi Trump’la ayrı ayrı görüştü"
description: "Ukrayna savaşı G7 gündeminde kalıyor."
pubDate: '2026-06-15T10:00:00+03:00'
category: "Siyaset"
tags: ["ukrayna", "rusya", "g7"]
sources:
  - name: "France 24 World"
    url: "https://example.org/existing-ukraine"
---
Gövde.
""",
        encoding="utf-8",
    )
    article = _article("ukraine-cathedral", url="https://example.org/demo/ukraine-cathedral")
    article.title = "Russian strikes damage historic Kyiv cathedral in Ukraine"
    article.summary = "Russian attacks across Ukraine damaged a Kyiv cathedral and killed civilians."
    item = _item("ukraine-cathedral", normalized_id=article.id, url="https://example.org/demo/ukraine-cathedral", priority=0.734)
    item.draft_title = "Russian strikes kill nine in Ukraine and damage historic cathedral, officials say"
    item.draft_description = "Officials said Russian strikes damaged a historic Kyiv cathedral and killed civilians."
    item.draft_category = "Siyaset"
    item.draft_tags = ["Ukraine", "Russia", "Kyiv"]
    _save_runtime(tmp_path, item, article)

    selected, skipped, meta = _select_headline_board(tmp_path, [item], limit=10, max_source_age_hours=72)

    assert [row.queue_id for row in selected] == ["ukraine-cathedral"]
    assert not any(row.get("queueId") == "ukraine-cathedral" for row in skipped)
    assert meta["diagnostics"]["recentTopicFamilyPenaltyThreshold"] == 2


def test_prepare_selection_policy_makes_diversity_a_tiebreaker_not_veto() -> None:
    policy = _selection_policy(0.68)

    brake = policy["emptyCycleBrake"]
    assert brake["enabled"] is True
    assert "raw score >= 0.68" in brake["minimumCandidate"]
    assert "tie-breaker, not a veto" in brake["diversityOverride"]
    assert "solely because recent posts" in brake["diversityOverride"]
    assert "hard veto" in policy["manualReviewRequires"]
    assert "missing Asteria editorial polish' is not a rejection reason" in policy["strictGateInterpretation"]


def test_opinion_urls_are_excluded_source_format() -> None:
    item = _item(url="https://www.theguardian.com/commentisfree/2026/jun/15/europe-us-big-tech")
    item.draft_title = "Europe is breaking up with US big tech | Comment"

    assert _is_excluded_source_format(item) is True


def test_recent_live_posts_detects_company_signals_beyond_title(tmp_path: Path) -> None:
    content = tmp_path / "src/content/equinoxHaber"
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
    (tmp_path / "src/content/equinoxHaber").mkdir(parents=True)

    def duplicate_publish(*args, **kwargs):
        raise typer.BadParameter("near-duplicate live topic from same source already published in existing.md")

    monkeypatch.setattr(heartbeat_publish_one, "publish_queue_item", duplicate_publish)

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
