"""Asteria brief'i.

Bir çevrimde Asteria'ya giden **tek** yapıdır. İçinde adaylar, kaynak metinleri
ve canlı yayın bağlamı bulunur.

Eski akış üç ajan turu tüketiyordu: pano komutu, ardından Asteria'nın kaynak
sayfasını ayrıca okuması, sonra polish, sonra publish. Burada tam metin brief'in
içinde geldiği için tek tur yeter.

Politika brief'e gömülmez. Codex yerelde repo içinde çalıştığından Asteria
`POLICY.md`'yi diskten okur; brief yalnız yolunu ve içerik parmak izini taşır.
Politika tek yerde kalır ve her çevrimde yeniden gönderilmez.

Aday seçimi burada **mekaniktir ve tarafsızdır**: kaynaklar arasında sırayla,
her kaynağın en yenisinden başlayarak. Kaynak ağırlığı, konu puanı ve kategori
kotası yoktur — hangisinin daha iyi haber olduğu Asteria'nın kararıdır. Sıra
usulünün tek amacı, saatte 20 haber basan bir kaynağın panoyu doldurmasını
engellemektir.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
import hashlib
from pathlib import Path

import httpx

from newsroom.extract import extract
from newsroom.ingest import USER_AGENT
from newsroom.live import LiveIndex
from newsroom.models import Candidate

POLICY_PATH = Path(__file__).resolve().parents[1] / "POLICY.md"
REPO_ROOT = POLICY_PATH.parents[1]

# Brief'e girecek, tam metni çıkarılmış aday sayısı.
BOARD_SIZE = 8

# Tek bir kaynağın panoda alabileceği en fazla yer. Kalite yargısı değil, pano
# bileşimi kuralı: Asteria'ya seçenek sunulmalı. Havuz inceyse pano eksik dolar;
# altı haberin dördünün aynı kaynaktan geldiği bir pano seçim imkânı vermez.
MAX_PER_SOURCE = 3

# Metin çıkarımı için üst deneme sınırı. Çıkarım ~%80 başarılı olduğundan
# pano dolana kadar sıradaki adaylara geçilir, ama sınırsız denenmez.
MAX_EXTRACTION_ATTEMPTS = 16

# Brief'te aday başına gönderilecek metin üst sınırı. `extract.MAX_ARTICLE_TEXT`
# ham çıkarımı sınırlar; bu ise bağlam maliyetini sınırlar.
BRIEF_TEXT_LIMIT = 4000


def select_board(
    candidates: list[Candidate],
    live: LiveIndex,
    *,
    size: int = BOARD_SIZE,
    exclude_ids: set[str] | None = None,
) -> list[Candidate]:
    """Panoya girecek adayları mekanik olarak sıralar.

    Sıra usulü: kaynaklar arasında dönerek, her kaynağın en yeni haberinden
    başlayarak. Hiçbir kaynak diğerinden öncelikli değildir.
    """
    skip = exclude_ids or set()

    by_source: dict[str, list[Candidate]] = {}
    for candidate in candidates:
        if candidate.id in skip:
            continue
        if live.has_url(candidate.canonical_url):
            continue
        if live.duplicate_of(candidate.title) is not None:
            continue
        by_source.setdefault(candidate.source_id, []).append(candidate)

    for group in by_source.values():
        group.sort(
            key=lambda c: c.published_at or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )

    ordered: list[Candidate] = []
    for round_index in range(MAX_PER_SOURCE):
        added = False
        for source_id in sorted(by_source):
            group = by_source[source_id]
            if round_index < len(group):
                ordered.append(group[round_index])
                added = True
                if len(ordered) >= size:
                    return ordered
        if not added:
            break

    return ordered


def attach_text(
    candidates: list[Candidate],
    *,
    size: int = BOARD_SIZE,
    max_attempts: int = MAX_EXTRACTION_ATTEMPTS,
    client: httpx.Client | None = None,
) -> tuple[list[Candidate], list[tuple[str, str]]]:
    """Adayların kaynak metnini çeker.

    Metni alınamayan aday panoya girmez; sıradaki adaya geçilir. Düşenler
    gerekçeleriyle döner, çünkü sessiz kayıp operasyonda en pahalı şeydir.
    """
    owned = client is None
    session = client or httpx.Client(
        timeout=15.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}
    )

    filled: list[Candidate] = []
    dropped: list[tuple[str, str]] = []
    try:
        for candidate in candidates[:max_attempts]:
            if len(filled) >= size:
                break
            result = extract(candidate.canonical_url, client=session)
            if result.ok:
                filled.append(replace(candidate, article_text=result.text))
            else:
                dropped.append((candidate.id, result.failure or "bilinmeyen hata"))
    finally:
        if owned:
            session.close()

    return filled, dropped


def policy_fingerprint(path: Path | None = None) -> str:
    """Politikanın içerik parmak izi.

    Brief'te taşınır ki Asteria'nın okuduğu politika ile sistemin varsaydığı
    politika ayrıştığında bu fark görünür olsun.
    """
    target = path or POLICY_PATH
    return hashlib.sha256(target.read_bytes()).hexdigest()[:12]


def build_brief(
    board: list[Candidate],
    live: LiveIndex,
    *,
    select_count: int = 1,
    screening: dict[str, int] | None = None,
    pool_size: int = 0,
    now: datetime | None = None,
) -> dict:
    """Asteria'ya gidecek tek yapıyı üretir."""
    moment = now or datetime.now(UTC)

    return {
        "generatedAt": moment.isoformat(),
        "policy": {
            "path": str(POLICY_PATH.relative_to(REPO_ROOT)),
            "fingerprint": policy_fingerprint(),
        },
        "task": {
            "selectCount": select_count,
            "mayDecline": True,
            "note": (
                "Panodan en fazla selectCount haber seç ve yaz. Yayımlanabilir "
                "aday yoksa seçim yapmadan gerekçeni bildir; bu başarısızlık değildir."
            ),
        },
        "board": [
            {
                "id": candidate.id,
                "source": candidate.source_name,
                "url": candidate.canonical_url,
                "publishedAt": (
                    candidate.published_at.isoformat() if candidate.published_at else None
                ),
                "categoryHints": candidate.category_hints,
                "title": candidate.title,
                "sourceText": candidate.article_text[:BRIEF_TEXT_LIMIT],
                # Metin kesildiyse Asteria bunu bilmelidir: eksik bir metnin
                # sonunu tahminle tamamlamak yerine haberi geçebilsin.
                "sourceTextTruncated": len(candidate.article_text) > BRIEF_TEXT_LIMIT,
            }
            for candidate in board
        ],
        "liveContext": live.recent_context(),
        # Brief'e giren her alan her koşuda bağlam maliyeti doğurur ve o kota
        # Nyx'le paylaşılıyor. Buradaki iki sayı editoryal karara girer: havuz
        # daraldığında koşuyu boş geçme eşiği yükselir. Operasyonel teşhis
        # (`newsroom status`) ayrı yerdedir, brief'e karışmaz.
        "pipeline": {
            "collected": pool_size,
            "mechanicallyFiltered": screening or {},
        },
    }
