"""Markdown üretimi ve doğrulama testleri."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re

import pytest
import yaml

from newsroom.publish import (
    AUTHOR,
    MAX_SLUG_LENGTH,
    PUBLISH_TZ,
    hero_path_for,
    render,
    slugify,
    write,
)
from newsroom.verify import audit_content, audit_images, audit_scope, is_publish_scoped

NOW = datetime(2026, 8, 1, 14, 30, 5, tzinfo=PUBLISH_TZ)

SELECTION = {
    "candidateId": "c1",
    "title": "Bakanlık yeni düzenlemenin takvimini açıkladı",
    "description": "Bakanlık, iki bin işletmeyi kapsayan düzenleme için altı aylık geçiş süresi tanıdığını bildirdi.",
    "category": "Ekonomi",
    "body": "Birinci paragraf burada yer alıyor.\n\nİkinci paragraf da burada.",
    "tags": ["düzenleme", "bakanlık"],
    "heroPrompt": "Resmî bina önünde belge taşıyan kişiler",
    "heroAlt": "Bakanlık binası önünde belge taşıyan kişiler",
}

SOURCES = [{"name": "The Guardian Business", "url": "https://example.com/story"}]


def _rendered(**overrides) -> str:
    selection = {**SELECTION, **overrides.pop("selection", {})}
    return render(selection, sources=overrides.pop("sources", SOURCES), now=NOW, **overrides)


def _frontmatter(markdown: str) -> dict:
    return yaml.safe_load(re.match(r"\A---\n(.*?)\n---\n", markdown, re.DOTALL).group(1))


class TestSlugify:
    @pytest.mark.parametrize(
        "title,expected",
        [
            ("Bakanlık takvimi açıkladı", "bakanlik-takvimi-acikladi"),
            ("İngiltere’nin bütçe hesabı", "ingilterenin-butce-hesabi"),
            ("ÇOK ŞAŞIRTICI ÖĞLE", "cok-sasirtici-ogle"),
            ("Iğdır ve Işık", "igdir-ve-isik"),
        ],
    )
    def test_turkce_harfler_donusturulur(self, title: str, expected: str) -> None:
        assert slugify(title) == expected

    def test_slug_yalnizca_ascii_icerir(self) -> None:
        assert re.fullmatch(r"[a-z0-9-]+", slugify("Şüpheli İşlem: %30 artış!"))

    def test_uzun_baslik_kelime_sinirindan_kesilir(self) -> None:
        slug = slugify(" ".join(["kelime"] * 30))
        assert len(slug) <= MAX_SLUG_LENGTH
        assert not slug.endswith("-")

    def test_slug_her_zaman_turkce_baslikdan_turer(
        self, published_current_era: list[dict]
    ) -> None:
        """Slug Türkçe başlıktan türemeli, kaynağın İngilizce manşetinden değil.

        Arşivde bu kural tutmuyor: 585 yayının 193'ünde (%33) slug İngilizce
        manşetten türemiş — Nisan'da 148, kapı döneminde hâlâ 45. Canlıda
        `a-deal-is-a-deal-von-der-leyen-fires-back-at-trump...` gibi adresler var.

        Bu test arşivle bayt eşleşmesi aramaz; üretilen slug'ın hangi başlıktan
        geldiğini ölçer.
        """

        def tokens(value: str) -> set[str]:
            return {part for part in value.split("-") if len(part) > 3}

        wrong_source: list[str] = []
        for post in published_current_era:
            origin = post.get("origin")
            if not origin:
                continue
            produced = tokens(slugify(post["title"]))
            turkish = tokens(slugify(post["title"]))
            english = tokens(slugify(origin["orig_title"]))
            if not produced:
                continue
            tr_overlap = len(produced & turkish) / len(produced)
            en_overlap = len(produced & english) / len(produced)
            if en_overlap > tr_overlap:
                wrong_source.append(post["slug"])

        assert wrong_source == [], f"{len(wrong_source)} slug İngilizce manşetten türedi"

    def test_ingilizce_baslik_verilmedikce_ingilizce_slug_uretilmez(self) -> None:
        """Kaynak manşeti ne olursa olsun slug Türkçe başlıktan gelir."""
        assert slugify("Von der Leyen, Trump'ın otomobil tarifesi tehdidine karşı çıktı") == (
            "von-der-leyen-trumpin-otomobil-tarifesi-tehdidine-karsi-cikti"
        )

    def test_uretilen_sluglar_makul_uzunlukta(
        self, published_current_era: list[dict]
    ) -> None:
        lengths = [len(slugify(post["title"])) for post in published_current_era]
        assert max(lengths) <= MAX_SLUG_LENGTH
        truncated = sum(1 for length in lengths if length == MAX_SLUG_LENGTH)
        assert truncated <= 3, f"{truncated} slug sınıra dayandı"


class TestRender:
    def test_frontmatter_semaya_uygun(self) -> None:
        front = _frontmatter(_rendered())
        assert front["title"] == SELECTION["title"]
        assert front["category"] == "Ekonomi"
        assert front["author"] == AUTHOR
        assert front["isDraft"] is False
        assert front["breaking"] is False
        assert front["tags"] == SELECTION["tags"]
        assert front["sources"] == SOURCES

    def test_yayin_saati_turkiye_saatiyle_yazilir(self) -> None:
        front = _frontmatter(_rendered())
        assert str(front["pubDate"]).startswith("2026-08-01T14:30:05")
        assert front["pubDate"] == front["updatedDate"]

    def test_hero_yoksa_alan_yazilmaz(self) -> None:
        assert "heroImage:" not in _rendered()

    def test_hero_varsa_alan_yazilir(self) -> None:
        markdown = _rendered(hero_image=hero_path_for("bir-slug"))
        assert _frontmatter(markdown)["heroImage"] == "/images/generated/equinox-haber/bir-slug.webp"

    def test_kaynaklar_bolumu_eklenir(self) -> None:
        markdown = _rendered()
        assert "## Kaynaklar" in markdown
        assert "- Ana kaynak: [The Guardian Business](https://example.com/story)" in markdown
        assert "## Ek kaynaklar" not in markdown

    def test_ek_kaynaklar_bolumu(self) -> None:
        sources = [*SOURCES, {"name": "TechCrunch", "url": "https://tc.example/x"}]
        markdown = _rendered(sources=sources)
        assert "## Ek kaynaklar" in markdown
        assert "- [TechCrunch](https://tc.example/x)" in markdown

    def test_tirnak_iceren_baslik_gecerli_yaml_uretir(self) -> None:
        markdown = _rendered(selection={"title": 'Bakan: "karar" verildi'})
        assert _frontmatter(markdown)["title"] == 'Bakan: "karar" verildi'

    def test_govde_degistirilmez(self) -> None:
        assert SELECTION["body"] in _rendered()


class TestWrite:
    def test_dosya_yazilir(self, tmp_path: Path) -> None:
        target = write(_rendered(), "bir-slug", content_dir=tmp_path)
        assert target.name == "bir-slug.md"
        assert target.read_text(encoding="utf-8").startswith("---\n")

    def test_var_olan_slug_ezilmez(self, tmp_path: Path) -> None:
        write(_rendered(), "bir-slug", content_dir=tmp_path)
        with pytest.raises(FileExistsError):
            write(_rendered(), "bir-slug", content_dir=tmp_path)


class TestAuditContent:
    def _written(self, tmp_path: Path, markdown: str) -> Path:
        return write(markdown, "test-slug", content_dir=tmp_path, overwrite=True)

    def test_temiz_dosya_gecer(self, tmp_path: Path) -> None:
        assert audit_content(self._written(tmp_path, _rendered())) == []

    def test_ic_not_sizintisi_yakalanir(self, tmp_path: Path) -> None:
        markdown = _rendered(selection={"body": "Gövde.\n\nEditoryal not: manual-review."})
        problems = audit_content(self._written(tmp_path, markdown))
        assert any("iç not" in problem for problem in problems)

    def test_kaynaklar_bolumu_zorunlu(self, tmp_path: Path) -> None:
        markdown = _rendered().replace("## Kaynaklar", "## Baska")
        problems = audit_content(self._written(tmp_path, markdown))
        assert any("Kaynaklar" in problem for problem in problems)

    def test_gecersiz_kategori_yakalanir(self, tmp_path: Path) -> None:
        markdown = _rendered().replace('category: "Ekonomi"', 'category: "Spor"')
        problems = audit_content(self._written(tmp_path, markdown))
        assert any("kategori" in problem for problem in problems)

    def test_gercek_yayinlar_denetimden_gecer(self) -> None:
        """Arşivdeki yayınlar içerik denetimini geçmeli."""
        from newsroom.live import DEFAULT_CONTENT_DIR

        problems: list[str] = []
        for path in sorted(DEFAULT_CONTENT_DIR.glob("*.md")):
            problems.extend(audit_content(path))
        assert problems == [], f"{len(problems)} sorun: {problems[:5]}"


class TestAuditImages:
    def test_hero_yoksa_sorun_yok(self, tmp_path: Path) -> None:
        target = write(_rendered(), "t", content_dir=tmp_path, overwrite=True)
        assert audit_images(target, repo_root=tmp_path) == []

    def test_eksik_hero_dosyasi_yakalanir(self, tmp_path: Path) -> None:
        markdown = _rendered(hero_image=hero_path_for("yok"))
        target = write(markdown, "t", content_dir=tmp_path, overwrite=True)
        problems = audit_images(target, repo_root=tmp_path)
        assert any("dosyası yok" in problem for problem in problems)

    def test_bozuk_hero_dosyasi_yakalanir(self, tmp_path: Path) -> None:
        asset = tmp_path / "public" / "images" / "generated" / "equinox-haber"
        asset.mkdir(parents=True)
        (asset / "kucuk.webp").write_bytes(b"x" * 10)
        markdown = _rendered(hero_image=hero_path_for("kucuk"))
        target = write(markdown, "t", content_dir=tmp_path, overwrite=True)
        assert any("bozuk" in p for p in audit_images(target, repo_root=tmp_path))


class TestScope:
    @pytest.mark.parametrize(
        "path,expected",
        [
            ("src/content/equinoxHaber/x.md", True),
            ("public/images/generated/equinox-haber/x.webp", True),
            ("src/pages/index.astro", False),
            ("package.json", False),
            ("newsroom/newsroom/publish.py", False),
        ],
    )
    def test_kapsam_ayrimi(self, path: str, expected: bool) -> None:
        assert is_publish_scoped(path) is expected

    def test_kapsam_disi_degisiklik_raporlanir(self, tmp_path: Path) -> None:
        import subprocess

        subprocess.run(("git", "init", "-q"), cwd=tmp_path, check=True)
        (tmp_path / "beklenmedik.txt").write_text("x", encoding="utf-8")
        problems = audit_scope(repo_root=tmp_path)
        assert any("kapsamı dışında" in problem for problem in problems)
