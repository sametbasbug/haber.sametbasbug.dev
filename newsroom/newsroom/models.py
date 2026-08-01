"""Veri modelleri.

Tek bir aday haber kaydı, toplamadan yayına kadar bu biçimde taşınır.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True, slots=True)
class Candidate:
    """Toplanmış ve normalize edilmiş bir aday haber.

    Editoryal alan içermez: skor, öncelik, ceza puanı yoktur. Bu kayıt neyin
    toplandığını söyler, ne kadar iyi olduğunu değil.
    """

    id: str
    source_id: str
    source_name: str
    canonical_url: str
    title: str
    summary: str = ""
    published_at: datetime | None = None
    category_hints: list[str] = field(default_factory=list)

    # Kaynak sayfasından çıkarılan tam metin. Toplama aşamasında doldurulur;
    # brief'e giren adaylar için zorunludur.
    article_text: str = ""

    @classmethod
    def from_normalized(cls, record: dict) -> Candidate:
        """Eski `news_pipeline` normalized kaydından üretir.

        Yalnız geçiş dönemi ve test korpusu için; yeni toplama katmanı
        doğrudan `Candidate` üretir.
        """
        raw_date = record.get("published_at")
        published_at = None
        if raw_date:
            try:
                published_at = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
            except ValueError:
                published_at = None

        return cls(
            id=record.get("id", ""),
            source_id=record.get("source_id", ""),
            source_name=record.get("source_name", ""),
            canonical_url=record.get("canonical_url", ""),
            title=record.get("title", "") or "",
            summary=record.get("summary", "") or "",
            published_at=published_at,
            category_hints=list(record.get("category_hints") or []),
        )
