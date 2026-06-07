from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
import json
import re
from typing import Any

import httpx
from bs4 import BeautifulSoup
from readability import Document

from news_pipeline.utils.text import clean_text

PARAGRAPH_SPLIT_RE = re.compile(r"\n{2,}")
BOILERPLATE_PATTERNS = [
    re.compile(pattern, re.I)
    for pattern in [
        r"işbu aydınlatma metni",
        r"veri sorumlusu",
        r"kişisel verilerin korun",
        r"kvkk",
        r"e-?bülten aboneliği",
        r"ticari elektronik ileti",
        r"gizlilik sözleşmesi",
        r"privacy policy",
    ]
]


@dataclass(frozen=True)
class ArticleDetails:
    snippet: str = ""
    published_at: datetime | None = None


def _looks_like_boilerplate(text: str) -> bool:
    lowered = clean_text(text).lower()
    return any(pattern.search(lowered) for pattern in BOILERPLATE_PATTERNS)


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    try:
        parsed = parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except Exception:
        pass
    try:
        normalized = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except Exception:
        return None


def _first_jsonld_date(payload: Any) -> datetime | None:
    if isinstance(payload, list):
        for item in payload:
            found = _first_jsonld_date(item)
            if found:
                return found
        return None
    if not isinstance(payload, dict):
        return None
    for key in ("datePublished", "dateCreated", "uploadDate"):
        found = _parse_datetime(payload.get(key))
        if found:
            return found
    graph = payload.get("@graph")
    if graph is not None:
        found = _first_jsonld_date(graph)
        if found:
            return found
    for value in payload.values():
        if isinstance(value, (dict, list)):
            found = _first_jsonld_date(value)
            if found:
                return found
    return None


def _extract_published_at(soup: BeautifulSoup) -> datetime | None:
    selectors = [
        ('meta[property="article:published_time"]', "content"),
        ('meta[name="article:published_time"]', "content"),
        ('meta[name="parsely-pub-date"]', "content"),
        ('meta[name="pubdate"]', "content"),
        ('meta[name="publish-date"]', "content"),
        ('meta[name="date"]', "content"),
        ('meta[itemprop="datePublished"]', "content"),
        ('time[itemprop="datePublished"]', "datetime"),
        ("time[datetime]", "datetime"),
    ]
    for selector, attr in selectors:
        node = soup.select_one(selector)
        if not node:
            continue
        found = _parse_datetime(node.get(attr))
        if found:
            return found
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            payload = json.loads(script.string or script.get_text("", strip=True) or "")
        except Exception:
            continue
        found = _first_jsonld_date(payload)
        if found:
            return found
    return None


def fetch_article_details(url: str, max_paragraphs: int = 3, max_chars: int = 900) -> ArticleDetails:
    try:
        with httpx.Client(timeout=12.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
            response = client.get(url)
            response.raise_for_status()
        page_soup = BeautifulSoup(response.text, "html.parser")
        published_at = _extract_published_at(page_soup)
        doc = Document(response.text)
        summary_html = doc.summary(html_partial=True)
        soup = BeautifulSoup(summary_html, "html.parser")
        paragraphs: list[str] = []
        for node in soup.find_all(["p", "li"]):
            text = clean_text(node.get_text(" ", strip=True))
            if len(text) < 40:
                continue
            if _looks_like_boilerplate(text):
                continue
            if text in paragraphs:
                continue
            paragraphs.append(text)
            if len(paragraphs) >= max_paragraphs:
                break
        if not paragraphs:
            raw_text = clean_text(soup.get_text("\n", strip=True))
            chunks = [clean_text(part) for part in PARAGRAPH_SPLIT_RE.split(raw_text) if clean_text(part)]
            paragraphs = [chunk for chunk in chunks if len(chunk) >= 40 and not _looks_like_boilerplate(chunk)][:max_paragraphs]
        snippet = " ".join(paragraphs)
        return ArticleDetails(snippet=snippet[:max_chars].strip(), published_at=published_at)
    except Exception:
        return ArticleDetails()


def fetch_article_snippet(url: str, max_paragraphs: int = 3, max_chars: int = 900) -> str:
    try:
        return fetch_article_details(url, max_paragraphs=max_paragraphs, max_chars=max_chars).snippet
    except Exception:
        return ""
