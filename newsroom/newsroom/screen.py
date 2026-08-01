"""Mekanik eleme (M1-M9).

Bu modül **hiçbir editoryal yargı içermez.** Buradaki her kapı doğru/yanlış
olarak karara bağlanabilir: bir tarih eskidir ya da değildir, bir URL sponsorlu
işaret taşır ya da taşımaz.

"Bu haber bizim çizgimize uygun mu", "bu kaynak fazla mı kullanıldı", "bu konu
tekrar mı" gibi sorular buraya girmez. Onlar `POLICY.md` içindedir ve Asteria
tarafından cevaplanır. Bu ayrımın bozulması, yerine geçtiğimiz sistemi kırk
ayarlanmış sabite götüren şeydi.

Eleme dar tutulur: amaç en iyi adayı seçmek değil, **seçilemeyecek** olanı
elemektir. Kalan havuz Asteria'ya sunulur.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import re

from newsroom.models import Candidate

# Kaynak yaşı penceresi. Saat başı çalışan bir çevrim için 24 saat, bir haberin
# hâlâ haber sayılabileceği üst sınırdır.
MAX_SOURCE_AGE = timedelta(hours=24)

# Besleme tarihleri zaman zaman ileri kayar. Küçük sapma tolere edilir, büyük
# sapma kaydın güvenilmez olduğunu gösterir.
MAX_FUTURE_SKEW = timedelta(hours=6)

# Bu uzunluğun altındaki başlıklar haber başlığı değildir (besleme artığı,
# bölüm adı, kırık kayıt).
MIN_TITLE_LENGTH = 18

# Reklam/sponsorlu içerik yol işaretleri. Biçim tespitidir, konu yargısı değil.
_SPONSORED_URL_MARKERS = (
    "/sponsored-content/",
    "/sponsored/",
    "/brandstudio/",
    "/brand-studio/",
    "/paid-content/",
    "/partner-content/",
    "/advertorial/",
)

# Canlı anlatım (liveblog) biçimi. Sürekli güncellenen, tek bir olaya
# bağlanamayan ve kaynak metni sabit olmayan sayfalar.
_LIVEBLOG_URL_MARKERS = ("/live/", "/liveblog/", "-live-updates", "/live-news/")
_LIVEBLOG_TITLE_RE = re.compile(
    r"\bas it happened\b|"
    r"\blive\s+(?:updates?|blog|coverage|reaction)\b|"
    r"(?:^|\s[–—-]\s)latest updates?\b",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ScreenDecision:
    """Bir adayın mekanik eleme sonucu."""

    eligible: bool
    code: str | None = None
    reason: str | None = None

    @classmethod
    def passed(cls) -> ScreenDecision:
        return cls(True)

    @classmethod
    def blocked(cls, code: str, reason: str) -> ScreenDecision:
        return cls(False, code, reason)


def screen(candidate: Candidate, *, now: datetime | None = None) -> ScreenDecision:
    """Adayı mekanik kapılardan geçirir.

    `now` açıkça verilebilir; testler ve geriye dönük değerlendirme için gerekli.
    """
    moment = now or datetime.now(UTC)

    if len(candidate.title.strip()) < MIN_TITLE_LENGTH:
        return ScreenDecision.blocked(
            "title_too_short",
            f"başlık {len(candidate.title.strip())} karakter, en az {MIN_TITLE_LENGTH} gerekli",
        )

    url = candidate.canonical_url.lower()

    if any(marker in url for marker in _SPONSORED_URL_MARKERS):
        return ScreenDecision.blocked("sponsored", "sponsorlu/reklam içerik yolu")

    if any(marker in url for marker in _LIVEBLOG_URL_MARKERS) or _LIVEBLOG_TITLE_RE.search(
        candidate.title
    ):
        return ScreenDecision.blocked("liveblog", "canlı anlatım biçimi")

    if candidate.published_at is None:
        # Tazelik kapısı yaş ölçemediği aday için sessizce açılmaz. Beslemede
        # tarih yoksa haberin ne zaman çıktığı doğrulanamaz ve doğrulanamayan
        # şey kapıdan geçmez. Mevcut 38 kaynağın tamamı tarih veriyor; bu dal
        # bir besleme bozulduğunda devreye girer ve sayımda görünür.
        return ScreenDecision.blocked("undated", "kaynakta yayın tarihi yok")

    published = candidate.published_at.astimezone(UTC)
    age = moment - published

    if age > MAX_SOURCE_AGE:
        hours = age.total_seconds() / 3600
        return ScreenDecision.blocked(
            "stale",
            f"kaynak {hours:.0f} saatlik, üst sınır {MAX_SOURCE_AGE.total_seconds() / 3600:.0f} saat",
        )

    if age < -MAX_FUTURE_SKEW:
        hours = -age.total_seconds() / 3600
        return ScreenDecision.blocked(
            "future_dated",
            f"yayın tarihi {hours:.0f} saat ileride",
        )

    return ScreenDecision.passed()


def eligible(
    candidates: list[Candidate], *, now: datetime | None = None
) -> tuple[list[Candidate], dict[str, int]]:
    """Havuzu eler; kalanları ve ret kodlarının sayımını döner.

    Sayım brief'e eklenir: Asteria havuzun ne kadarının mekanik olarak
    elendiğini görür, ama elenmiş adayların kendilerini görmez.
    """
    kept: list[Candidate] = []
    blocked: dict[str, int] = {}

    for candidate in candidates:
        decision = screen(candidate, now=now)
        if decision.eligible:
            kept.append(candidate)
        elif decision.code:
            blocked[decision.code] = blocked.get(decision.code, 0) + 1

    return kept, blocked
