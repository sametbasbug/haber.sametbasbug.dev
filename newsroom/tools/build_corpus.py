"""Faz 1 test korpusunu üretir.

Yeni `screen` ve dil katmanlarının ağ ve sağlayıcı olmadan test edilebilmesi için
mevcut yayın arşivinden ve toplama geçmişinden sabit bir korpus çıkarır.

Kaynaklar:
  src/content/equinoxHaber/*.md      yayımlanmış haberler (kesin pozitif)
  news_pipeline/data/normalized/*    toplanmış aday havuzu (etiketsiz)

Çıktı:
  newsroom/tests/corpus/published.jsonl
  newsroom/tests/corpus/candidates.jsonl
  newsroom/tests/corpus/manifest.json

Çalıştırma (repo kökünden):
  news_pipeline/.venv/bin/python newsroom/tools/build_corpus.py

Not: `news_pipeline/data/` git dışıdır ve taşınabilir diskte durur. Bu betiğin
çıktısı repoya girer; korpus üretildikten sonra kaynak veriye bağımlılık kalmaz.
"""

from __future__ import annotations

import json
from pathlib import Path
import random
import re

import yaml

ROOT = Path(__file__).resolve().parents[2]
POSTS_DIR = ROOT / "src" / "content" / "equinoxHaber"
NORMALIZED_DIR = ROOT / "news_pipeline" / "data" / "normalized"
OUT_DIR = ROOT / "newsroom" / "tests" / "corpus"

CANDIDATE_SAMPLE_SIZE = 1500
SUMMARY_MAX_CHARS = 400
SAMPLE_SEED = 20260801

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.DOTALL)
SOURCES_HEADING_RE = re.compile(r"\n##\s*Kaynaklar\s*\n.*\Z", re.DOTALL)


def strip_query(url: str) -> str:
    return url.split("?", 1)[0].rstrip("/")


def read_post(path: Path) -> dict | None:
    match = FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
    if not match:
        return None
    try:
        front = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        return None

    # Kaynaklar bölümü şablon çıktısıdır; gövde metriklerine dahil edilmez.
    body = SOURCES_HEADING_RE.sub("", match.group(2)).strip()
    paragraphs = [p for p in re.split(r"\n\s*\n", body) if p.strip()]

    return {
        "slug": path.stem,
        "title": front.get("title", ""),
        "description": front.get("description", ""),
        "category": front.get("category"),
        "tags": front.get("tags") or [],
        "pub_date": str(front.get("pubDate", "")),
        "hero_alt": front.get("heroAlt", ""),
        "hero_image": front.get("heroImage", ""),
        "body": body,
        "body_len": len(body),
        "paragraph_count": len(paragraphs),
        "sources": front.get("sources") or [],
    }


def load_normalized_index() -> dict[str, dict]:
    index: dict[str, dict] = {}
    for path in NORMALIZED_DIR.glob("*.json"):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        url = record.get("canonical_url")
        if url:
            index[strip_query(url)] = record
    return index


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    normalized = load_normalized_index()

    published: list[dict] = []
    matched_urls: set[str] = set()
    unmatched: list[str] = []

    for path in sorted(POSTS_DIR.glob("*.md")):
        post = read_post(path)
        if post is None:
            unmatched.append(f"{path.name}: frontmatter okunamadı")
            continue

        origin = None
        for source in post["sources"]:
            key = strip_query(str(source.get("url", "")))
            if key in normalized:
                record = normalized[key]
                matched_urls.add(key)
                origin = {
                    "source_id": record.get("source_id"),
                    "source_name": record.get("source_name"),
                    "canonical_url": record.get("canonical_url"),
                    "orig_title": record.get("title", ""),
                    "orig_summary": record.get("summary", ""),
                    "published_at": record.get("published_at"),
                    "category_hints": record.get("category_hints") or [],
                }
                break

        post["origin"] = origin
        if origin is None:
            unmatched.append(f"{post['slug']}: kaynak kaydı bulunamadı")
        published.append(post)

    pool = [
        record
        for url, record in sorted(normalized.items())
        if url not in matched_urls
    ]
    random.Random(SAMPLE_SEED).shuffle(pool)
    candidates = [
        {
            "id": record.get("id"),
            "source_id": record.get("source_id"),
            "source_name": record.get("source_name"),
            "canonical_url": record.get("canonical_url"),
            "title": record.get("title", ""),
            "summary": (record.get("summary") or "")[:SUMMARY_MAX_CHARS],
            "published_at": record.get("published_at"),
            "category_hints": record.get("category_hints") or [],
        }
        for record in pool[:CANDIDATE_SAMPLE_SIZE]
    ]

    write_jsonl(OUT_DIR / "published.jsonl", published)
    write_jsonl(OUT_DIR / "candidates.jsonl", candidates)

    manifest = {
        "seed": SAMPLE_SEED,
        "published_count": len(published),
        "published_with_origin": sum(1 for p in published if p["origin"]),
        "candidate_pool_size": len(pool),
        "candidate_sample_size": len(candidates),
        "normalized_indexed": len(normalized),
        "unmatched": unmatched,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps({k: v for k, v in manifest.items() if k != "unmatched"}, indent=2))
    print(f"unmatched: {len(unmatched)}")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
