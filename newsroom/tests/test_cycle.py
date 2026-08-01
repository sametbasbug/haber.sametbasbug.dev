"""Çevrim orkestrasyonu testleri.

Ağ ve build çalıştırılmaz; yayın adımı geçici bir git deposunda denenir.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import subprocess

import pytest

from newsroom import hero
from newsroom.cycle import (
    MAX_BOARD_APPEARANCES,
    PEXELS_MEMORY,
    CycleState,
    _hero_queries,
    publish,
)

NOW = datetime(2026, 8, 1, 12, tzinfo=UTC)

BODY = "\n\n".join(
    [
        "Bakanlık tarafından yapılan yazılı açıklamada, uzun süredir beklenen "
        "kararın önümüzdeki ay yürürlüğe gireceği bildirildi ve geçiş takvimi "
        "kamuoyuyla paylaşıldı. Açıklama bugün öğle saatlerinde yayımlandı.",
        "Açıklamada yer alan verilere göre düzenleme yaklaşık iki bin işletmeyi "
        "kapsıyor ve uyum süreci için altı aylık bir geçiş dönemi tanınıyor. "
        "Bu sürede mevcut belgeler geçerliliğini korumaya devam edecek.",
        "Sektör temsilcileri takvimin kısa olduğunu savunurken bakanlık sürenin "
        "yeterli olduğunu belirtiyor ve şimdilik ek bir düzenleme beklemediğini "
        "söylüyor. Tarafların önümüzdeki hafta yeniden toplanması bekleniyor.",
        "Düzenlemenin ayrıntıları önümüzdeki hafta yayımlanacak yönetmelikle "
        "netleşecek. İtiraz süreci için takvimin ne zaman açıklanacağı ise "
        "bakanlığın açıklamasında yer almadı ve soru olarak duruyor.",
    ]
)

SELECTION = {
    "candidateId": "c1",
    "title": "Bakanlık yeni düzenlemenin takvimini açıkladı",
    "description": "Bakanlık, iki bin işletmeyi kapsayan düzenleme için altı aylık geçiş süresi tanıdığını bildirdi.",
    "category": "Ekonomi",
    "body": BODY,
    "tags": ["düzenleme", "bakanlık"],
    "heroPrompt": "Resmî bina önünde belge taşıyan kişiler",
    "heroAlt": "Bakanlık binası önünde belge taşıyan kişiler",
    "heroQuery": "government building officials",
}

BRIEF = {
    "task": {"selectCount": 1},
    "board": [
        {
            "id": "c1",
            "source": "The Guardian Business",
            "url": "https://example.com/story",
            "title": "Ministry announces new timetable",
            "sourceText": "...",
        }
    ],
}


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Yayın adımının denendiği geçici depo.

    Depo `tmp_path` altında ayrı bir klasördür; durum dosyası ve Codex'in
    ürettiği görsel gibi yardımcı dosyalar depo dışında kalmalı, yoksa kapsam
    kapısı haklı olarak onları da kapsam dışı değişiklik sayar.
    """
    root = tmp_path / "repo"
    (root / "src" / "content" / "equinoxHaber").mkdir(parents=True)
    (root / "public" / "images" / "generated" / "equinox-haber").mkdir(parents=True)
    subprocess.run(("git", "init", "-q"), cwd=root, check=True)
    subprocess.run(("git", "config", "user.email", "t@e.st"), cwd=root, check=True)
    subprocess.run(("git", "config", "user.name", "Test"), cwd=root, check=True)
    return root


def _publish(repo: Path, tmp_path: Path, monkeypatch, **overrides):
    monkeypatch.setattr("newsroom.verify.REPO_ROOT", repo)
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)
    monkeypatch.setattr("newsroom.hero.get_env", lambda name, default=None: None)
    return publish(
        {"selections": [{**SELECTION, **overrides.pop("selection", {})}]},
        brief=BRIEF,
        now=NOW,
        state_path=tmp_path / "state.json",
        content_dir=repo / "src" / "content" / "equinoxHaber",
        hero_dir=repo / "public" / "images" / "generated" / "equinox-haber",
        build=False,
        **overrides,
    )


