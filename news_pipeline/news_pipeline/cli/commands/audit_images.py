from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import re
import struct
from pathlib import Path
from urllib.parse import urlparse

import httpx
import typer

HERO_IMAGE_RE = re.compile(r'^heroImage:\s*["\']?(.*?)["\']?\s*$', re.MULTILINE)
PUB_DATE_RE = re.compile(r'^pubDate:\s*["\']?(.*?)["\']?\s*$', re.MULTILINE)

APPROVED_IMAGE_HOSTS = {
    "images.unsplash.com",
    "images.pexels.com",
}
APPROVED_LOCAL_IMAGE_PREFIXES = ("/images/generated/anlik-haber/",)
LOCAL_GENERATED_HERO_MAX_BYTES = 400 * 1024
LOCAL_GENERATED_HERO_WIDTH = 1200
LOCAL_GENERATED_HERO_HEIGHT = 675

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
    target = (url or "").strip()
    if target.startswith(APPROVED_LOCAL_IMAGE_PREFIXES):
        return None
    parsed = urlparse(target)
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


def _published_timestamp(path: Path) -> float:
    """Sort recent duplicate checks by article pubDate, not checkout mtime.

    GitHub Actions checks out all files with fresh mtimes, so using filesystem
    mtime makes old stock-image reuse look like a recent duplicate. The audit is
    meant to catch recent publishing mistakes, therefore frontmatter pubDate is
    the stable clock.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return path.stat().st_mtime
    match = PUB_DATE_RE.search(text)
    if not match:
        return path.stat().st_mtime
    value = match.group(1).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return path.stat().st_mtime


def _webp_dimensions(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    offset = 12
    while offset + 8 <= len(data):
        chunk_type = data[offset : offset + 4]
        chunk_size = int.from_bytes(data[offset + 4 : offset + 8], "little")
        payload = offset + 8
        if chunk_type == b"VP8X" and payload + 10 <= len(data):
            width = 1 + int.from_bytes(data[payload + 4 : payload + 7], "little")
            height = 1 + int.from_bytes(data[payload + 7 : payload + 10], "little")
            return width, height
        if chunk_type == b"VP8 " and payload + 10 <= len(data):
            width = struct.unpack_from("<H", data, payload + 6)[0] & 0x3FFF
            height = struct.unpack_from("<H", data, payload + 8)[0] & 0x3FFF
            return width, height
        if chunk_type == b"VP8L" and payload + 5 <= len(data):
            bits = int.from_bytes(data[payload + 1 : payload + 5], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
            return width, height
        offset = payload + chunk_size + (chunk_size % 2)
    return None


def _local_image_type(path: Path) -> str | None:
    with path.open("rb") as handle:
        header = handle.read(16)
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "webp"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    return None


def _local_image_dimensions(path: Path) -> tuple[int, int] | None:
    image_type = _local_image_type(path)
    if image_type == "webp":
        return _webp_dimensions(path)
    if image_type == "png":
        with path.open("rb") as handle:
            header = handle.read(24)
        if len(header) >= 24 and header.startswith(b"\x89PNG\r\n\x1a\n"):
            return int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")
    if image_type == "jpeg":
        # Local generated heroes are expected to be WebP. JPEG support is not
        # needed for the current policy check, so avoid adding a dependency.
        return None
    return None


def _local_generated_image_issue(path: Path) -> str | None:
    if path.suffix.lower() != ".webp":
        return f"local-generated-not-webp:{path.suffix.lower() or '-'}"
    size = path.stat().st_size
    if size > LOCAL_GENERATED_HERO_MAX_BYTES:
        return f"local-generated-too-large:{size}"
    dimensions = _local_image_dimensions(path)
    if dimensions != (LOCAL_GENERATED_HERO_WIDTH, LOCAL_GENERATED_HERO_HEIGHT):
        return f"local-generated-wrong-dimensions:{dimensions or '-'}"
    return None


def _is_live_image_url(client: httpx.Client, url: str) -> tuple[bool, str]:

    target = (url or "").strip()
    if target.startswith(APPROVED_LOCAL_IMAGE_PREFIXES):
        local_path = Path.cwd() / "public" / target.lstrip("/")
        if not local_path.exists() or local_path.stat().st_size <= 1024:
            return False, "missing-local-file"
        local_issue = _local_generated_image_issue(local_path)
        if local_issue:
            return False, local_issue
        return True, "local-file"

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
        recent_items = sorted(items, key=lambda item: _published_timestamp(item[0]), reverse=True)[:recent_duplicate_limit]
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
