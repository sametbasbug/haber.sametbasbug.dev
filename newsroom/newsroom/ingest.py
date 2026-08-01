"""Besleme toplama.

Yalnız besleme okur. Haber sayfalarına **gitmez** — tam metin, elemeden sonra
yalnız brief'e giren birkaç aday için `extract.py` tarafından çekilir.

Maliyet notu: eski sistem her çevrimde 38 besleme ve ek olarak 116 haber sayfası
çekiyordu. Metin çıkarımını elemeden sonraya almak, çevrim başına sayfa çekimini
iki basamak aşağı indirir; elenecek adayın metnini indirmenin bir karşılığı yok.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
import hashlib
import re

import feedparser
import httpx

from newsroom.models import Candidate
from newsroom.sources import Source

FEED_TIMEOUT_SECONDS = 15.0
MAX_PARALLEL_FEEDS = 8
USER_AGENT = "EquinoxHaber/1.0 (+https://haber.sametbasbug.dev)"

_WHITESPACE_RE = re.compile(r"\s+")
_TAG_RE = re.compile(r"<[^>]+>")

# Besleme URL'lerine iliştirilen izleme parametreleri. Aynı haberin iki farklı
# izleme kuyruğuyla iki ayrı aday sayılmaması için temizlenir.
_TRACKING_PREFIXES = ("utm_", "maca", "at_", "ito", "cmpid", "ncid", "partner", "mod")


@dataclass(frozen=True, slots=True)
class FeedError:
    """Bir beslemenin okunamaması. Çevrimi durdurmaz, raporlanır."""

    source_id: str
    message: str


def clean_text(value: str) -> str:
    return _WHITESPACE_RE.sub(" ", _TAG_RE.sub(" ", value or "")).strip()


def canonicalize(url: str) -> str:
    """İzleme parametrelerini atar; adayların tekilleştirilebilmesi için."""
    if "?" not in url:
        return url.rstrip("/")
    base, _, query = url.partition("?")
    kept = [
        part
        for part in query.split("&")
        if part and not part.lower().startswith(_TRACKING_PREFIXES)
    ]
    base = base.rstrip("/")
    return f"{base}?{'&'.join(kept)}" if kept else base


def candidate_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _parse_published(entry) -> datetime | None:
    raw = getattr(entry, "published", None) or getattr(entry, "updated", None)
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw).astimezone(UTC)
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def fetch_feed(source: Source, *, client: httpx.Client) -> list[Candidate]:
    """Tek bir beslemeyi okur ve aday listesi üretir."""
    response = client.get(source.url)
    response.raise_for_status()

    parsed = feedparser.parse(response.content)
    entries = list(parsed.entries)
    if not entries and getattr(parsed, "bozo", False):
        raise RuntimeError(str(getattr(parsed, "bozo_exception", "besleme çözümlenemedi")))

    candidates: list[Candidate] = []
    for entry in entries[: source.max_items]:
        link = getattr(entry, "link", "") or ""
        if not link:
            continue
        url = canonicalize(link)
        candidates.append(
            Candidate(
                id=candidate_id(url),
                source_id=source.id,
                source_name=source.name,
                canonical_url=url,
                title=clean_text(getattr(entry, "title", "")),
                summary=clean_text(getattr(entry, "summary", "")),
                published_at=_parse_published(entry),
                category_hints=list(source.category_hints),
            )
        )
    return candidates


def collect(sources: list[Source]) -> tuple[list[Candidate], list[FeedError]]:
    """Verilen kaynakları paralel okur.

    Tek bir beslemenin düşmesi çevrimi durdurmaz; hata listesi raporlanır.
    Aynı URL birden çok beslemede görünürse ilk görülen kayıt tutulur.
    """
    collected: list[Candidate] = []
    errors: list[FeedError] = []

    headers = {"User-Agent": USER_AGENT}
    with httpx.Client(
        timeout=FEED_TIMEOUT_SECONDS, follow_redirects=True, headers=headers
    ) as client:
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_FEEDS) as pool:
            futures = {
                pool.submit(fetch_feed, source, client=client): source
                for source in sources
            }
            for future, source in futures.items():
                try:
                    collected.extend(future.result())
                except Exception as exc:
                    errors.append(
                        FeedError(source.id, f"{type(exc).__name__}: {exc}")
                    )

    seen: set[str] = set()
    unique: list[Candidate] = []
    for candidate in collected:
        if candidate.canonical_url in seen:
            continue
        seen.add(candidate.canonical_url)
        unique.append(candidate)

    return unique, errors
