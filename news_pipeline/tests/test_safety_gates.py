from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import typer

from news_pipeline.cli.commands.audit_content import audit_content_command
from news_pipeline.cli.commands.collect import _is_due
from news_pipeline.cli.commands import heartbeat_publish_one
from news_pipeline.cli.commands.heartbeat_publish_one import _select_candidate, publish_one_command
from news_pipeline.cli.commands.heartbeat_prepare_one import _board_score, _recent_live_posts, _select_headline_board
from news_pipeline.cli.commands.publish import _assert_not_duplicate_live, _assert_not_duplicate_topic, publish_command, publish_queue_item
from news_pipeline.editorial.autonomy import body_looks_too_english, is_autopublish_candidate
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


def test_headline_board_keeps_low_score_category_fill_behind_stronger_global_item(tmp_path: Path) -> None:
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

    selected, _, meta = _select_headline_board(tmp_path, [science_item, ukraine_item], limit=10, max_source_age_hours=72)

    assert [item.queue_id for item in selected] == ["ukraine-energy", "peatlands"]
    assert meta["diagnostics"]["minCategoryTargetScore"] == 0.68



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
