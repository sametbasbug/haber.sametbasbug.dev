"""Canlı yüzey ve brief testleri."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from dataclasses import replace

from newsroom.brief import (
    BRIEF_TEXT_LIMIT,
    build_brief,
    policy_fingerprint,
    select_board,
)
from newsroom.live import LiveIndex, LivePost, load_live
from newsroom.models import Candidate

NOW = datetime(2026, 8, 1, 12, tzinfo=UTC)


def _post(slug: str, title: str, **overrides) -> LivePost:
    base = {
        "slug": slug,
        "title": title,
        "description": "",
        "category": "Teknoloji",
        "tags": ("yapay zeka",),
        "pub_date": "2026-08-01T10:00:00+03:00",
        "source_names": ("TechCrunch",),
        "source_urls": ("https://a.com/1",),
    }
    return LivePost(**{**base, **overrides})


def _candidate(cid: str, source: str, minutes_ago: int, title: str | None = None) -> Candidate:
    return Candidate(
        id=cid,
        source_id=source,
        source_name=source.upper(),
        canonical_url=f"https://{source}.com/{cid}",
        title=title or f"{source} kaynağından yeterince uzun bir haber başlığı {cid}",
        published_at=NOW - timedelta(minutes=minutes_ago),
    )


class TestLiveIndex:
    def test_gercek_icerik_okunur(self) -> None:
        index = load_live()
        assert len(index.posts) > 500
        assert all(post.title for post in index.posts)

    def test_en_yeniden_eskiye_siralanir(self) -> None:
        dates = [post.pub_date for post in load_live().posts]
        assert dates == sorted(dates, reverse=True)

    def test_ayni_url_yakalanir(self) -> None:
        index = LiveIndex([_post("a", "Bir haber", source_urls=("https://a.com/x",))])
        assert index.has_url("https://a.com/x") is True
        assert index.has_url("https://a.com/x?utm_source=rss") is True
        assert index.has_url("https://a.com/y") is False

    def test_ayni_haber_farkli_kelimelerle_yakalanir(self) -> None:
        index = LiveIndex([_post("a", "Bakanlık yeni düzenlemenin takvimini açıkladı")])
        assert index.duplicate_of("Bakanlık düzenlemenin takvimini açıkladı") is not None
        assert index.duplicate_of("Merkez Bankası faiz kararını duyurdu") is None

    def test_baglam_sayimlari_uretir(self) -> None:
        index = LiveIndex(
            [
                _post("a", "Bir haber", source_names=("TechCrunch",), tags=("yapay zeka",)),
                _post("b", "İki haber", source_names=("BBC World",), tags=("yapay zeka", "abd")),
            ]
        )
        context = index.recent_context()
        assert context["sources"] == {"TechCrunch": 1, "BBC World": 1}
        assert context["tags"]["yapay zeka"] == 2
        assert context["windowSize"] == 2

    def test_baglamda_sabit_sirket_listesi_yok(self) -> None:
        """Konu yığılması etiketlerden okunur, kodda gömülü listeden değil."""
        import newsroom.live as module

        source = Path(module.__file__).read_text(encoding="utf-8")
        for name in ("ChatGPT", "Gemini", "company_patterns"):
            assert name not in source


class TestSelectBoard:
    def test_kaynaklar_arasinda_sirayla_secer(self) -> None:
        """Saatte 20 haber basan kaynak panoyu dolduramamalı."""
        pool = [_candidate(f"a{i}", "aaa", i) for i in range(10)]
        pool += [_candidate("b1", "bbb", 5), _candidate("c1", "ccc", 7)]
        board = select_board(pool, LiveIndex([]), size=6)
        sources = [c.source_id for c in board]
        assert sources[:3] == ["aaa", "bbb", "ccc"]
        assert sources.count("aaa") <= 3

    def test_her_kaynagin_en_yenisi_once_gelir(self) -> None:
        pool = [_candidate("eski", "aaa", 300), _candidate("yeni", "aaa", 10)]
        board = select_board(pool, LiveIndex([]), size=1)
        assert board[0].id == "yeni"

    def test_canlida_olan_url_panoya_girmez(self) -> None:
        candidate = _candidate("x", "aaa", 5)
        index = LiveIndex([_post("p", "Başka başlık", source_urls=(candidate.canonical_url,))])
        assert select_board([candidate], index) == []

    def test_canlida_olan_haber_panoya_girmez(self) -> None:
        candidate = _candidate("x", "aaa", 5, title="Bakanlık düzenlemenin takvimini açıkladı")
        index = LiveIndex([_post("p", "Bakanlık yeni düzenlemenin takvimini açıkladı")])
        assert select_board([candidate], index) == []

    def test_dislanan_adaylar_atlanir(self) -> None:
        pool = [_candidate("a1", "aaa", 5), _candidate("a2", "aaa", 6)]
        board = select_board(pool, LiveIndex([]), exclude_ids={"a1"})
        assert [c.id for c in board] == ["a2"]

    def test_bos_havuz_bos_pano_verir(self) -> None:
        assert select_board([], LiveIndex([])) == []

    def test_pano_boyutu_asilmaz(self) -> None:
        pool = [_candidate(f"a{i}", f"s{i}", i) for i in range(20)]
        assert len(select_board(pool, LiveIndex([]), size=8)) == 8


class TestBuildBrief:
    def test_brief_yapisi(self) -> None:
        board = [replace(_candidate("a1", "aaa", 5), article_text="metin")]
        brief = build_brief(board, LiveIndex([]), select_count=1, now=NOW)

        assert brief["task"]["selectCount"] == 1
        assert brief["task"]["mayDecline"] is True
        assert len(brief["board"]) == 1
        assert brief["board"][0]["sourceText"] == "metin"
        assert brief["generatedAt"] == NOW.isoformat()

    def test_politika_gomulmez_referans_verilir(self) -> None:
        """Politika her çevrimde yeniden gönderilmez; yol ve parmak izi taşınır."""
        brief = build_brief([], LiveIndex([]), now=NOW)
        assert len(brief["policy"]["fingerprint"]) == 12
        assert "Equinox Haber" not in str(brief)

    def test_politika_yolu_repo_kokune_gore_verilir(self) -> None:
        """Codex repo kökünde çalışır; yol oradan çözülebilmeli."""
        from newsroom.brief import REPO_ROOT

        path = build_brief([], LiveIndex([]), now=NOW)["policy"]["path"]
        assert path == "newsroom/POLICY.md"
        assert (REPO_ROOT / path).is_file()

    def test_politika_parmak_izi_degisince_farklilasir(self, tmp_path: Path) -> None:
        first = tmp_path / "a.md"
        second = tmp_path / "b.md"
        first.write_text("politika", encoding="utf-8")
        second.write_text("politika değişti", encoding="utf-8")
        assert policy_fingerprint(first) != policy_fingerprint(second)

    def test_kaynak_metni_kirpilir(self) -> None:
        candidate = replace(
            _candidate("a1", "aaa", 5), article_text="x" * (BRIEF_TEXT_LIMIT + 500)
        )
        brief = build_brief([candidate], LiveIndex([]), now=NOW)
        assert len(brief["board"][0]["sourceText"]) == BRIEF_TEXT_LIMIT

    def test_eleme_ozeti_tasinir(self) -> None:
        brief = build_brief(
            [], LiveIndex([]), screening={"stale": 134, "liveblog": 4}, pool_size=462, now=NOW
        )
        assert brief["pipeline"]["collected"] == 462
        assert brief["pipeline"]["mechanicallyFiltered"]["stale"] == 134

    @pytest.mark.parametrize("count", [1, 2, 3])
    def test_secim_sayisi_yapilandirilabilir(self, count: int) -> None:
        brief = build_brief([], LiveIndex([]), select_count=count, now=NOW)
        assert brief["task"]["selectCount"] == count
