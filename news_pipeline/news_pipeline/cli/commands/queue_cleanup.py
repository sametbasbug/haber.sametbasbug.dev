from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from news_pipeline.queue.service import QueueService


TERMINAL_STATUSES = {"published", "rejected"}
ACTIVE_STATUSES = {"new", "reviewing", "approved"}


def queue_cleanup_command(
    stale_hours: int = 48,
    archive_terminal_hours: int = 24,
    keep_score: float = 0.62,
    purge_rejected_archive_hours: int = 24,
    purge_published_archive_hours: int = 72,
) -> None:
    root = Path.cwd()
    queue_root = root / "news_pipeline/data/queue"
    archive_root = root / "news_pipeline/data/queue_archive"
    service = QueueService(queue_root)
    now = datetime.now(UTC)

    archived_terminal = 0
    archived_stale = 0
    kept_stale = 0
    purged_rejected_archive = 0
    purged_published_archive = 0

    for item in service.list_items():
        age = now - (item.updated_at or item.created_at)

        if item.status in TERMINAL_STATUSES and age >= timedelta(hours=archive_terminal_hours):
            if service.archive(item.queue_id, archive_root):
                archived_terminal += 1
            continue

        if item.status not in ACTIVE_STATUSES or age < timedelta(hours=stale_hours):
            continue

        manual_review = any(note.startswith("manual-review:") for note in item.notes)
        if item.editorial_priority >= keep_score or manual_review:
            stale_note = f"stale-review: older than {stale_hours}h, kept for final review"
            if stale_note not in item.notes:
                item.notes.append(stale_note)
            if item.status == "new":
                item.status = "reviewing"
            service.save(item)
            kept_stale += 1
            continue

        item.status = "rejected"
        item.editorial_priority = 0.0
        stale_reject_note = f"stale-auto-reject: older than {stale_hours}h"
        if stale_reject_note not in item.notes:
            item.notes.append(stale_reject_note)
        service.save(item)
        if service.archive(item.queue_id, archive_root):
            archived_stale += 1

    for path in sorted(archive_root.glob("*.json")):
        item = service.store.model_cls.model_validate_json(path.read_text(encoding="utf-8"))
        age = now - (item.updated_at or item.created_at)
        if item.status == "rejected" and age >= timedelta(hours=purge_rejected_archive_hours):
            path.unlink(missing_ok=True)
            purged_rejected_archive += 1
            continue
        if item.status == "published" and age >= timedelta(hours=purge_published_archive_hours):
            path.unlink(missing_ok=True)
            purged_published_archive += 1

    print(f"archived_terminal={archived_terminal}")
    print(f"archived_stale={archived_stale}")
    print(f"kept_stale_review={kept_stale}")
    print(f"purged_rejected_archive={purged_rejected_archive}")
    print(f"purged_published_archive={purged_published_archive}")
