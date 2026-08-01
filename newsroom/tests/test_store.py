"""Aday deposu testleri."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from newsroom.models import Candidate
from newsroom.store import MAX_STORED_AGE, load, merge, save

NOW = datetime(2026, 8, 1, 12, tzinfo=UTC)


def _candidate(cid: str, *, hours_old: float | None = 2, first_seen: datetime | None = None) -> Candidate:
    return Candidate(
        id=cid,
        source_id="src",
        source_name="Kaynak",
        canonical_url=f"https://example.com/{cid}",
        title=f"Yeterince uzun bir haber başlığı {cid}",
        summary="özet",
        published_at=None if hours_old is None else NOW - timedelta(hours=hours_old),
        first_seen=first_seen,
    )


class TestRoundTrip:
    def test_yazilip_okunur(self, tmp_path: Path) -> None:
        path = tmp_path / "c.json"
        save([_candidate("a"), _candidate("b")], path)
        loaded = load(path)
        assert {c.id for c in loaded} == {"a", "b"}
        assert loaded[0].published_at == NOW - timedelta(hours=2)

    def test_olmayan_dosya_bos_liste(self, tmp_path: Path) -> None:
        assert load(tmp_path / "yok.json") == []

    def test_bozuk_dosya_cokmez(self, tmp_path: Path) -> None:
        path = tmp_path / "c.json"
        path.write_text("{bozuk", encoding="utf-8")
        assert load(path) == []

    def test_ilk_gorulme_korunur(self, tmp_path: Path) -> None:
        path = tmp_path / "c.json"
        stamp = NOW - timedelta(hours=5)
        save([_candidate("a", first_seen=stamp)], path)
        assert load(path)[0].first_seen == stamp


class TestMerge:
    def test_yeni_adaylar_eklenir(self) -> None:
        merged = merge([_candidate("a")], [_candidate("b")], now=NOW)
        assert {c.id for c in merged} == {"a", "b"}

    def test_ayni_aday_tekrar_eklenmez(self) -> None:
        merged = merge([_candidate("a")], [_candidate("a")], now=NOW)
        assert len(merged) == 1

    def test_depodaki_kayit_korunur(self) -> None:
        """Aynı haber yeniden görülünce ilk görülme anı sıfırlanmamalı."""
        stamp = NOW - timedelta(hours=8)
        merged = merge([_candidate("a", first_seen=stamp)], [_candidate("a")], now=NOW)
        assert merged[0].first_seen == stamp

    def test_yeni_adaya_ilk_gorulme_damgasi_vurulur(self) -> None:
        merged = merge([], [_candidate("a")], now=NOW)
        assert merged[0].first_seen == NOW

    def test_eskimis_aday_dusurulur(self) -> None:
        old = _candidate("eski", hours_old=MAX_STORED_AGE.total_seconds() / 3600 + 1)
        merged = merge([old], [_candidate("yeni")], now=NOW)
        assert {c.id for c in merged} == {"yeni"}

    def test_pencere_icindeki_aday_kalir(self) -> None:
        edge = _candidate("sinir", hours_old=MAX_STORED_AGE.total_seconds() / 3600 - 1)
        assert {c.id for c in merge([edge], [], now=NOW)} == {"sinir"}

    def test_tarihsiz_aday_ilk_gorulmeden_eskir(self) -> None:
        stale = _candidate("tarihsiz", hours_old=None, first_seen=NOW - MAX_STORED_AGE - timedelta(hours=1))
        fresh = _candidate("taze", hours_old=None, first_seen=NOW)
        merged = merge([stale, fresh], [], now=NOW)
        assert {c.id for c in merged} == {"taze"}


def test_depo_toplama_ritmini_secim_ritminden_ayirir() -> None:
    """Asıl amaç: bu çevrimde çekilmeyen kaynağın adayı da panoya girebilmeli.

    Altı saatlik bir kaynaktan gelen haber, sonraki beş çevrimde de görünür.
    """
    stored = [_candidate(f"a{i}") for i in range(5)]
    merged = merge(stored, [], now=NOW)
    assert len(merged) == 5
