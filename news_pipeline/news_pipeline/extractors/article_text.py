from __future__ import annotations

import re

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


def _looks_like_boilerplate(text: str) -> bool:
    lowered = clean_text(text).lower()
    return any(pattern.search(lowered) for pattern in BOILERPLATE_PATTERNS)


def fetch_article_snippet(url: str, max_paragraphs: int = 3, max_chars: int = 900) -> str:
    try:
        with httpx.Client(timeout=12.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
            response = client.get(url)
            response.raise_for_status()
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
        return snippet[:max_chars].strip()
    except Exception:
        return ""
