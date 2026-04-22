from __future__ import annotations

import html
import re


WHITESPACE_RE = re.compile(r"\s+")
HTML_TAG_RE = re.compile(r"<[^>]+>")


def clean_text(value: str) -> str:
    text = html.unescape(value or "")
    text = HTML_TAG_RE.sub(" ", text)
    return WHITESPACE_RE.sub(" ", text).strip()
