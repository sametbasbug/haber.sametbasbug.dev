"""Hero görseli işleme.

Görseli bu modül **üretmez**. Üretimi Codex kendi tarafında yapar; buradaki iş,
üretilen dosyayı yayına uygun hâle getirmek ve üretim olmadığında yedek yola
geçmektir.

Sıra:

1. Slug için görsel zaten varsa yeniden üretilmez. Codex kotası Nyx ile
   paylaşıldığı için tekrar üretim doğrudan Nyx'ten çalmak demektir.
2. Codex bir dosya ürettiyse normalize edilir.
3. Üretim yoksa Pexels'ten stok görsel alınır.
4. O da olmazsa haber hero'suz yayımlanır; yayın durmaz.

Hedef biçim diskteki 327 görselden ölçüldü: hepsi 1200×675, medyan 91 KB,
tamamı 400 KB sınırının altında.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess

import httpx

from newsroom.env import get_env

HERO_WIDTH = 1200
HERO_HEIGHT = 675
HERO_QUALITY = 82
HERO_MAX_BYTES = 400 * 1024
HERO_MIN_BYTES = 1024

REPO_ROOT = Path(__file__).resolve().parents[2]
HERO_DIR = REPO_ROOT / "public" / "images" / "generated" / "equinox-haber"
HERO_PUBLIC_PREFIX = "/images/generated/equinox-haber"

CONVERT_TIMEOUT_SECONDS = 60
PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
PEXELS_TIMEOUT_SECONDS = 15.0

# Stok görselde aranan en az genişlik. 1200 piksele küçültüleceği için daha
# büyük bir orijinal, kırpma sonrası netliği korur.
PEXELS_MIN_WIDTH = 1400


@dataclass(frozen=True, slots=True)
class HeroResult:
    """Hero işleminin sonucu.

    `public_path` frontmatter'a yazılacak yoldur. Üretilemediyse `None` olur ve
    haber hero'suz yayımlanır — bu bir hata değil, kabul edilmiş bir sonuçtur.
    """

    public_path: str | None = None
    origin: str | None = None
    credit: str | None = None
    failure: str | None = None

    @property
    def ok(self) -> bool:
        return self.public_path is not None


def hero_path(slug: str, *, hero_dir: Path | None = None) -> Path:
    return (hero_dir or HERO_DIR) / f"{slug}.webp"


def public_path(slug: str) -> str:
    return f"{HERO_PUBLIC_PREFIX}/{slug}.webp"


def existing(slug: str, *, hero_dir: Path | None = None) -> HeroResult | None:
    """Slug için kullanılabilir bir görsel zaten varsa onu döner.

    Kota koruması: aynı haber için ikinci kez üretim yapılmaz.
    """
    target = hero_path(slug, hero_dir=hero_dir)
    if target.is_file() and HERO_MIN_BYTES < target.stat().st_size <= HERO_MAX_BYTES:
        return HeroResult(public_path=public_path(slug), origin="existing")
    return None


def normalize(source: Path, slug: str, *, hero_dir: Path | None = None) -> HeroResult:
    """Verilen görseli yayın biçimine çevirir.

    Codex'in ürettiği dosya bu fonksiyona verilir: 1200×675'e ortadan kırpılır,
    metadata temizlenir, WebP olarak yazılır.
    """
    if shutil.which("magick") is None:
        return HeroResult(failure="ImageMagick (magick) bulunamadı")
    if not source.is_file():
        return HeroResult(failure=f"kaynak dosya yok: {source}")
    if source.stat().st_size <= HERO_MIN_BYTES:
        return HeroResult(failure=f"kaynak dosya bozuk ({source.stat().st_size} bayt)")

    directory = hero_dir or HERO_DIR
    directory.mkdir(parents=True, exist_ok=True)
    target = hero_path(slug, hero_dir=directory)

    # Kaynak hedefin kendisiyse yerinde dönüştürme yapılmaz; geçici dosyaya
    # yazılıp sonra taşınır.
    staging = target.with_name(f"{slug}.staging.webp")
    staging.unlink(missing_ok=True)

    command = [
        "magick",
        str(source),
        "-auto-orient",
        "-resize",
        f"{HERO_WIDTH}x{HERO_HEIGHT}^",
        "-gravity",
        "center",
        "-extent",
        f"{HERO_WIDTH}x{HERO_HEIGHT}",
        "-strip",
        "-quality",
        str(HERO_QUALITY),
        str(staging),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=CONVERT_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        staging.unlink(missing_ok=True)
        return HeroResult(failure="görsel dönüştürme zaman aşımına uğradı")

    if result.returncode != 0 or not staging.is_file():
        staging.unlink(missing_ok=True)
        detail = (result.stderr or result.stdout or "").strip().splitlines()[-1:]
        return HeroResult(failure=f"dönüştürme başarısız: {' '.join(detail)[:160]}")

    size = staging.stat().st_size
    if not HERO_MIN_BYTES < size <= HERO_MAX_BYTES:
        staging.unlink(missing_ok=True)
        return HeroResult(failure=f"çıktı boyutu sınır dışında ({size} bayt)")

    staging.replace(target)
    return HeroResult(public_path=public_path(slug), origin="generated")


def _pexels_key() -> str | None:
    """Anahtarı ortamdan ya da `.env` dosyasından okur.

    Anahtar repoya yazılmaz ve komut satırından geçirilmez.
    """
    return get_env("PEXELS_API_KEY")


def from_pexels(
    slug: str,
    queries: list[str],
    *,
    exclude_ids: set[str] | None = None,
    hero_dir: Path | None = None,
    client: httpx.Client | None = None,
) -> HeroResult:
    """Stok görsel yedeği.

    Seçim mekaniktir: yatay, yeterince geniş, daha önce kullanılmamış ilk
    sonuç alınır. Eski sistemdeki ayarlanmış puanlama tablosu taşınmadı —
    hangi görselin daha uygun olduğu yargıdır ve stok yedeğinde o yargıyı
    taklit etmeye çalışmanın karşılığı yok.
    """
    api_key = _pexels_key()
    if not api_key:
        return HeroResult(failure="PEXELS_API_KEY tanımlı değil")

    skip = exclude_ids or set()
    owned = client is None
    session = client or httpx.Client(timeout=PEXELS_TIMEOUT_SECONDS, follow_redirects=True)

    try:
        for query in queries:
            if not query.strip():
                continue
            try:
                response = session.get(
                    PEXELS_SEARCH_URL,
                    params={"query": query, "per_page": 15, "orientation": "landscape"},
                    headers={"Authorization": api_key},
                )
                response.raise_for_status()
                photos = response.json().get("photos") or []
            except Exception as exc:
                return HeroResult(failure=f"Pexels araması başarısız: {type(exc).__name__}")

            for photo in photos:
                photo_id = str(photo.get("id") or "")
                if not photo_id or photo_id in skip:
                    continue
                if int(photo.get("width") or 0) < PEXELS_MIN_WIDTH:
                    continue
                source_url = (photo.get("src") or {}).get("large2x") or (
                    photo.get("src") or {}
                ).get("large")
                if not source_url:
                    continue

                directory = hero_dir or HERO_DIR
                directory.mkdir(parents=True, exist_ok=True)
                download = directory / f"{slug}.download"
                try:
                    download.write_bytes(session.get(source_url).content)
                except Exception as exc:
                    download.unlink(missing_ok=True)
                    return HeroResult(failure=f"Pexels indirme başarısız: {type(exc).__name__}")

                result = normalize(download, slug, hero_dir=directory)
                download.unlink(missing_ok=True)
                if result.ok:
                    return HeroResult(
                        public_path=result.public_path,
                        origin=f"pexels:{photo_id}",
                        credit=photo.get("photographer") or None,
                    )
                return result

        return HeroResult(failure="uygun stok görsel bulunamadı")
    finally:
        if owned:
            session.close()


def resolve(
    slug: str,
    *,
    generated: Path | None = None,
    queries: list[str] | None = None,
    exclude_ids: set[str] | None = None,
    hero_dir: Path | None = None,
) -> HeroResult:
    """Hero'yu sırayla çözer: mevcut → Codex çıktısı → Pexels → yok.

    Hiçbiri olmazsa dönen sonuç `ok=False` olur ve haber hero'suz yayımlanır.
    """
    if found := existing(slug, hero_dir=hero_dir):
        return found

    if generated is not None:
        result = normalize(generated, slug, hero_dir=hero_dir)
        if result.ok:
            return result
        fallback_reason = result.failure
    else:
        fallback_reason = "Codex görseli sağlanmadı"

    stock = from_pexels(
        slug, queries or [], exclude_ids=exclude_ids, hero_dir=hero_dir
    )
    if stock.ok:
        return stock

    return HeroResult(failure=f"{fallback_reason}; stok yedek: {stock.failure}")
