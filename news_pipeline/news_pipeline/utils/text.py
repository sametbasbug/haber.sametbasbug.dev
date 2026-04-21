from __future__ import annotations

import re


WHITESPACE_RE = re.compile(r"\s+")


def clean_text(value: str) -> str:
    return WHITESPACE_RE.sub(" ", value).strip()
