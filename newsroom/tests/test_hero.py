"""Hero işleme testleri. Ağ gerektirmez; Pexels çağrıları taklit edilir."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess

import pytest

from newsroom.hero import (
    HERO_HEIGHT,
    HERO_MAX_BYTES,
    HERO_QUALITY,
    HERO_WIDTH,
    HeroResult,
    existing,
    hero_path,
    normalize,
    public_path,
    resolve,
)

pytestmark = pytest.mark.skipif(
    shutil.which("magick") is None, reason="ImageMagick kurulu değil"
)


def _source_image(path: Path, size: str = "1600x900", color: str = "steelblue") -> Path:
    """Testler için gerçek bir görsel üretir."""
    subprocess.run(
        ["magick", "-size", size, f"gradient:{color}-black", str(path)],
        check=True,
        capture_output=True,
    )
    return path


class TestNormalize:
    def test_hedef_boyut_ve_bicime_cevrilir(self, tmp_path: Path) -> None:
        source = _source_image(tmp_path / "kaynak.png")
        result = normalize(source, "bir-slug", hero_dir=tmp_path)

        assert result.ok, result.failure
        assert result.public_path == "/images/generated/equinox-haber/bir-slug.webp"

        target = hero_path("bir-slug", hero_dir=tmp_path)
        identify = subprocess.run(
            ["magick", "identify", "-format", "%wx%h %m", str(target)],
            capture_output=True,
            text=True,
            check=True,
        )
        assert identify.stdout.strip() == f"{HERO_WIDTH}x{HERO_HEIGHT} WEBP"

    def test_dikey_gorsel_ortadan_kirpilir(self, tmp_path: Path) -> None:
        source = _source_image(tmp_path / "dikey.png", size="900x1600")
        result = normalize(source, "dikey", hero_dir=tmp_path)
        assert result.ok, result.failure

        identify = subprocess.run(
            ["magick", "identify", "-format", "%wx%h", str(hero_path("dikey", hero_dir=tmp_path))],
            capture_output=True,
            text=True,
            check=True,
        )
        assert identify.stdout.strip() == f"{HERO_WIDTH}x{HERO_HEIGHT}"

    def test_cikti_boyut_sinirinda_kalir(self, tmp_path: Path) -> None:
        source = _source_image(tmp_path / "buyuk.png", size="4000x2250")
        normalize(source, "buyuk", hero_dir=tmp_path)
        assert hero_path("buyuk", hero_dir=tmp_path).stat().st_size <= HERO_MAX_BYTES

    def test_gecici_dosya_birakilmaz(self, tmp_path: Path) -> None:
        normalize(_source_image(tmp_path / "k.png"), "temiz", hero_dir=tmp_path)
        assert list(tmp_path.glob("*.staging.webp")) == []

    def test_olmayan_kaynak_hata_verir(self, tmp_path: Path) -> None:
        result = normalize(tmp_path / "yok.png", "x", hero_dir=tmp_path)
        assert not result.ok and "kaynak dosya yok" in result.failure

    def test_bozuk_kaynak_hata_verir(self, tmp_path: Path) -> None:
        broken = tmp_path / "bozuk.png"
        broken.write_bytes(b"x" * 10)
        result = normalize(broken, "x", hero_dir=tmp_path)
        assert not result.ok and "bozuk" in result.failure


class TestExisting:
    def test_var_olan_gorsel_yeniden_uretilmez(self, tmp_path: Path) -> None:
        """Kota koruması: Codex kotası Nyx ile paylaşılıyor."""
        normalize(_source_image(tmp_path / "k.png"), "mevcut", hero_dir=tmp_path)
        found = existing("mevcut", hero_dir=tmp_path)
        assert found is not None and found.origin == "existing"

    def test_olmayan_gorsel_none_doner(self, tmp_path: Path) -> None:
        assert existing("yok", hero_dir=tmp_path) is None

    def test_bozuk_gorsel_mevcut_sayilmaz(self, tmp_path: Path) -> None:
        hero_path("bozuk", hero_dir=tmp_path).write_bytes(b"x" * 10)
        assert existing("bozuk", hero_dir=tmp_path) is None


class TestResolve:
    def test_mevcut_gorsel_oncelikli(self, tmp_path: Path) -> None:
        normalize(_source_image(tmp_path / "k.png"), "slug", hero_dir=tmp_path)
        source = _source_image(tmp_path / "yeni.png", color="red")
        result = resolve("slug", generated=source, hero_dir=tmp_path)
        assert result.origin == "existing"

    def test_codex_ciktisi_kullanilir(self, tmp_path: Path) -> None:
        source = _source_image(tmp_path / "codex.png")
        result = resolve("yeni-slug", generated=source, hero_dir=tmp_path)
        assert result.ok and result.origin == "generated"

    def test_gorsel_yoksa_yayin_engellenmez(self, tmp_path: Path, monkeypatch) -> None:
        """Hero üretilemezse sonuç başarısızdır ama istisna fırlatmaz."""
        monkeypatch.delenv("PEXELS_API_KEY", raising=False)
        result = resolve("hicbir-sey", hero_dir=tmp_path)
        assert result.ok is False
        assert result.public_path is None
        assert "PEXELS_API_KEY" in result.failure

    def test_anahtar_yoksa_pexels_denenmez(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.delenv("PEXELS_API_KEY", raising=False)
        result = resolve("x", queries=["nato"], hero_dir=tmp_path)
        assert "PEXELS_API_KEY tanımlı değil" in result.failure


class TestPexels:
    def _stub_client(self, photos: list[dict], image: bytes):
        class Response:
            def __init__(self, payload=None, content=b""):
                self._payload = payload
                self.content = content

            def raise_for_status(self) -> None:
                return None

            def json(self):
                return self._payload

        class Client:
            def get(self, url, **kwargs):
                if "api.pexels.com" in url:
                    return Response(payload={"photos": photos})
                return Response(content=image)

            def close(self) -> None:
                return None

        return Client()

    def test_uygun_foto_indirilir_ve_normalize_edilir(
        self, tmp_path: Path, monkeypatch
    ) -> None:
        monkeypatch.setenv("PEXELS_API_KEY", "test-key")
        image = _source_image(tmp_path / "stok.png").read_bytes()
        photos = [
            {"id": 1, "width": 1000, "src": {"large2x": "https://x/1.jpg"}},
            {"id": 2, "width": 2000, "src": {"large2x": "https://x/2.jpg"}, "photographer": "Ada L."},
        ]
        from newsroom.hero import from_pexels

        result = from_pexels(
            "stok-slug", ["nato"], hero_dir=tmp_path, client=self._stub_client(photos, image)
        )
        assert result.ok, result.failure
        assert result.origin == "pexels:2"
        assert result.credit == "Ada L."

    def test_dislanan_foto_atlanir(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setenv("PEXELS_API_KEY", "test-key")
        image = _source_image(tmp_path / "stok.png").read_bytes()
        photos = [{"id": 7, "width": 2000, "src": {"large2x": "https://x/7.jpg"}}]
        from newsroom.hero import from_pexels

        result = from_pexels(
            "x",
            ["nato"],
            exclude_ids={"7"},
            hero_dir=tmp_path,
            client=self._stub_client(photos, image),
        )
        assert not result.ok
        assert "bulunamadı" in result.failure

    def test_dar_foto_atlanir(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setenv("PEXELS_API_KEY", "test-key")
        image = _source_image(tmp_path / "stok.png").read_bytes()
        photos = [{"id": 3, "width": 800, "src": {"large2x": "https://x/3.jpg"}}]
        from newsroom.hero import from_pexels

        result = from_pexels(
            "x", ["nato"], hero_dir=tmp_path, client=self._stub_client(photos, image)
        )
        assert not result.ok


def test_public_yol_bicimi() -> None:
    assert public_path("abc") == "/images/generated/equinox-haber/abc.webp"


def test_sonuc_varsayilan_olarak_basarisiz() -> None:
    assert HeroResult().ok is False


def test_kalite_ayari_arsivle_ayni() -> None:
    """Diskteki 327 görsel bu ayarlarla üretildi."""
    assert (HERO_WIDTH, HERO_HEIGHT, HERO_QUALITY) == (1200, 675, 82)
