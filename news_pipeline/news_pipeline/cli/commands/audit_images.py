from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
import typer

HERO_IMAGE_RE = re.compile(r'^heroImage:\s*["\']?(.*?)["\']?\s*$', re.MULTILINE)


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


def audit_images_command(content_dir: str = "src/content/anlikHaber", timeout: float = 12.0) -> None:
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
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for path, url in items:
            ok, reason = _is_live_image_url(client, url)
            if not ok:
                bad.append((path, url, reason))

    print(f"checked={len(items)}")
    print(f"broken={len(bad)}")
    for path, url, reason in bad:
        print(f"BROKEN {path.relative_to(root)} | {reason} | {url}")

    if bad:
        raise typer.Exit(code=1)
