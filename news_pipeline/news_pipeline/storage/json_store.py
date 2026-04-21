from __future__ import annotations

import json
from pathlib import Path
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class JsonStore(Generic[T]):
    def __init__(self, root: Path, model_cls: type[T]) -> None:
        self.root = root
        self.model_cls = model_cls
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, key: str) -> Path:
        return self.root / f"{key}.json"

    def save(self, key: str, item: T) -> Path:
        path = self.path_for(key)
        path.write_text(item.model_dump_json(indent=2), encoding="utf-8")
        return path

    def load(self, key: str) -> T | None:
        path = self.path_for(key)
        if not path.exists():
            return None
        return self.model_cls.model_validate(json.loads(path.read_text(encoding="utf-8")))

    def list_all(self) -> list[T]:
        items: list[T] = []
        for path in sorted(self.root.glob("*.json")):
            items.append(self.model_cls.model_validate(json.loads(path.read_text(encoding="utf-8"))))
        return items
