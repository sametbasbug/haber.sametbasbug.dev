"""Çevrim orkestrasyonu.

Bir çevrim iki yarıdan oluşur, çünkü ortasında Asteria var:

    prepare  →  [Asteria okur, seçer, yazar]  →  publish

`prepare` toplar, eler, panoyu kurar ve brief'i diske yazar. `publish` Asteria'nın
JSON yanıtını alır, sözleşmeye karşı doğrular ve yayına taşır.

İki yarı ayrı çağrılar olduğu için brief diskte saklanır; `publish` kendi
uydurduğu bir panoya değil, Asteria'ya gerçekten gösterilen panoya karşı
doğrulama yapar.

Yayın adımı **geri alınabilir**: doğrulama kapılarından biri düşerse yazılan
dosya ve üretilen görsel silinir, commit atılmaz. Yarım kalmış bir yayın
bırakmak, hiç yayın yapmamaktan kötüdür.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
import json
from pathlib import Path
import time

from newsroom import hero, store
from newsroom.accept import AcceptError, validate
from newsroom.brief import attach_text, build_brief, select_board
from newsroom.ingest import collect
from newsroom.live import load_live
from newsroom.publish import PUBLISH_TZ, render, slugify, write
from newsroom.screen import eligible
from newsroom.sources import due_sources, load_sources
from newsroom.verify import commit, verify

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
STATE_PATH = DATA_DIR / "state.json"
BRIEF_PATH = DATA_DIR / "current-brief.json"

# Bir aday kaç çevrim panoda görünüp seçilmezse havuzdan düşer. Sürekli aynı
# adayı sunmak, Asteria'nın her seferinde aynı kararı yeniden vermesine yol açar.
MAX_BOARD_APPEARANCES = 3

# Stok görsel tekrarını önlemek için hatırlanan Pexels foto sayısı.
PEXELS_MEMORY = 60


@dataclass
class CycleState:
    """Çevrimler arasında taşınan durum. Repoya girmez."""

    last_fetched: dict[str, float] = field(default_factory=dict)
    board_appearances: dict[str, int] = field(default_factory=dict)
    pexels_used: list[str] = field(default_factory=list)
    last_cycle_at: str | None = None

    @classmethod
    def load(cls, path: Path | None = None) -> CycleState:
        target = path or STATE_PATH
        if not target.is_file():
            return cls()
        try:
            return cls(**json.loads(target.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, TypeError):
            return cls()

    def save(self, path: Path | None = None) -> None:
        target = path or STATE_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(asdict(self), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    def exhausted_candidates(self) -> set[str]:
        return {
            candidate_id
            for candidate_id, count in self.board_appearances.items()
            if count >= MAX_BOARD_APPEARANCES
        }

    def remember_pexels(self, origin: str | None) -> None:
        if origin and origin.startswith("pexels:"):
            self.pexels_used.append(origin.split(":", 1)[1])
            del self.pexels_used[:-PEXELS_MEMORY]


@dataclass
class PublishReport:
    """Bir yayın denemesinin sonucu."""

    published: list[dict] = field(default_factory=list)
    declined_reason: str | None = None
    errors: list[AcceptError] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors and not self.problems


def prepare(
    *,
    select_count: int = 1,
    board_size: int | None = None,
    now: datetime | None = None,
    state_path: Path | None = None,
    brief_path: Path | None = None,
    candidates_path: Path | None = None,
) -> dict:
    """Toplar, eler, panoyu kurar ve brief'i diske yazar."""
    moment = now or datetime.now(UTC)
    state = CycleState.load(state_path)

    sources = load_sources()
    due = due_sources(sources, state.last_fetched, now=time.time())
    fresh, feed_errors = collect(due)
    for source in due:
        state.last_fetched[source.id] = time.time()

    # Toplama ritmi ile seçim ritmi ayrıdır: bu çevrimde çekilmeyen bir
    # kaynağın adayları da panoya girebilmeli.
    candidates = store.merge(store.load(candidates_path), fresh, now=moment)
    store.save(candidates, candidates_path)

    kept, blocked = eligible(candidates, now=moment)
    live = load_live()

    picks = select_board(
        kept,
        live,
        size=(board_size or 8) * 2,
        exclude_ids=state.exhausted_candidates(),
    )
    board, dropped = attach_text(picks, size=board_size or 8)

    for candidate in board:
        state.board_appearances[candidate.id] = state.board_appearances.get(candidate.id, 0) + 1

    brief = build_brief(
        board,
        live,
        select_count=select_count,
        screening=blocked,
        pool_size=len(candidates),
        now=moment,
    )
    brief["pipeline"]["feedErrors"] = [
        {"source": error.source_id, "message": error.message} for error in feed_errors
    ]
    brief["pipeline"]["textExtractionFailures"] = len(dropped)
    brief["pipeline"]["storedCandidates"] = len(candidates)
    brief["pipeline"]["freshlyCollected"] = len(fresh)

    state.last_cycle_at = moment.isoformat()
    state.save(state_path)

    target = brief_path or BRIEF_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return brief


