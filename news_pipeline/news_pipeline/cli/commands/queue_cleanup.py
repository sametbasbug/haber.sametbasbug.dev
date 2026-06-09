from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.queue.service import QueueService
from news_pipeline.storage.json_store import JsonStore


TERMINAL_STATUSES = {"published", "rejected"}
ACTIVE_STATUSES = {"new", "reviewing", "approved"}


HIGH_VOLUME_SOURCE_MIN_SCORES = {
    "the-verge": 0.56,
    "fast-company-tech": 0.56,
    "marketwatch-top-stories": 0.55,
    "dw-world": 0.54,
    "euronews-world": 0.54,
    "physorg": 0.53,
    "live-science": 0.53,
    "space-com": 0.53,
}
HIGH_VOLUME_ACTIVE_LIMITS = {
    "the-verge": 40,
    "fast-company-tech": 30,
    "marketwatch-top-stories": 25,
    "guardian-world": 60,
    "dw-world": 45,
    "euronews-world": 35,
    "physorg": 30,
    "live-science": 30,
    "space-com": 25,
}


def queue_cleanup_command(
    stale_hours: int = 36,
    archive_terminal_hours: int = 24,
    keep_score: float = 0.62,
    purge_rejected_archive_hours: int = 24,
    purge_published_archive_hours: int = 72,
    stale_source_hours: int = 24,
    low_score_reject: float = 0.50,
    low_score_grace_hours: int = 6,
    high_volume_grace_hours: int = 12,
) -> None:
    root = Path.cwd()
    queue_root = root / "news_pipeline/data/queue"
    archive_root = root / "news_pipeline/data/queue_archive"
    service = QueueService(queue_root)
    normalized_store = JsonStore(root / "news_pipeline/data/normalized", NormalizedArticle)
    now = datetime.now(UTC)

    archived_terminal = 0
    archived_stale = 0
    archived_source_stale = 0
    rejected_low_score = 0
    rejected_high_volume_low_score = 0
    rejected_source_overflow = 0
    kept_stale = 0
    purged_rejected_archive = 0
    purged_published_archive = 0

    for item in service.list_items():
        age = now - (item.updated_at or item.created_at)

        if item.status in TERMINAL_STATUSES and age >= timedelta(hours=archive_terminal_hours):
            if service.archive(item.queue_id, archive_root):
                archived_terminal += 1
            continue

        if item.status not in ACTIVE_STATUSES:
            continue

        if (
            item.status == "new"
            and age >= timedelta(hours=low_score_grace_hours)
            and item.editorial_priority < low_score_reject
        ):
            item.status = "rejected"
            item.editorial_priority = 0.0
            note = f"low-score-auto-reject: score below {low_score_reject:.2f} after {low_score_grace_hours}h"
            if note not in item.notes:
                item.notes.append(note)
            service.save(item)
            rejected_low_score += 1
            continue

        normalized = normalized_store.load(item.normalized_id)
        if normalized:
            source_age = now - (normalized.published_at or normalized.created_at).astimezone(UTC)
            source_min_score = HIGH_VOLUME_SOURCE_MIN_SCORES.get(normalized.source_id)
            if (
                item.status == "new"
                and source_min_score is not None
                and source_age >= timedelta(hours=high_volume_grace_hours)
                and item.editorial_priority < source_min_score
            ):
                item.status = "rejected"
                item.editorial_priority = 0.0
                note = f"high-volume-source-low-score-auto-reject: {normalized.source_id} score below {source_min_score:.2f} after {high_volume_grace_hours}h"
                if note not in item.notes:
                    item.notes.append(note)
                service.save(item)
                rejected_high_volume_low_score += 1
                continue
            if source_age >= timedelta(hours=stale_source_hours):
                item.status = "rejected"
                item.editorial_priority = 0.0
                stale_source_note = f"source-stale-auto-reject: source published older than {stale_source_hours}h"
                if stale_source_note not in item.notes:
                    item.notes.append(stale_source_note)
                service.save(item)
                if service.archive(item.queue_id, archive_root):
                    archived_source_stale += 1
                continue

        if age < timedelta(hours=stale_hours):
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

    active_by_source: dict[str, list[tuple[object, datetime]]] = {}
    for item in service.list_items():
        if item.status != "new":
            continue
        normalized = normalized_store.load(item.normalized_id)
        if normalized is None:
            continue
        if normalized.source_id not in HIGH_VOLUME_ACTIVE_LIMITS:
            continue
        active_by_source.setdefault(normalized.source_id, []).append((item, (normalized.published_at or normalized.created_at).astimezone(UTC)))

    for source_id, rows in active_by_source.items():
        limit = HIGH_VOLUME_ACTIVE_LIMITS[source_id]
        rows.sort(key=lambda row: (row[0].editorial_priority, row[1]), reverse=True)
        for item, _ in rows[limit:]:
            item.status = "rejected"
            item.editorial_priority = 0.0
            note = f"source-overflow-auto-reject: {source_id} active new limit {limit}"
            if note not in item.notes:
                item.notes.append(note)
            service.save(item)
            rejected_source_overflow += 1

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
    print(f"archived_source_stale={archived_source_stale}")
    print(f"rejected_low_score={rejected_low_score}")
    print(f"rejected_high_volume_low_score={rejected_high_volume_low_score}")
    print(f"rejected_source_overflow={rejected_source_overflow}")
    print(f"kept_stale_review={kept_stale}")
    print(f"purged_rejected_archive={purged_rejected_archive}")
    print(f"purged_published_archive={purged_published_archive}")
