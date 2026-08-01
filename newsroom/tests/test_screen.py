"""Mekanik elemenin korpusa karşı regresyon testleri.

En önemli test `test_yayimlanmis_adaylarin_tamami_gecer`: gerçekten yayımlanmış
584 haberin hiçbiri, kendi yayın anında değerlendirildiğinde elenmemelidir.
Bir eşik değiştirilirse bu test kaç gerçek yayının kaybedileceğini söyler.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from newsroom.models import Candidate
from newsroom.screen import (
    MAX_SOURCE_AGE,
    MIN_TITLE_LENGTH,
    ScreenDecision,
    eligible,
    screen,
)


# Kapılar yürürlükteyken yayımlanmış olmasına rağmen bugünkü elemeyi geçemeyen
# yayınlar. Bunlar test kusuru değil, yayın kusurudur: eski sistem bu beş kaydı
# yayımlamamalıydı.
#
# Liste burada durur ki kapılar bu vakaları yakalamayı sürdürsün. Eleme
# gevşetilerek "düzeltilmemelidir".
KNOWN_PUBLISHED_DEFECTS = {
    # Guardian canlı anlatım sayfaları. İkisi de /politics/live/ ve /world/live/
    # yolundan geldi; birinin slug'ı İngilizce manşetten türetilmiş halde canlıda.
    "minister-says-starmer-is-listening-and-refuses-to-say-if-basbakani-will-stay-on-ahead-of-critical-cabinet-meeting-ingiltere-politics-live",
    "russia-launches-attacks-on-ukraine-energy-infrastructure-amid-truce-talks-europe-live",
    # Kaynak tarihi yayın anından 17-27 saat ileride. Besleme tarih hatası;
    # eski sistemde ileri tarih kapısı publish yolunda çalışmıyordu.
    "bulgaristan-ukraynaya-devlet-stoklarindan-dogrudan-silah-sevkiyatini-durdurdu",
    "ecbnin-faiz-kararinda-enerji-fiyatlari-yeniden-belirleyici-oluyor",
    "wall-streette-yatirimcilar-teknoloji-hisselerinden-saglik-ve-bankalara-donuyor",
}


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _candidate(**overrides) -> Candidate:
    base = {
        "id": "test",
        "source_id": "test-source",
        "source_name": "Test Source",
        "canonical_url": "https://example.com/news/story",
        "title": "Yeterince uzun bir haber başlığı burada",
        "summary": "Özet",
        "published_at": datetime.now(UTC) - timedelta(hours=2),
    }
    return Candidate(**{**base, "id": base["id"], **overrides})


class TestCorpusRegression:
    def test_yayimlanmis_adaylarin_tamami_gecer(
        self, published_current_era: list[dict]
    ) -> None:
        """Yayımlanmış her haber, kendi yayın anında elemeyi geçmeliydi.

        Kapsam `GATE_ERA_START` sonrasıdır; gerekçe `conftest.py` içinde.
        """
        failures = []
        for post in published_current_era:
            origin = post.get("origin")
            if not origin or not origin.get("published_at"):
                continue
            candidate = Candidate.from_normalized(
                {
                    "id": post["slug"],
                    "source_id": origin["source_id"],
                    "source_name": origin["source_name"],
                    "canonical_url": origin["canonical_url"],
                    "title": origin["orig_title"],
                    "summary": origin["orig_summary"],
                    "published_at": origin["published_at"],
                    "category_hints": origin["category_hints"],
                }
            )
            decision = screen(candidate, now=_parse(post["pub_date"]))
            if not decision.eligible and post["slug"] not in KNOWN_PUBLISHED_DEFECTS:
                failures.append((post["slug"], decision.code, decision.reason))

        assert failures == [], (
            f"{len(failures)} gerçek yayın elenirdi: {failures[:5]}"
        )

    def test_bilinen_kusurlar_hala_yakalaniyor(
        self, published_current_era: list[dict]
    ) -> None:
        """Bilinen kusurlu yayınlar elenmeye devam etmeli.

        Bir eşik gevşetilirse bu test düşer ve gevşemeyi görünür kılar.
        """
        caught = set()
        for post in published_current_era:
            if post["slug"] not in KNOWN_PUBLISHED_DEFECTS:
                continue
            origin = post["origin"]
            candidate = Candidate.from_normalized(
                {
                    "id": post["slug"],
                    "source_id": origin["source_id"],
                    "source_name": origin["source_name"],
                    "canonical_url": origin["canonical_url"],
                    "title": origin["orig_title"],
                    "summary": origin["orig_summary"],
                    "published_at": origin["published_at"],
                    "category_hints": origin["category_hints"],
                }
            )
            if not screen(candidate, now=_parse(post["pub_date"])).eligible:
                caught.add(post["slug"])

        assert caught == KNOWN_PUBLISHED_DEFECTS, (
            f"artık yakalanmayan kusurlu yayın: {KNOWN_PUBLISHED_DEFECTS - caught}"
        )

    def test_aday_havuzunda_eleme_makul_oranda(self, candidates: list[dict]) -> None:
        """Eleme dar olmalı. Havuzun büyük kısmını elemek yargıya kaymak olur.

        Not: korpus geçmişe ait olduğu için `now` sabitlenir; yaş kapısı bu
        testte ölçülmez, biçim kapıları ölçülür.
        """
        pool = [Candidate.from_normalized(record) for record in candidates]
        reference = max(
            (c.published_at for c in pool if c.published_at), default=datetime.now(UTC)
        )
        kept, blocked = eligible(pool, now=reference)

        format_blocks = sum(
            count for code, count in blocked.items() if code != "stale"
        )
        assert format_blocks / len(pool) < 0.10, (
            f"biçim kapıları havuzun %{100 * format_blocks / len(pool):.1f}'ini eledi: {blocked}"
        )
        assert kept, "havuzda hiç aday kalmadı"


class TestAgeGate:
    def test_pencere_icindeki_kaynak_gecer(self) -> None:
        now = datetime(2026, 8, 1, 12, tzinfo=UTC)
        candidate = _candidate(published_at=now - MAX_SOURCE_AGE + timedelta(minutes=1))
        assert screen(candidate, now=now).eligible

    def test_pencere_disindaki_kaynak_elenir(self) -> None:
        now = datetime(2026, 8, 1, 12, tzinfo=UTC)
        candidate = _candidate(published_at=now - MAX_SOURCE_AGE - timedelta(minutes=1))
        decision = screen(candidate, now=now)
        assert not decision.eligible
        assert decision.code == "stale"

    def test_asiri_ileri_tarihli_kayit_elenir(self) -> None:
        now = datetime(2026, 8, 1, 12, tzinfo=UTC)
        candidate = _candidate(published_at=now + timedelta(hours=12))
        assert screen(candidate, now=now).code == "future_dated"

    def test_kucuk_ileri_sapma_tolere_edilir(self) -> None:
        now = datetime(2026, 8, 1, 12, tzinfo=UTC)
        candidate = _candidate(published_at=now + timedelta(hours=1))
        assert screen(candidate, now=now).eligible

    def test_tarihsiz_kayit_elenir(self) -> None:
        """Yaşı ölçülemeyen aday tazelik kapısından geçemez.

        Önceki sürümde tarihsiz kayıt kapıyı sessizce atlıyordu: 24 saat kuralı
        yalnız tarihi olanlara uygulanıyordu. Bu, kapıyı besleme kalitesine
        bağımlı kılıyordu — tarih vermeyen bir kaynak sınırsız eski haber
        sokabilirdi. Doğrulanamayan şey geçmez.
        """
        assert screen(_candidate(published_at=None)).code == "undated"


class TestFormatGates:
    @pytest.mark.parametrize(
        "url",
        [
            "https://example.com/sponsored-content/story",
            "https://example.com/brandstudio/story",
            "https://example.com/paid-content/story",
        ],
    )
    def test_sponsorlu_yollar_elenir(self, url: str) -> None:
        assert screen(_candidate(canonical_url=url)).code == "sponsored"

    @pytest.mark.parametrize(
        "url",
        ["https://example.com/live/politics", "https://example.com/world-live-updates"],
    )
    def test_liveblog_yollari_elenir(self, url: str) -> None:
        assert screen(_candidate(canonical_url=url)).code == "liveblog"

    @pytest.mark.parametrize(
        "title",
        [
            "Ukraine war – live updates from the front",
            "Election night as it happened",
            "Gaza ceasefire: live coverage of the talks",
        ],
    )
    def test_liveblog_basliklari_elenir(self, title: str) -> None:
        assert screen(_candidate(title=title)).code == "liveblog"

    def test_live_kelimesi_tek_basina_elemez(self) -> None:
        """'Live' geçen her başlık liveblog değildir."""
        assert screen(_candidate(title="Spotify brings live lyrics to desktop app")).eligible

    def test_kisa_baslik_elenir(self) -> None:
        decision = screen(_candidate(title="Kısa"))
        assert decision.code == "title_too_short"

    def test_sinirdaki_baslik_gecer(self) -> None:
        assert screen(_candidate(title="a" * MIN_TITLE_LENGTH)).eligible


class TestDecisionShape:
    def test_gecen_karar_gerekce_tasimaz(self) -> None:
        decision = ScreenDecision.passed()
        assert decision.eligible and decision.code is None

    def test_sayim_ret_kodlarini_toplar(self) -> None:
        pool = [
            _candidate(title="Kısa"),
            _candidate(title="Yine çok kısa"),
            _candidate(canonical_url="https://example.com/sponsored/x"),
            _candidate(),
        ]
        kept, blocked = eligible(pool)
        assert len(kept) == 1
        assert blocked == {"title_too_short": 2, "sponsored": 1}