def _sources_for(entry: dict) -> list[dict]:
    return [{"name": entry["source"], "url": entry["url"]}]


def _hero_queries(selection: dict) -> list[str]:
    """Stok görsel için arama terimleri.

    Asteria'nın kendi etiketleri ve kategorisi kullanılır; ayrı bir sorgu
    üretme mantığı yok.
    """
    tags = [tag for tag in selection.get("tags") or [] if tag]
    queries = [" ".join(tags[:2])] if tags else []
    queries.extend(tags[:3])
    queries.append(selection.get("category", ""))
    return [query for query in queries if query.strip()]


def publish(
    response: dict,
    *,
    brief: dict | None = None,
    now: datetime | None = None,
    state_path: Path | None = None,
    brief_path: Path | None = None,
    content_dir: Path | None = None,
    hero_dir: Path | None = None,
    build: bool = True,
    do_commit: bool = True,
) -> PublishReport:
    """Asteria yanıtını doğrular ve yayına taşır."""
    report = PublishReport()
    source_brief = brief
    if source_brief is None:
        target = brief_path or BRIEF_PATH
        if not target.is_file():
            report.problems.append("brief bulunamadı; önce prepare çalıştırılmalı")
            return report
        source_brief = json.loads(target.read_text(encoding="utf-8"))

    result = validate(response, source_brief)
    if result.errors:
        report.errors = result.errors
        return report
    if not result.accepted:
        report.declined_reason = result.declined_reason
        return report

    state = CycleState.load(state_path)
    board = {entry["id"]: entry for entry in source_brief.get("board", [])}
    moment = (now or datetime.now(PUBLISH_TZ)).astimezone(PUBLISH_TZ)

    for selection in result.accepted:
        entry = board[selection["candidateId"]]
        slug = slugify(selection["title"])

        generated = selection.get("heroImagePath")
        hero_result = hero.resolve(
            slug,
            generated=Path(generated) if generated else None,
            queries=_hero_queries(selection),
            exclude_ids=set(state.pexels_used),
            hero_dir=hero_dir,
        )

        markdown = render(
            selection,
            sources=_sources_for(entry),
            hero_image=hero_result.public_path,
            now=moment,
            slug=slug,
        )

        try:
            path = write(markdown, slug, content_dir=content_dir)
        except FileExistsError as exc:
            report.problems.append(str(exc))
            continue

        checks = verify(path, build=build)
        if not checks.ok:
            # Geri al: yarım yayın bırakma.
            path.unlink(missing_ok=True)
            if hero_result.ok and hero_result.origin != "existing":
                hero.hero_path(slug, hero_dir=hero_dir).unlink(missing_ok=True)
            report.problems.extend(checks.problems)
            continue

        state.remember_pexels(hero_result.origin)

        record = {
            "slug": slug,
            "title": selection["title"],
            "category": selection["category"],
            "candidateId": selection["candidateId"],
            "hero": hero_result.origin,
            "heroCredit": hero_result.credit,
            "heroFailure": hero_result.failure,
        }

        if do_commit:
            paths = [f"src/content/equinoxHaber/{slug}.md"]
            if hero_result.ok and hero_result.origin != "existing":
                paths.append(f"public/images/generated/equinox-haber/{slug}.webp")
            record["commit"] = commit(paths, f"Publish: {selection['title']}")

        report.published.append(record)

    state.save(state_path)
    return report
