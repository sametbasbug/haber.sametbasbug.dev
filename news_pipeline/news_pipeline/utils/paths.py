from __future__ import annotations

from pathlib import Path


def project_root() -> Path:
    return Path.cwd()


def pipeline_root() -> Path:
    return project_root() / "news_pipeline"


def data_root() -> Path:
    return pipeline_root() / "data"
