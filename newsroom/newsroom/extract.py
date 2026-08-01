"""Haber metni çıkarımı.

Yalnız elemeyi geçmiş ve brief'e aday olan haberler için çağrılır.

Bu katman aynı zamanda paywall tespitidir: eski sistemdeki
`UNREADABLE_PRIMARY_HOSTS` gibi elle tutulan host listesine gerek yok — okunamayan
sayfa zaten yeterli metin vermez ve aday mekanik olarak düşer. Kaynak ekleyip
çıkarmak bir liste bakımı gerektirmemelidir.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
import json
import re

from bs4 import BeautifulSoup
import httpx
from readability import Document

from newsroom.ingest import USER_AGENT, clean_text

PAGE_TIMEOUT_SECONDS = 15.0

# Brief'e girebilmek için gereken en az metin. Bunun altındaki sayfa ya
# paywall'lu, ya kırık, ya da haber değil.
MIN_ARTICLE_TEXT = 500

# Tam metin üst sınırı. Brief'in bağlamını şişirmemek için; haberin özü ilk
# bölümdedir ve Asteria'ya gönderilen her karakterin maliyeti var.
MAX_ARTICLE_TEXT = 6000

MIN_PARAGRAPH_LENGTH = 40

_BOILERPLATE_RE = re.compile(
    r"privacy policy|cookie policy|subscribe to continue|sign up for our newsletter|"
    r"advertisement|share this article|follow us on",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class Extraction:
    """Bir haber sayfasından çıkarılan metin."""

    text: str = ""
    published_at: datetime | None = None
    failure: str | None = None
    transient: bool = False

    @property
    def ok(self) -> bool:
        return self.failure is None and len(self.text) >= MIN_ARTICLE_TEXT


def _is_transient(exc: Exception) -> bool:
    """Hatanın yeniden denemeye değer olup olmadığını söyler.

    Paywall ve bot engeli (401/403) kalıcıdır: aday elenir ve bir daha
    denenmez. Zaman aşımı ve sunucu hatası geçicidir; iyi bir aday geçici bir
    ağ sorunu yüzünden sessizce kaybedilmemeli.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500 or exc.response.status_code == 429
    return isinstance(exc, (httpx.TimeoutException, httpx.NetworkError))


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    for parser in (parsedate_to_datetime, lambda v: datetime.fromisoformat(v.replace("Z", "+00:00"))):
        try:
            parsed = parser(text)
        except (TypeError, ValueError):
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    return None


def _jsonld_date(payload) -> datetime | None:
    if isinstance(payload, list):
        for item in payload:
            if found := _jsonld_date(item):
                return found
        return None
    if not isinstance(payload, dict):
        return None
    for key in ("datePublished", "dateCreated"):
        if found := _parse_datetime(payload.get(key)):
            return found
    if graph := payload.get("@graph"):
        return _jsonld_date(graph)
    return None


def published_at_from_page(soup: BeautifulSoup) -> datetime | None:
    """Sayfadan yayın tarihini okur.

    Besleme tarihleri güvenilmez olabiliyor; sayfa tarihi ileri tarih kapısı
    için ikinci bir kaynaktır.
    """
    selectors = (
        ('meta[property="article:published_time"]', "content"),
        ('meta[name="article:published_time"]', "content"),
        ('meta[itemprop="datePublished"]', "content"),
        ('meta[name="pubdate"]', "content"),
        ("time[datetime]", "datetime"),
    )
    for selector, attribute in selectors:
        node = soup.select_one(selector)
        if node and (found := _parse_datetime(node.get(attribute))):
            return found

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            payload = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        if found := _jsonld_date(payload):
            return found
    return None


def article_text(html: str) -> str:
    """Sayfa gövdesinden okunabilir haber metnini ayırır."""
    soup = BeautifulSoup(Document(html).summary(html_partial=True), "html.parser")

    paragraphs: list[str] = []
    seen: set[str] = set()
    for node in soup.find_all("p"):
        text = clean_text(node.get_text(" ", strip=True))
        if len(text) < MIN_PARAGRAPH_LENGTH or _BOILERPLATE_RE.search(text):
            continue
        if text in seen:
            continue
        seen.add(text)
        paragraphs.append(text)

    return "\n\n".join(paragraphs)[:MAX_ARTICLE_TEXT].strip()


def extract(url: str, *, client: httpx.Client | None = None) -> Extraction:
    """Haber sayfasını çeker ve metnini çıkarır.

    Başarısızlık istisna fırlatmaz; `Extraction.failure` ile raporlanır ve
    aday sessizce elenir.
    """
    owned = client is None
    session = client or httpx.Client(
        timeout=PAGE_TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )
    try:
        response = session.get(url)
        response.raise_for_status()
    except Exception as exc:
        return Extraction(
            failure=f"{type(exc).__name__}: {exc}", transient=_is_transient(exc)
        )
    finally:
        if owned:
            session.close()

    try:
        text = article_text(response.text)
        page_date = published_at_from_page(BeautifulSoup(response.text, "html.parser"))
    except Exception as exc:
        return Extraction(failure=f"çıkarım hatası: {type(exc).__name__}: {exc}")

    if len(text) < MIN_ARTICLE_TEXT:
        return Extraction(
            text=text,
            published_at=page_date,
            failure=f"metin yetersiz ({len(text)} < {MIN_ARTICLE_TEXT} karakter)",
        )

    return Extraction(text=text, published_at=page_date)
