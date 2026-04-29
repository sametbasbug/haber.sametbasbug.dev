from __future__ import annotations

import re
from pathlib import Path

import typer

ARTICLE_DIR = Path("src/content/anlikHaber")
INTERNAL_NOTE_RE = re.compile(
    r"(?im)^(##\s*Editoryal not\b|\s*-\s*(?:manual-review|source-profile|autopublish-withdrawn|manual-publish):)"
)
ENGLISH_TITLE_RE = re.compile(
    r"\b(the|and|with|from|for|to|into|uses|use|make|makes|will|now|new|after|before|over|under|about|your|you|its|it's|is|are|was|were|get|gets|can|could|should|would)\b",
    re.IGNORECASE,
)
TURKISH_SIGNAL_RE = re.compile(
    r"[çğıöşüÇĞİÖŞÜ]|\b(ve|ile|için|daha|yeni|sonra|önce|karşı|göre|olarak|yapay|zeka|açıkladı|duyurdu|hazırlıyor|başladı|sundu|getirdi|istedi|verdi|oldu|ediyor)\b",
    re.IGNORECASE,
)


def _frontmatter_value(frontmatter: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}:\s*(.*)$", frontmatter)
    if not match:
        return ""
    value = match.group(1).strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        value = value[1:-1]
    return value.strip()


def _frontmatter(text: str) -> str:
    match = re.match(r"^---\n(.*?)\n---", text, re.S)
    return match.group(1) if match else ""


def _looks_like_untranslated_title(title: str) -> bool:
    # Product/source names may stay English; the failure mode we want to catch is
    # an entire source headline being copied into title/description unchanged.
    return bool(ENGLISH_TITLE_RE.search(title)) and not TURKISH_SIGNAL_RE.search(title)


def audit_content_command(
    content_dir: Path = typer.Option(ARTICLE_DIR, "--content-dir", help="Article directory to audit."),
) -> None:
    """Audit published Anlık Haber markdown for reader-facing editorial leaks."""
    failures: list[str] = []
    for path in sorted(content_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        frontmatter = _frontmatter(text)
        title = _frontmatter_value(frontmatter, "title")
        description = _frontmatter_value(frontmatter, "description")

        if INTERNAL_NOTE_RE.search(text):
            failures.append(f"{path}: internal editorial note leaked into article body")
        if title and _looks_like_untranslated_title(title):
            failures.append(f"{path}: title appears untranslated: {title}")
        if description and _looks_like_untranslated_title(description):
            failures.append(f"{path}: description appears untranslated: {description}")

    if failures:
        for failure in failures:
            typer.echo(f"ERROR: {failure}")
        raise typer.Exit(code=1)

    typer.echo("content audit passed")
