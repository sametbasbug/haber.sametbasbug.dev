"""Ortam değişkenleri.

Gizli değerler repoya girmez. `.env` dosyası `.gitignore` kapsamındadır ve
buradaki okuyucu yalnız değeri belleğe alır; hiçbir yere yazmaz, loglamaz.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_PATH = REPO_ROOT / ".env"

_loaded = False


def load_env(path: Path | None = None, *, force: bool = False) -> None:
    """`.env` dosyasını bir kez okur.

    Halihazırda tanımlı ortam değişkenlerinin üzerine yazmaz; dosya kaynak
    değil yedek kabul edilir.
    """
    global _loaded
    if _loaded and not force:
        return

    target = path or DEFAULT_ENV_PATH
    if target.is_file():
        for line in target.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, _, value = stripped.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

    _loaded = True


def get_env(name: str, default: str | None = None) -> str | None:
    load_env()
    value = os.environ.get(name, default)
    return value or None
