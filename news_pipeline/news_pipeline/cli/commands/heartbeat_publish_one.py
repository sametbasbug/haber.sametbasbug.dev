from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from datetime import UTC, datetime
import io
import json
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

import typer

from news_pipeline.cli.commands.audit_content import audit_content_command
from news_pipeline.cli.commands.audit_images import audit_images_command
from news_pipeline.cli.commands.publish import publish_queue_item
from news_pipeline.editorial.autonomy import is_autopublish_candidate
from news_pipeline.models.article import NormalizedArticle
from news_pipeline.models.queue import QueueItem
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


DEFAULT_MIN_SCORE = 0.68
ASTERIA_POLISHED_MIN_SCORE = 0.68
DEFAULT_MAX_SOURCE_AGE_HOURS = 24
DEFAULT_MIN_INTERVAL_SECONDS = 900
STATE_PATH = Path("news_pipeline/data/state/heartbeat-publish-one.json")
MAX_STEP_LOG_CHARS = 900


def _compact_text(value: str, max_chars: int = MAX_STEP_LOG_CHARS) -> str:
    text = (value or "").strip()
    if len(text) <= max_chars:
        return text
    head = text[: max_chars // 2].rstrip()
    tail = text[-max_chars // 2 :].lstrip()
    return f"{head}\n…[truncated {len(text) - len(head) - len(tail)} chars]…\n{tail}"


def _compact_step(step: dict[str, Any], *, full_logs: bool = False) -> dict[str, Any]:
    if full_logs:
        return step
    compact = dict(step)
    stdout = str(compact.get("stdout") or "")
    stderr = str(compact.get("stderr") or "")
    if stdout or stderr:
        compact["logChars"] = {"stdout": len(stdout), "stderr": len(stderr)}
    if stdout:
        compact["stdout"] = _compact_text(stdout)
    if stderr:
        compact["stderr"] = _compact_text(stderr)
    return compact


def _run_step(name: str, func, *args, **kwargs) -> dict[str, Any]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    started = datetime.now(UTC)
    try:
        with redirect_stdout(stdout), redirect_stderr(stderr):
            func(*args, **kwargs)
    except typer.Exit as exc:
        code = int(exc.exit_code or 0)
        if code != 0:
            return {
                "name": name,
                "ok": False,
                "code": code,
                "stdout": stdout.getvalue().strip(),
                "stderr": stderr.getvalue().strip(),
                "durationMs": int((datetime.now(UTC) - started).total_seconds() * 1000),
            }
    except Exception as exc:  # pragma: no cover - command diagnostics
        return {
            "name": name,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
            "stdout": stdout.getvalue().strip(),
            "stderr": stderr.getvalue().strip(),
            "durationMs": int((datetime.now(UTC) - started).total_seconds() * 1000),
        }
    return {
        "name": name,
        "ok": True,
        "stdout": stdout.getvalue().strip(),
        "stderr": stderr.getvalue().strip(),
        "durationMs": int((datetime.now(UTC) - started).total_seconds() * 1000),
    }


def _run_shell(name: str, command: list[str], *, timeout: int = 180) -> dict[str, Any]:
    started = datetime.now(UTC)
    try:
        result = subprocess.run(command, text=True, capture_output=True, timeout=timeout, check=False)
    except Exception as exc:  # pragma: no cover - command diagnostics
        return {
            "name": name,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
            "durationMs": int((datetime.now(UTC) - started).total_seconds() * 1000),
        }
    return {
        "name": name,
        "ok": result.returncode == 0,
        "code": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "durationMs": int((datetime.now(UTC) - started).total_seconds() * 1000),
    }


def _run_pipeline_command(name: str, args: list[str], *, timeout: int = 360) -> dict[str, Any]:
    """Run pipeline subcommands out-of-process so one hung feed cannot freeze the orchestrator forever."""
    return _run_shell(name, [sys.argv[0], *args], timeout=timeout)


def _source_is_fresh(root: Path, item: QueueItem, max_source_age_hours: int) -> tuple[bool, str | None]:
    if max_source_age_hours <= 0:
        return True, None
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    normalized = normalized_store.load(item.normalized_id)
    if normalized is None:
        return False, "missing normalized article"
    source_time = (normalized.published_at or normalized.created_at).astimezone(UTC)
    age_hours = (datetime.now(UTC) - source_time).total_seconds() / 3600
    if age_hours > max_source_age_hours:
        return False, f"source too old ({age_hours:.1f}h > {max_source_age_hours}h)"
    return True, None


def _candidate_snapshot(item: QueueItem, reason: str | None = None) -> dict[str, Any]:
    return {
        "queueId": item.queue_id,
        "status": item.status,
        "score": round(float(item.editorial_priority), 3),
        "category": item.draft_category,
        "title": item.draft_title,
        "reason": reason,
        "sources": [{"name": source.name, "url": str(source.url)} for source in item.draft_sources[:3]],
    }


def _is_excluded_source_format(item: QueueItem) -> bool:
    text = f"{item.draft_title} {item.draft_description}".lower()
    urls = " ".join(str(source.url).lower() for source in item.draft_sources)
    return (
        "podcast" in urls
        or "/live/" in urls
        or "/tv-shows/" in urls
        or "/video/" in urls
        or "/videos/" in urls
        or " tv show" in text
        or " live" in text
        or "live:" in text
    )


def _has_asteria_polish(item: QueueItem) -> bool:
    return any(note == "asteria-editorial-polish" or note.startswith("asteria-editorial-polish") for note in item.notes)


def _candidate_sort_key(item: QueueItem) -> tuple[int, float]:
    # Asteria-polished candidates are intentional editorial selections and must be
    # checked before raw high-score queue items only when they still clear the
    # publish-quality score floor. Otherwise a polished but low-importance item can
    # jump ahead of stronger global-news candidates just because it was easier to
    # write.
    polish_rank = 1 if _has_asteria_polish(item) and float(item.editorial_priority) >= ASTERIA_POLISHED_MIN_SCORE else 0
    return (polish_rank, float(item.editorial_priority))


def _select_candidate(root: Path, min_score: float, max_source_age_hours: int, limit_rejections: int = 8) -> tuple[QueueItem | None, list[dict[str, Any]]]:
    service = QueueService(root / "news_pipeline/data/queue")
    items = sorted(service.list_items(), key=_candidate_sort_key, reverse=True)
    rejections: list[dict[str, Any]] = []
    for item in items:
        if item.status not in {"new", "approved"}:
            continue
        if _is_excluded_source_format(item):
            if len(rejections) < limit_rejections:
                rejections.append(_candidate_snapshot(item, "excluded source format (podcast/liveblog)"))
            continue
        fresh, stale_reason = _source_is_fresh(root, item, max_source_age_hours)
        if not fresh:
            if len(rejections) < limit_rejections:
                rejections.append(_candidate_snapshot(item, stale_reason))
            continue
        effective_min_score = min(min_score, ASTERIA_POLISHED_MIN_SCORE) if _has_asteria_polish(item) else min_score
        ok, reason = is_autopublish_candidate(item, min_score=effective_min_score)
        if ok:
            return item, rejections
        if len(rejections) < limit_rejections:
            rejections.append(_candidate_snapshot(item, reason or "not publishable"))
    return None, rejections


def _git_has_changes() -> bool:
    result = subprocess.run(["git", "status", "--porcelain"], text=True, capture_output=True, check=False)
    return bool(result.stdout.strip())


def _read_state(root: Path) -> dict[str, Any]:
    path = root / STATE_PATH
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_state(root: Path, state: dict[str, Any]) -> None:
    path = root / STATE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _recent_cycle_guard(root: Path, min_interval_seconds: int, force: bool) -> tuple[bool, dict[str, Any]]:
    if force or min_interval_seconds <= 0:
        return True, {"forced": force, "minIntervalSeconds": min_interval_seconds}
    state = _read_state(root)
    now = int(time.time())
    last = int(state.get("last_started_at") or state.get("last_completed_at") or 0)
    age = now - last if last else None
    info = {"lastStartedAt": last or None, "ageSeconds": age, "minIntervalSeconds": min_interval_seconds}
    if last and age is not None and age < min_interval_seconds:
        return False, info
    state["last_started_at"] = now
    _write_state(root, state)
    return True, info


def _mark_cycle_completed(root: Path, result: str) -> None:
    state = _read_state(root)
    state["last_completed_at"] = int(time.time())
    state["last_result"] = result
    _write_state(root, state)


def _is_duplicate_publish_error(step: dict[str, Any]) -> bool:
    text = " ".join(str(step.get(key) or "") for key in ("error", "stdout", "stderr")).lower()
    return "duplicate live" in text or "near-duplicate live" in text


def _reject_duplicate_publish_candidate(service: QueueService, queue_id: str, step: dict[str, Any]) -> dict[str, Any] | None:
    error = _compact_text(str(step.get("error") or step.get("stderr") or step.get("stdout") or "publish duplicate gate"), max_chars=500)
    note = f"duplicate-publish-gate: {error}"
    item = service.reject(queue_id, note=note)
    if item is None:
        return None
    return {
        "queueId": item.queue_id,
        "status": item.status,
        "reason": note,
    }


def _git_commit_and_push(message: str, *, push: bool) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    if not _git_has_changes():
        steps.append({"name": "git", "ok": True, "stdout": "no changes"})
        return steps
    steps.append(_run_shell("git-add", ["git", "add", "news_pipeline", "src/content/equinoxHaber", "public/images/generated/equinox-haber"], timeout=60))
    if not steps[-1]["ok"]:
        return steps
    lock_path = Path("src/content/equinoxHaber/.hero-image.lock")
    if lock_path.exists():
        lock_path.unlink(missing_ok=True)
    subprocess.run(["git", "rm", "--cached", "--ignore-unmatch", str(lock_path)], text=True, capture_output=True, check=False)
    steps.append(_run_shell("git-commit", ["git", "commit", "-m", message], timeout=120))
    if not steps[-1]["ok"]:
        return steps
    if push:
        steps.append(_run_shell("git-push", ["git", "push"], timeout=240))
    return steps


def _emit(payload: dict[str, Any], json_output: bool) -> None:
    if json_output:
        typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    typer.echo(f"result={payload.get('result')}")
    if payload.get("published"):
        pub = payload["published"]
        typer.echo(f"published={pub.get('title')} ({pub.get('path')})")
    if payload.get("reason"):
        typer.echo(f"reason={payload['reason']}")
    for item in payload.get("rejectedCandidates", [])[:5]:
        typer.echo(f"skip={item['queueId']} | {item['score']:.3f} | {item['reason']} | {item['title']}")


def publish_one_command(
    execute: bool = typer.Option(False, "--execute", help="Actually publish. Without this flag the command only reports the best safe candidate."),
    json_output: bool = typer.Option(False, "--json", help="Emit a machine-readable JSON report."),
    push: bool = typer.Option(True, "--push/--no-push", help="Push after a successful commit."),
    collect_first: bool = typer.Option(True, "--collect/--no-collect", help="Refresh RSS/raw data before selecting."),
    build: bool = typer.Option(True, "--build/--no-build", help="Run npm build before committing."),
    min_score: float = typer.Option(DEFAULT_MIN_SCORE, "--min-score", help="Minimum editorial score."),
    max_source_age_hours: int = typer.Option(DEFAULT_MAX_SOURCE_AGE_HOURS, "--max-source-age-hours", help="Reject stale source material."),
    commit_message: str = typer.Option("Publish one heartbeat news item", "--commit-message", help="Git commit message."),
    min_interval_seconds: int = typer.Option(DEFAULT_MIN_INTERVAL_SECONDS, "--min-interval-seconds", help="Skip if another heartbeat publish-one cycle started recently."),
    force: bool = typer.Option(False, "--force", help="Bypass the recent-cycle guard."),
    duplicate_retry_limit: int = typer.Option(3, "--duplicate-retry-limit", help="Try this many replacement candidates when the live duplicate gate rejects a selected item."),
    full_logs: bool = typer.Option(False, "--full-logs", help="Keep full stdout/stderr in JSON output instead of compacting step logs."),
) -> None:
    """Run one low-noise heartbeat publish cycle with strict quality gates.

    This is deliberately not a blind autopublisher. It only publishes a single
    item when the existing editorial autonomy checks say the title, description,
    fact depth, body, source age, duplicate guards, AI hero, audits and build are
    all clean. Otherwise it returns a compact manual_review/skip report for
    Asteria instead of making her stitch ten shell commands together.
    """
    # Internal tests/callers invoke this function directly, where Typer option
    # defaults arrive as OptionInfo objects. Normalize them so safety gates and
    # retry limits behave the same outside the CLI parser.
    if not isinstance(execute, bool):
        execute = False
    if not isinstance(json_output, bool):
        json_output = False
    if not isinstance(push, bool):
        push = True
    if not isinstance(collect_first, bool):
        collect_first = True
    if not isinstance(build, bool):
        build = True
    if not isinstance(min_score, int | float):
        min_score = DEFAULT_MIN_SCORE
    if not isinstance(max_source_age_hours, int):
        max_source_age_hours = DEFAULT_MAX_SOURCE_AGE_HOURS
    if not isinstance(commit_message, str):
        commit_message = "Publish one heartbeat news item"
    if not isinstance(min_interval_seconds, int):
        min_interval_seconds = DEFAULT_MIN_INTERVAL_SECONDS
    if not isinstance(force, bool):
        force = False
    if not isinstance(duplicate_retry_limit, int):
        duplicate_retry_limit = 3
    if not isinstance(full_logs, bool):
        full_logs = False

    root = Path.cwd()
    payload: dict[str, Any] = {
        "schemaVersion": 1,
        "command": "heartbeat publish-one",
        "startedAt": datetime.now(UTC).isoformat(),
        "execute": execute,
        "result": "unknown",
        "steps": [],
        "rejectedCandidates": [],
        "duplicateRejectedCandidates": [],
    }

    if execute:
        allowed, guard_info = _recent_cycle_guard(root, min_interval_seconds, force)
    else:
        allowed = True
        guard_info = {"dryRun": True, "applied": False, "reason": "dry-run does not throttle real heartbeat execution"}
    payload["guard"] = guard_info
    if not allowed:
        payload["result"] = "skip_recent_cycle"
        payload["reason"] = "recent heartbeat publish-one cycle already started; likely exec-completion wake"
        _emit(payload, json_output)
        return

    if collect_first:
        for name, args, timeout in (
            ("collect", ["collect"], 360),
            ("process", ["process"], 420),
            ("queue-cleanup", ["queue", "cleanup"], 60),
        ):
            step = _run_pipeline_command(name, args, timeout=timeout)
            payload["steps"].append(_compact_step(step, full_logs=full_logs))
            if not step["ok"]:
                payload["result"] = "error"
                payload["reason"] = f"{name} failed"
                _mark_cycle_completed(root, payload["result"])
                _emit(payload, json_output)
                raise typer.Exit(code=1)

    service = QueueService(root / "news_pipeline/data/queue")
    publish_step: dict[str, Any] | None = None
    approved: QueueItem | None = None
    duplicate_attempts = 0
    while True:
        candidate, rejections = _select_candidate(root, min_score=min_score, max_source_age_hours=max_source_age_hours)
        payload["rejectedCandidates"] = rejections

        if candidate is None:
            payload["result"] = "manual_review"
            payload["reason"] = "no candidate passed strict publish-one gates"
            if execute:
                _mark_cycle_completed(root, payload["result"])
            _emit(payload, json_output)
            return

        payload["candidate"] = _candidate_snapshot(candidate)
        if not execute:
            payload["result"] = "dry_run_ready"
            payload["reason"] = "candidate passed strict gates; rerun with --execute to publish"
            _emit(payload, json_output)
            return

        approved = service.approve(candidate.queue_id)
        if approved is None:
            payload["result"] = "error"
            payload["reason"] = "candidate disappeared before approve"
            _mark_cycle_completed(root, payload["result"])
            _emit(payload, json_output)
            raise typer.Exit(code=1)

        publish_step = _run_step("publish", publish_queue_item, approved.queue_id, max_source_age_hours=max_source_age_hours)
        payload["steps"].append(_compact_step(publish_step, full_logs=full_logs))
        if publish_step["ok"]:
            break
        if _is_duplicate_publish_error(publish_step):
            rejected = _reject_duplicate_publish_candidate(service, approved.queue_id, publish_step)
            if rejected is not None:
                payload["duplicateRejectedCandidates"].append(rejected)
                payload["duplicateRejected"] = rejected
            duplicate_attempts += 1
            if duplicate_attempts <= duplicate_retry_limit:
                continue
            payload["result"] = "manual_review"
            payload["reason"] = "duplicate publish gate rejected all retry candidates"
            _mark_cycle_completed(root, payload["result"])
            _emit(payload, json_output)
            return
        payload["result"] = "error"
        payload["reason"] = "publish failed"
        _mark_cycle_completed(root, payload["result"])
        _emit(payload, json_output)
        raise typer.Exit(code=1)

    assert publish_step is not None
    assert approved is not None

    published_path = None
    for line in (publish_step.get("stdout") or "").splitlines():
        if line.startswith("published:"):
            published_path = line.split(":", 1)[1].strip()
            break

    audit_steps = (
        ("audit-images", lambda: audit_images_command()),
        ("audit-content", lambda: audit_content_command(content_dir=root / "src/content/equinoxHaber")),
    )
    for name, func in audit_steps:
        step = _run_step(name, func)
        payload["steps"].append(_compact_step(step, full_logs=full_logs))
        if not step["ok"]:
            payload["result"] = "error"
            payload["reason"] = f"{name} failed"
            _mark_cycle_completed(root, payload["result"])
            _emit(payload, json_output)
            raise typer.Exit(code=1)

    if build:
        build_step = _run_shell("npm-build", ["npm", "run", "build"], timeout=240)
        payload["steps"].append(_compact_step(build_step, full_logs=full_logs))
        if not build_step["ok"]:
            payload["result"] = "error"
            payload["reason"] = "build failed"
            _mark_cycle_completed(root, payload["result"])
            _emit(payload, json_output)
            raise typer.Exit(code=1)

    git_steps = _git_commit_and_push(commit_message, push=push)
    payload["steps"].extend(_compact_step(step, full_logs=full_logs) for step in git_steps)
    if any(not step.get("ok") for step in git_steps):
        payload["result"] = "error"
        payload["reason"] = "git commit/push failed"
        _mark_cycle_completed(root, payload["result"])
        _emit(payload, json_output)
        raise typer.Exit(code=1)

    payload["result"] = "published"
    payload["published"] = {
        "queueId": approved.queue_id,
        "title": approved.draft_title,
        "path": published_path,
        "pushed": push,
    }
    payload["finishedAt"] = datetime.now(UTC).isoformat()
    _mark_cycle_completed(root, payload["result"])
    _emit(payload, json_output)
