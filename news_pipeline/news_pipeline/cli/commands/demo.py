from __future__ import annotations

import json
import shutil
from pathlib import Path

import typer

DEMO_FIXTURE_ROOT = Path(__file__).resolve().parents[2] / "demo" / "synthetic"
RUNTIME_ROOT = Path("news_pipeline/data")


def _copy_tree(src: Path, dest: Path) -> int:
    count = 0
    dest.mkdir(parents=True, exist_ok=True)
    for path in sorted(src.glob("*.json")):
        shutil.copy2(path, dest / path.name)
        count += 1
    return count


def demo_seed_command(force: bool = typer.Option(False, "--force", help="Replace existing runtime raw/normalized/queue demo files.")) -> None:
    """Seed a tiny synthetic local dataset for provider-free walkthroughs."""
    if not DEMO_FIXTURE_ROOT.exists():
        raise typer.BadParameter(f"demo fixture root not found: {DEMO_FIXTURE_ROOT}")

    targets = {
        "raw": RUNTIME_ROOT / "raw",
        "normalized": RUNTIME_ROOT / "normalized",
        "queue": RUNTIME_ROOT / "queue",
    }
    for name, dest in targets.items():
        existing = list(dest.glob("demo-*.json")) if dest.exists() else []
        if existing and not force:
            raise typer.BadParameter(f"demo {name} data already exists; rerun with --force")
        if force:
            for path in existing:
                path.unlink(missing_ok=True)

    counts = {name: _copy_tree(DEMO_FIXTURE_ROOT / name, dest) for name, dest in targets.items()}
    typer.echo(json.dumps({"ok": True, "seeded": counts}, ensure_ascii=False))


def demo_walkthrough_command() -> None:
    """Print the local provider-free walkthrough commands."""
    typer.echo(
        "\n".join(
            [
                "Provider-free Equinox Haber demo walkthrough:",
                "",
                "  news-pipeline demo seed --force",
                "  news-pipeline queue summary",
                "  news-pipeline queue review",
                "  news-pipeline heartbeat prepare-one --no-collect --no-process --no-cleanup --json",
                "  news-pipeline heartbeat publish-one --no-collect --json",
                "",
                "The synthetic data is deliberately tiny and safe:",
                "- one Asteria-polished publishable item",
                "- one manual-review item",
                "- one stale item for source-age gate checks",
                "",
                "The walkthrough uses dry-run publish-one by default, so it does not write articles, commit, push, or call providers.",
                "Do not use seed on production runtime data unless you are intentionally adding demo fixtures.",
            ]
        )
    )