class TestState:
    def test_bos_durum_okunur(self, tmp_path: Path) -> None:
        state = CycleState.load(tmp_path / "yok.json")
        assert state.last_fetched == {} and state.pexels_used == []

    def test_durum_yazilip_okunur(self, tmp_path: Path) -> None:
        path = tmp_path / "state.json"
        state = CycleState(last_fetched={"bbc": 1.0}, board_appearances={"x": 2})
        state.save(path)
        assert CycleState.load(path).board_appearances == {"x": 2}

    def test_bozuk_durum_dosyasi_cokmez(self, tmp_path: Path) -> None:
        path = tmp_path / "state.json"
        path.write_text("{bozuk", encoding="utf-8")
        assert CycleState.load(path).last_fetched == {}

    def test_cok_gorunen_aday_dusurulur(self) -> None:
        state = CycleState(board_appearances={"a": MAX_BOARD_APPEARANCES, "b": 1})
        assert state.exhausted_candidates() == {"a"}

    def test_pexels_hafizasi_sinirli(self) -> None:
        state = CycleState()
        for index in range(PEXELS_MEMORY + 20):
            state.remember_pexels(f"pexels:{index}")
        assert len(state.pexels_used) == PEXELS_MEMORY
        assert state.pexels_used[-1] == str(PEXELS_MEMORY + 19)

    def test_uretilen_gorsel_hafizaya_girmez(self) -> None:
        state = CycleState()
        state.remember_pexels("generated")
        state.remember_pexels(None)
        assert state.pexels_used == []


class TestHeroQueries:
    def test_etiketlerden_uretilir(self) -> None:
        queries = _hero_queries({"tags": ["NATO", "Ukrayna"], "category": "Siyaset"})
        assert queries[0] == "NATO Ukrayna"
        assert "Siyaset" in queries

    def test_etiket_yoksa_kategori_kalir(self) -> None:
        assert _hero_queries({"tags": [], "category": "Bilim"}) == ["Bilim"]

    def test_ingilizce_sorgu_once_denenir(self) -> None:
        """Stok arşivler İngilizce indekslidir.

        Gölge koşuda "İtalya aşırı sıcak" sorgusu ülkeyi tuttu, sıcağı ıskaladı
        ve haberle ilgisiz bir sokak fotoğrafı döndü. Türkçe etiketler yedekte
        kalır ama ilk sırayı İngilizce terim alır.
        """
        queries = _hero_queries(
            {
                "heroQuery": "italy heatwave empty street",
                "tags": ["İtalya", "aşırı sıcak"],
                "category": "Bilim",
            }
        )
        assert queries[0] == "italy heatwave empty street"
        assert "İtalya aşırı sıcak" in queries


