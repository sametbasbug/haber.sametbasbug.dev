"""Aday deposu.

Toplanan adaylar çevrimler arasında saklanır.

Neden gerekli: kaynakların cadence'i farklı (saatlik, 3 saatlik, 6 saatlik).
Saat başı çalışan bir çevrimde yalnız o an çekilen kaynakların adaylarına
bakılırsa, 6 saatlik bir kaynaktan gelen haber bir sonraki çevrimde kaybolur ve
pano çoğu çevrimde aç kalır. Depo, toplama ritmi ile seçim ritmini birbirinden
ayırır.

Depo `newsroom/data/` altındadır ve git dışıdır. Kaybolursa sistem çalışmayı
sürdürür; yalnız bir sonraki toplama turuna kadar pano daralır.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
from pathlib import Path

from newsroom.models import Candidate

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CANDIDATES_PATH = DATA_DIR / "candidates.json"

# Depoda tutma süresi. Eleme kapısı 24 saat olduğu için daha eskisi zaten
# elenir; pay, saat farkları ve gecikmiş besleme tarihleri içindir.
MAX_STORED_AGE = timedelta(hours=36)


def _to_dict(candidate: Candidate) -> dict:
    return {
        "id": candidate.id,
        "source_id": candidate.source_id,
        "source_name": candidate.source_name,
        "canonical_url": candidate.canonical_url,
        "title": candidate.title,
        "summary": candidate.summary,
        "published_at": candidate.published_at.isoformat() if candidate.published_at else None,
        "category_hints": list(candidate.category_hints),
        "first_seen": candidate.first_seen.isoformat() if candidate.first_seen else None,
    }


def _from_dict(record: dict) -> Candidate | None:
    try:
        return Candidate(
            id=record["id"],
            source_id=record.get("source_id", ""),
            source_name=record.get("source_name", ""),
            canonical_url=record.get("canonical_url", ""),
            title=record.get("title", ""),
            summary=record.get("summary", ""),
            published_at=_parse(record.get("published_at")),
            category_hints=list(record.get("category_hints") or []),
            first_seen=_parse(record.get("first_seen")),
        )
    except KeyError:
        return None


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).astimezone(UTC)
    except ValueError:
        return None


def load(path: Path | None = None) -> list[Candidate]:
    target = path or CANDIDATES_PATH
    if not target.is_file():
        return []
    try:
        records = json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if not isinstance(records, list):
        return []
    return [candidate for record in records if (candidate := _from_dict(record))]


def save(candidates: list[Candidate], path: Path | None = None) -> None:
    target = path or CANDIDATES_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps([_to_dict(c) for c in candidates], ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )


def merge(
    stored: list[Candidate],
    fresh: list[Candidate],
    *,
    now: datetime | None = None,
    max_age: timedelta = MAX_STORED_AGE,
) -> list[Candidate]:
    """Yeni adayları depoya katar ve eskimişleri düşürür.

    Aynı URL yeniden görülürse depodaki kayıt korunur; `first_seen` böylece
    adayın ilk göründüğü an olarak kalır.
    """
    moment = now or datetime.now(UTC)
    merged: dict[str, Candidate] = {c.id: c for c in stored}

    for candidate in fresh:
        if candidate.id in merged:
            continue
        merged[candidate.id] = (
            candidate if candidate.first_seen else _stamp(candidate, moment)
        )

    cutoff = moment - max_age
    return [
        candidate
        for candidate in merged.values()
        if _age_reference(candidate, moment) >= cutoff
    ]


def _stamp(candidate: Candidate, moment: datetime) -> Candidate:
    from dataclasses import replace

    return replace(candidate, first_seen=moment)


def _age_reference(candidate: Candidate, moment: datetime) -> datetime:
    """Eskime ölçütü: yayın tarihi, yoksa ilk görülme."""
    if candidate.published_at:
        return candidate.published_at.astimezone(UTC)
    return candidate.first_seen or moment
