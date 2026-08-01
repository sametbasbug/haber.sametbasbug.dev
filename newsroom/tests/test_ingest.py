"""Toplama ve çıkarım testleri. Ağ gerektirmez."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from newsroom.extract import MIN_ARTICLE_TEXT, article_text, published_at_from_page
from newsroom.ingest import canonicalize, candidate_id, clean_text
from newsroom.sources import Source, due_sources, load_sources


class TestSources:
    def test_yapilandirma_okunur(self) -> None:
        sources = load_sources()
        assert len(sources) >= 30
        assert all(source.enabled for source in sources)
        assert len({source.id for source in sources}) == len(sources)

    def test_kaynak_havuzunda_yargi_alani_yok(self) -> None:
        """source_quality gibi editoryal alanlar taşınmamalı."""
        assert not hasattr(Source("a", "A", "https://x"), "source_quality")

    def test_kategori_ipuclari_semaya_uygun(self) -> None:
        valid = {"Siyaset", "Ekonomi", "Teknoloji", "Bilim"}
        for source in load_sources():
            assert set(source.category_hints) <= valid, source.id

    def test_cadence_zamani_gelmemis_kaynagi_atlar(self) -> None:
        source = Source("x", "X", "https://x", cadence="6h")
        now = 1_000_000.0
        assert due_sources([source], {"x": now - 3600}, now=now) == []
        assert due_sources([source], {"x": now - 7 * 3600}, now=now) == [source]

    def test_hic_cekilmemis_kaynak_hemen_sirada(self) -> None:
        source = Source("x", "X", "https://x", cadence="12h")
        assert due_sources([source], {}, now=1_000_000.0) == [source]


class TestCanonicalize:
    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://a.com/x?utm_source=rss&utm_medium=feed", "https://a.com/x"),
            ("https://a.com/x/", "https://a.com/x"),
            ("https://a.com/x?id=7&utm_campaign=z", "https://a.com/x?id=7"),
            ("https://a.com/x", "https://a.com/x"),
        ],
    )
    def test_izleme_parametreleri_atilir(self, url: str, expected: str) -> None:
        assert canonicalize(url) == expected

    def test_ayni_haber_farkli_kuyrukla_tek_kimlik_alir(self) -> None:
        """Eski korpusta gerçekten görülen biçim: DW'nin maca parametresi."""
        a = "https://www.dw.com/en/story/a-77523515?maca=en-rss-en-all-1573-xml-"
        b = "https://www.dw.com/en/story/a-77523515"
        assert candidate_id(canonicalize(a)) == candidate_id(canonicalize(b))

    def test_farkli_haberler_farkli_kimlik_alir(self) -> None:
        assert candidate_id("https://a.com/1") != candidate_id("https://a.com/2")


class TestCleanText:
    def test_etiketler_ve_bosluk_temizlenir(self) -> None:
        assert clean_text("<p>Bir  <b>haber</b>\n metni</p>") == "Bir haber metni"

    def test_bos_deger_sorun_cikarmaz(self) -> None:
        assert clean_text("") == ""


class TestArticleText:
    def test_paragraflar_cikarilir(self) -> None:
        paragraph = (
            "Bakanlık tarafından yapılan açıklamada kararın önümüzdeki ay "
            "yürürlüğe gireceği bildirildi ve geçiş takvimi paylaşıldı."
        )
        html = f"<html><body><article><p>{paragraph}</p><p>{paragraph} İkinci.</p></article></body></html>"
        text = article_text(html)
        assert paragraph in text
        assert "\n\n" in text

    def test_kisa_ve_boilerplate_paragraflar_atilir(self) -> None:
        long_text = "Bu paragraf yeterince uzun olduğu için metne dahil edilmelidir ve kalır."
        html = (
            "<html><body><article>"
            "<p>Kısa</p>"
            "<p>Advertisement</p>"
            f"<p>{long_text}</p>"
            "</article></body></html>"
        )
        text = article_text(html)
        assert text == long_text

    def test_tekrar_eden_paragraf_bir_kez_alinir(self) -> None:
        paragraph = "Aynı paragraf sayfada iki kez görünüyor ve yalnız bir kez alınmalıdır."
        html = f"<html><body><article><p>{paragraph}</p><p>{paragraph}</p></article></body></html>"
        assert article_text(html).count(paragraph) == 1

    def test_paywall_sayfasi_yetersiz_metin_verir(self) -> None:
        """Host listesi tutmaya gerek yok: okunamayan sayfa zaten eşiği geçmez."""
        html = (
            "<html><body><article>"
            "<p>Subscribe to continue reading this article from our newsroom today.</p>"
            "</article></body></html>"
        )
        assert len(article_text(html)) < MIN_ARTICLE_TEXT


class TestTransientClassification:
    """Geçici hata ile kalıcı hatanın ayrımı.

    Gerçek çalıştırmada gözlenen dağılım: Politico paywall (kalıcı),
    Fast Company / Sky News / MarketWatch 403-401 bot engeli (kalıcı),
    NPR zaman aşımı (geçici).
    """

    @pytest.mark.parametrize(
        "status,expected_transient",
        [(401, False), (403, False), (404, False), (429, True), (500, True), (503, True)],
    )
    def test_http_durum_kodlari_siniflanir(self, status: int, expected_transient: bool) -> None:
        import httpx

        from newsroom.extract import _is_transient

        request = httpx.Request("GET", "https://example.com")
        response = httpx.Response(status, request=request)
        exc = httpx.HTTPStatusError("x", request=request, response=response)
        assert _is_transient(exc) is expected_transient

    def test_zaman_asimi_gecicidir(self) -> None:
        import httpx

        from newsroom.extract import _is_transient

        assert _is_transient(httpx.ReadTimeout("timeout")) is True

    def test_paywall_kalici_sayilir(self) -> None:
        """Yetersiz metin geçici değildir; sayfa okunmuş ama haber vermemiştir."""
        from newsroom.extract import Extraction

        result = Extraction(text="kısa", failure="metin yetersiz (4 < 500 karakter)")
        assert result.ok is False
        assert result.transient is False


class TestPageDate:
    def test_meta_etiketinden_tarih_okunur(self) -> None:
        from bs4 import BeautifulSoup

        html = '<html><head><meta property="article:published_time" content="2026-08-01T10:00:00Z"></head></html>'
        found = published_at_from_page(BeautifulSoup(html, "html.parser"))
        assert found == datetime(2026, 8, 1, 10, tzinfo=UTC)

    def test_jsonld_tarihinden_okunur(self) -> None:
        from bs4 import BeautifulSoup

        html = (
            '<html><head><script type="application/ld+json">'
            '{"@type":"NewsArticle","datePublished":"2026-08-01T09:30:00+00:00"}'
            "</script></head></html>"
        )
        found = published_at_from_page(BeautifulSoup(html, "html.parser"))
        assert found == datetime(2026, 8, 1, 9, 30, tzinfo=UTC)

    def test_tarih_yoksa_none(self) -> None:
        from bs4 import BeautifulSoup

        assert published_at_from_page(BeautifulSoup("<html></html>", "html.parser")) is None

    def test_zaman_dilimsiz_tarih_utc_sayilir(self) -> None:
        from bs4 import BeautifulSoup

        html = '<html><head><meta name="pubdate" content="2026-08-01T10:00:00"></head></html>'
        found = published_at_from_page(BeautifulSoup(html, "html.parser"))
        assert found is not None
        assert found.tzinfo is not None
        assert abs(found - datetime(2026, 8, 1, 10, tzinfo=UTC)) < timedelta(seconds=1)
