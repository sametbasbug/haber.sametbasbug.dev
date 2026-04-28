from __future__ import annotations

from collections import defaultdict
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
import typer

HERO_IMAGE_RE = re.compile(r'^heroImage:\s*["\']?(.*?)["\']?\s*$', re.MULTILINE)

APPROVED_IMAGE_HOSTS = {
    "images.unsplash.com",
    "images.pexels.com",
}

# News/source CDNs are intentionally blocked for Anlık Haber hero images.
# A live image URL is not enough: using the original publisher's RSS/OG/article
# image creates licensing and editorial reuse risk.
BLOCKED_SOURCE_IMAGE_HOSTS = {
    "techcrunch.com",
    "www.techcrunch.com",
    "s.yimg.com",
    "o.aolcdn.com",
    "i.guim.co.uk",
    "media.guim.co.uk",
    "www.politico.eu",
    "politico.eu",
    "images.mktw.net",
    "www.marketwatch.com",
    "marketwatch.com",
    "platform.theverge.com",
    "cdn.arstechnica.net",
    "images.fastcompany.com",
    "www.aljazeera.com",
    "aljazeera.com",
    "www.diken.com.tr",
    "diken.com.tr",
    "ichef.bbci.co.uk",
    "www.bbc.co.uk",
    "bbc.co.uk",
    "medyascope.tv",
    "www.medyascope.tv",
    "kisadalga.net",
    "www.kisadalga.net",
    "www.cnbc.com",
    "image.cnbcfm.com",
    "static01.nyt.com",
    "static.reuters.com",
    "cloudfront-us-east-2.images.arcpublishing.com",
}


def _image_policy_violation(url: str) -> str | None:
    parsed = urlparse((url or "").strip())
    host = parsed.netloc.lower()
    if host in APPROVED_IMAGE_HOSTS:
        return None
    if host in BLOCKED_SOURCE_IMAGE_HOSTS:
        return f"source-image-host:{host}"
    return f"unapproved-image-host:{host or '-'}"


def _image_key(value: str) -> str:
    text = str(value or "").strip()
    pexels_match = re.search(r"/photos/(\d+)/", text)
    if pexels_match:
        return f"pexels:{pexels_match.group(1)}"
    return text


def _is_live_image_url(client: httpx.Client, url: str) -> tuple[bool, str]:
    target = (url or "").strip()
    parsed = urlparse(target)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False, "invalid-url"

    last_reason = "no-response"
    for method in ("HEAD", "GET"):
        try:
            response = client.request(method, target, headers={"Range": "bytes=0-0"} if method == "GET" else None)
        except Exception as exc:  # pragma: no cover - network diagnostics only
            last_reason = f"{method.lower()}-error:{type(exc).__name__}"
            continue
        content_type = (response.headers.get("content-type") or "").lower()
        if response.status_code >= 400:
            last_reason = f"{response.status_code}:{content_type or '-'}"
            continue
        if content_type.startswith("image/"):
            return True, f"{response.status_code}:{content_type}"
        last_reason = f"not-image:{response.status_code}:{content_type or '-'}"

    return False, last_reason


def audit_images_command(
    content_dir: str = "src/content/anlikHaber",
    timeout: float = 12.0,
    recent_duplicate_limit: int = 10,
) -> None:
    root = Path.cwd()
    target_dir = root / content_dir
    if not target_dir.exists():
        raise typer.BadParameter(f"content directory not found: {target_dir}")

    items: list[tuple[Path, str]] = []
    for path in sorted(target_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        match = HERO_IMAGE_RE.search(text)
        if match and match.group(1).strip():
            items.append((path, match.group(1).strip()))

    bad: list[tuple[Path, str, str]] = []
    policy_violations: list[tuple[Path, str, str]] = []
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for path, url in items:
            policy_reason = _image_policy_violation(url)
            if policy_reason:
                policy_violations.append((path, url, policy_reason))
            ok, reason = _is_live_image_url(client, url)
            if not ok:
                bad.append((path, url, reason))

    recent_duplicates: list[tuple[str, list[Path]]] = []
    if recent_duplicate_limit > 1:
        recent_items = sorted(items, key=lambda item: item[0].stat().st_mtime, reverse=True)[:recent_duplicate_limit]
        grouped: dict[str, list[Path]] = defaultdict(list)
        for path, url in recent_items:
            grouped[_image_key(url)].append(path)
        recent_duplicates = [(key, paths) for key, paths in grouped.items() if len(paths) > 1]

    print(f"checked={len(items)}")
    print(f"broken={len(bad)}")
    print(f"policy_violations={len(policy_violations)}")
    print(f"recent_duplicate_limit={recent_duplicate_limit}")
    print(f"recent_duplicates={len(recent_duplicates)}")
    for path, url, reason in bad:
        print(f"BROKEN {path.relative_to(root)} | {reason} | {url}")
    for path, url, reason in policy_violations:
        print(f"POLICY_VIOLATION {path.relative_to(root)} | {reason} | {url}")
    for key, paths in recent_duplicates:
        joined = ", ".join(str(path.relative_to(root)) for path in paths)
        print(f"DUPLICATE_RECENT {key} | {joined}")

    if bad or policy_violations or recent_duplicates:
        raise typer.Exit(code=1)
