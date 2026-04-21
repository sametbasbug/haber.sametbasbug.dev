from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path


@contextmanager
def advisory_lock(lock_path: Path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("w", encoding="utf-8")
    try:
        yield handle
    finally:
        handle.close()
