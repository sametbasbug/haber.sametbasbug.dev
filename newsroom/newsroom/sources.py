"""Kaynak havuzu yapılandırması.

Bu modül yalnız *nereden* toplandığını bilir. Bir kaynağın kalitesi, ağırlığı
veya hangi konuda tercih edileceği burada yer almaz — o yargı `POLICY.md`
içindedir.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

import yaml

DEFAULT_SOURCES_PATH = Path(__file__).parent / "config" / "sources.yaml"

# Toplama sıklığı etiketleri. Amaç editoryal değil maliyet kontrolüdür: saat
# başı çalışan bir çevrimde her kaynağı her saat çekmek gereksiz ağ yüküdür.
_CADENCE = {
    "hourly": timedelta(hours=1),
    "3h": timedelta(hours=3),
    "6h": timedelta(hours=6),
    "12h": timedelta(hours=12),
    "daily": timedelta(days=1),
}


@dataclass(frozen=True, slots=True)
class Source:
    id: str
    name: str
    url: str
    category_hints: tuple[str, ...] = ()
    enabled: bool = True
    cadence: str = "hourly"
    max_items: int = 20

    @property
    def interval(self) -> timedelta:
        return _CADENCE.get(self.cadence, timedelta(hours=1))


def load_sources(path: Path | None = None) -> list[Source]:
    """Yapılandırmayı okur ve etkin kaynakları döner."""
    target = path or DEFAULT_SOURCES_PATH
    payload = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
    entries = payload.get("sources") or []

    sources: list[Source] = []
    seen: set[str] = set()
    for entry in entries:
        source = Source(
            id=entry["id"],
            name=entry["name"],
            url=entry["url"],
            category_hints=tuple(entry.get("category_hints") or ()),
            enabled=bool(entry.get("enabled", True)),
            cadence=entry.get("cadence", "hourly"),
            max_items=int(entry.get("max_items", 20)),
        )
        if source.id in seen:
            raise ValueError(f"kaynak id tekrar ediyor: {source.id}")
        seen.add(source.id)
        if source.enabled:
            sources.append(source)

    if not sources:
        raise ValueError(f"etkin kaynak yok: {target}")
    return sources


def due_sources(
    sources: list[Source], last_fetched: dict[str, float], *, now: float
) -> list[Source]:
    """Cadence'ine göre bu çevrimde çekilmesi gereken kaynakları döner."""
    due: list[Source] = []
    for source in sources:
        previous = last_fetched.get(source.id)
        if previous is None or (now - previous) >= source.interval.total_seconds():
            due.append(source)
    return due