class TestPublish:
    def test_temiz_yayin_dosyayi_yazar_ve_commitler(
        self, repo: Path, tmp_path: Path, monkeypatch
    ) -> None:
        report = _publish(repo, tmp_path, monkeypatch)
        assert report.ok, (report.problems, [e.message for e in report.errors])
        assert len(report.published) == 1

        record = report.published[0]
        assert record["slug"] == "bakanlik-yeni-duzenlemenin-takvimini-acikladi"
        assert record["commit"]

        written = repo / "src/content/equinoxHaber/bakanlik-yeni-duzenlemenin-takvimini-acikladi.md"
        assert written.is_file()
        log = subprocess.run(
            ("git", "log", "--oneline", "-1"), cwd=repo, capture_output=True, text=True
        )
        assert "Bakanlık" in log.stdout

    def test_hero_yoksa_yayin_devam_eder(self, repo: Path, tmp_path: Path, monkeypatch) -> None:
        """Görsel üretilemezse haber hero'suz çıkar; yayın durmaz."""
        report = _publish(repo, tmp_path, monkeypatch)
        assert report.ok
        assert report.published[0]["hero"] is None
        written = (repo / "src/content/equinoxHaber").glob("*.md")
        assert "heroImage:" not in next(written).read_text(encoding="utf-8")

    def test_sozlesme_ihlali_dosya_yazmaz(self, repo: Path, tmp_path: Path, monkeypatch) -> None:
        report = _publish(repo, tmp_path, monkeypatch, selection={"category": "Spor"})
        assert not report.ok
        assert list((repo / "src/content/equinoxHaber").glob("*.md")) == []

    def test_dogrulama_dusunce_yazilan_dosya_geri_alinir(
        self, repo: Path, tmp_path: Path, monkeypatch
    ) -> None:
        """Kapsam kapısı düşerse yarım yayın bırakılmaz."""
        (repo / "beklenmedik.txt").write_text("x", encoding="utf-8")
        report = _publish(repo, tmp_path, monkeypatch)
        assert not report.ok
        assert any("kapsamı dışında" in problem for problem in report.problems)
        assert list((repo / "src/content/equinoxHaber").glob("*.md")) == []

    def test_secim_yapilmamasi_hata_degil(self, repo: Path, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setattr("newsroom.verify.REPO_ROOT", repo)
        report = publish(
            {"selections": [], "note": "yayımlanabilir aday yok"},
            brief=BRIEF,
            now=NOW,
            state_path=tmp_path / "state.json",
            build=False,
        )
        assert report.ok
        assert report.declined_reason == "yayımlanabilir aday yok"
        assert report.published == []

    def test_ayni_slug_ikinci_kez_yazilmaz(self, repo: Path, tmp_path: Path, monkeypatch) -> None:
        _publish(repo, tmp_path, monkeypatch)
        report = _publish(repo, tmp_path, monkeypatch)
        assert not report.ok
        assert any("zaten yayında" in problem for problem in report.problems)

    def test_ayni_kaynak_farkli_baslikla_ikinci_kez_yayimlanmaz(
        self, repo: Path, tmp_path: Path, monkeypatch
    ) -> None:
        """Tekrar kontrolü yayın anında da yapılır.

        Pano kurulurken tekrar elenir, ama brief ile yayın arasında zaman geçer.
        Başlık değiştiği için slug çakışması bunu yakalayamaz; yakalayan şey
        canlıya yayın anında bakılan URL kontrolüdür.
        """
        _publish(repo, tmp_path, monkeypatch)
        report = _publish(
            repo,
            tmp_path,
            monkeypatch,
            selection={"title": "Bakanlık takvimi bambaşka sözcüklerle duyurdu"},
        )
        assert not report.ok
        assert any("zaten yayında" in problem for problem in report.problems)

    def test_brief_yoksa_yayin_yapilmaz(self, tmp_path: Path) -> None:
        report = publish({"selections": []}, brief_path=tmp_path / "yok.json", build=False)
        assert not report.ok
        assert any("brief bulunamadı" in problem for problem in report.problems)

    def test_diskteki_brief_kullanilir(self, repo: Path, tmp_path: Path, monkeypatch) -> None:
        """publish, kendi uydurduğu panoya değil Asteria'ya gösterilene bakar."""
        brief_path = tmp_path / "brief.json"
        brief_path.write_text(json.dumps(BRIEF, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr("newsroom.verify.REPO_ROOT", repo)
        monkeypatch.setattr("newsroom.hero.get_env", lambda name, default=None: None)
        report = publish(
            {"selections": [SELECTION]},
            brief_path=brief_path,
            now=NOW,
            state_path=tmp_path / "state.json",
            content_dir=repo / "src" / "content" / "equinoxHaber",
            hero_dir=repo / "public" / "images" / "generated" / "equinox-haber",
            build=False,
        )
        assert report.ok, report.problems


@pytest.mark.skipif(shutil.which("magick") is None, reason="ImageMagick kurulu değil")
class TestPublishWithHero:
    def test_codex_gorseli_yayina_girer(self, repo: Path, tmp_path: Path, monkeypatch) -> None:
        source = tmp_path / "codex.png"
        subprocess.run(
            ["magick", "-size", "1600x900", "gradient:navy-black", str(source)],
            check=True,
            capture_output=True,
        )
        report = _publish(repo, tmp_path, monkeypatch, selection={"heroImagePath": str(source)})

        assert report.ok, report.problems
        assert report.published[0]["hero"] == "generated"
        written = next((repo / "src/content/equinoxHaber").glob("*.md")).read_text(encoding="utf-8")
        assert "heroImage: \"/images/generated/equinox-haber/" in written
        assert (
            repo / "public/images/generated/equinox-haber"
            / "bakanlik-yeni-duzenlemenin-takvimini-acikladi.webp"
        ).is_file()
        # Görsel istenen görsel olduğunda alt metin de geçerlidir.
        assert 'heroAlt: "Bakanlık binası önünde belge taşıyan kişiler"' in written

    def test_stok_gorselde_alt_metin_yazilmaz(
        self, repo: Path, tmp_path: Path, monkeypatch
    ) -> None:
        """Stok yedeğine düşüldüğünde `heroAlt` yayına girmez.

        Asteria alt metnini ürettirmek istediği görsel için yazar. Stok arşivden
        başka bir fotoğraf gelince o metin ekranda olmayan bir şeyi tarif eder —
        ekran okuyucu kullanan biri için sessiz bir yalan. Şablonlar alanın
        yokluğunda başlığa düşer.
        """
        source = tmp_path / "stok.png"
        subprocess.run(
            ["magick", "-size", "1600x900", "gradient:teal-black", str(source)],
            check=True,
            capture_output=True,
        )

        def fake_pexels(slug, queries, **kwargs):
            normalized = hero.normalize(source, slug, hero_dir=kwargs.get("hero_dir"))
            return replace(
                normalized,
                origin="pexels:1",
                credit="Bir Fotoğrafçı",
                stock_description="a crowded street in daylight",
            )

        monkeypatch.setattr("newsroom.hero.from_pexels", fake_pexels)
        report = _publish(repo, tmp_path, monkeypatch)

        assert report.ok, report.problems
        assert report.published[0]["hero"] == "pexels:1"
        assert report.published[0]["heroStockDescription"] == "a crowded street in daylight"

        written = next((repo / "src/content/equinoxHaber").glob("*.md")).read_text(
            encoding="utf-8"
        )
        assert "heroImage:" in written
        assert "heroAlt:" not in written
