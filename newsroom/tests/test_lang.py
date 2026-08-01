"""Dil kapısının korpusa karşı regresyon testleri.

Buradaki eşikler tahmin değil ölçüm sonucudur. Bir eşik değiştirilirse bu
testler kaç yayının reddedileceğini doğrudan gösterir.
"""

from __future__ import annotations

import pytest

from newsroom.lang import (
    MIN_MEASURABLE_WORDS,
    body_is_turkish,
    looks_untranslated,
    measure,
)


class TestBodyGate:
    def test_yayimlanmis_govdelerin_tamami_gecer(self, published: list[dict]) -> None:
        """585 yayının hepsi Türkçe sayılmalı. Yanlış ret kabul edilemez."""
        rejected = [
            (post["slug"], body_is_turkish(post["body"])[1])
            for post in published
            if not body_is_turkish(post["body"])[0]
        ]
        assert rejected == [], f"{len(rejected)} yayın yanlış reddedildi: {rejected[:5]}"

    def test_yabanci_dildeki_metinler_gecmez(self, foreign_language_texts: list[str]) -> None:
        """Ölçülebilir uzunluktaki yabancı dil metni Türkçe sayılmamalı."""
        accepted = [
            text
            for text in foreign_language_texts
            if measure(text).measurable and body_is_turkish(text)[0]
        ]
        assert accepted == [], f"{len(accepted)} yabancı metin kabul edildi: {accepted[:3]}"

    def test_kisa_metin_olculmez(self) -> None:
        ok, reason = body_is_turkish("Kısa bir cümle.")
        assert ok is False
        assert "kısa" in reason

    def test_ozel_ad_yogun_govde_reddedilmez(self) -> None:
        """Eski sistemi istisna fonksiyonu yazmaya iten vaka.

        İngilizce kurum adları geçen temiz Türkçe gövde, yoğunluk düşük
        kaldığı için istisnasız geçmelidir.
        """
        body = (
            "Institute for the Study of War tarafından yayımlanan değerlendirmeye göre "
            "cephe hattındaki ilerleme sınırlı kaldı. Raporu hazırlayan ekip, saha "
            "verilerinin doğrulanmasının güçleştiğini belirtiyor. Center for Strategic "
            "and International Studies ise aynı dönem için farklı bir tablo çiziyor ve "
            "lojistik hatlarındaki baskının arttığını söylüyor. Değerlendirmede yer alan "
            "rakamlar bağımsız kaynaklarca doğrulanmadı; kurumlar da bu sınırlamayı "
            "açıkça kaydediyor. Önümüzdeki haftalarda yayımlanacak güncelleme, "
            "tartışmalı bölgelerdeki durumu netleştirebilir."
        )
        assert measure(body).word_count >= MIN_MEASURABLE_WORDS
        ok, reason = body_is_turkish(body)
        assert ok is True, reason


class TestUntranslatedGate:
    def test_yayimlanmis_basliklarin_hicbiri_kopya_sayilmaz(self, published: list[dict]) -> None:
        flagged = [
            post["slug"]
            for post in published
            if post.get("origin")
            and looks_untranslated(post["title"], post["origin"]["orig_title"])[0]
        ]
        assert flagged == [], f"{len(flagged)} başlık yanlışlıkla kopya sayıldı"

    def test_aynen_kopyalanan_baslik_yakalanir(self, published: list[dict]) -> None:
        """Kaynak başlığı çevrilmeden geçirilirse kapı kapanmalı."""
        missed = [
            post["slug"]
            for post in published
            if post.get("origin")
            and not looks_untranslated(
                post["origin"]["orig_title"], post["origin"]["orig_title"]
            )[0]
        ]
        assert missed == [], f"{len(missed)} birebir kopya yakalanmadı"

    def test_bos_metin_isaretlenmez(self) -> None:
        assert looks_untranslated("", "Some English headline")[0] is False
        assert looks_untranslated("Bir başlık", "")[0] is False


class TestMeasurement:
    @pytest.mark.parametrize(
        "text,expect_english_heavy",
        [
            ("The company said it will expand the service to more of the region.", True),
            ("Şirket, hizmeti bölgenin daha geniş bir bölümüne yayacağını açıkladı.", False),
        ],
    )
    def test_ingilizce_yogunlugu_yonu_ayirir(self, text: str, expect_english_heavy: bool) -> None:
        reading = measure(text)
        assert (reading.english_density > 0.15) is expect_english_heavy

    def test_yogunluk_uzunluktan_bagimsizdir(self) -> None:
        """Aynı metni tekrarlamak yoğunluğu değiştirmemeli.

        Eski sistemin kırıldığı nokta buydu: sayı tabanlı eşik uzun metinde
        kaçınılmaz olarak aşılıyordu.
        """
        sentence = "Bakanlık, kararın önümüzdeki ay yürürlüğe gireceğini bildirdi. "
        short = measure(sentence)
        long = measure(sentence * 20)
        assert abs(short.english_density - long.english_density) < 0.01
        assert abs(short.turkish_evidence - long.turkish_evidence) < 0.01
