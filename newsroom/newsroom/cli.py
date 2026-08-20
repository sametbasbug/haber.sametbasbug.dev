"""Komut satırı arayüzü.

Codex'in zamanlanmış görevden çağırdığı yüzey budur. İki komut yeter:

    newsroom prepare                 # brief üretir, stdout'a JSON basar
    newsroom publish --response x.json

Çıktı her zaman JSON'dur ve tek parçadır: ajanın ayrıştırması gereken serbest
metin yoktur. Hata durumunda da JSON basılır, çıkış kodu sıfırdan farklı olur.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from newsroom.cycle import BRIEF_PATH, CycleState, prepare, publish
from newsroom.publish import DEFAULT_AUTHOR, SUPPORTED_AUTHORS


def _emit(payload: dict, *, ok: bool) -> int:
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0 if ok else 1


def _prepare(args: argparse.Namespace) -> int:
    brief = prepare(select_count=args.select_count, board_size=args.board_size)

    if args.summary:
        return _emit(
            {
                "briefPath": str(BRIEF_PATH),
                "boardSize": len(brief["board"]),
                "sources": sorted({entry["source"] for entry in brief["board"]}),
                "collected": brief["pipeline"]["collected"],
                "filtered": brief["pipeline"]["mechanicallyFiltered"],
                "policy": brief["policy"],
            },
            ok=bool(brief["board"]),
        )

    return _emit(brief, ok=bool(brief["board"]))


def _read_response(args: argparse.Namespace) -> dict | None:
    raw = sys.stdin.read() if args.stdin else Path(args.response).read_text(encoding="utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        return {"__error__": f"yanıt geçerli JSON değil: {exc}"}


def _publish(args: argparse.Namespace) -> int:
    payload = _read_response(args)
    if isinstance(payload, dict) and "__error__" in payload:
        return _emit({"ok": False, "problems": [payload["__error__"]]}, ok=False)

    report = publish(payload, build=not args.no_build, do_commit=not args.no_commit, author=args.author)

    return _emit(
        {
            "ok": report.ok,
            "published": report.published,
            "declinedReason": report.declined_reason,
            "contractErrors": [
                {"candidateId": error.candidate_id, "code": error.code, "message": error.message}
                for error in report.errors
            ],
            "problems": report.problems,
        },
        ok=report.ok,
    )


def _status(args: argparse.Namespace) -> int:
    state = CycleState.load()
    brief_exists = BRIEF_PATH.is_file()
    return _emit(
        {
            "lastCycleAt": state.last_cycle_at,
            "briefReady": brief_exists,
            "sourcesFetched": len(state.last_fetched),
            "candidatesTracked": len(state.board_appearances),
            "exhaustedCandidates": len(state.exhausted_candidates()),
            "pexelsRemembered": len(state.pexels_used),
            "lastCollection": state.last_collection,
        },
        ok=True,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="newsroom", description="Equinox Haber üretim sistemi")
    sub = parser.add_subparsers(dest="command", required=True)

    prepare_cmd = sub.add_parser("prepare", help="Aday panosunu ve brief'i üretir")
    prepare_cmd.add_argument("--select-count", type=int, default=1)
    prepare_cmd.add_argument("--board-size", type=int, default=None)
    prepare_cmd.add_argument(
        "--summary",
        action="store_true",
        help="Tam brief yerine kısa özet basar; brief yine diske yazılır",
    )
    prepare_cmd.set_defaults(func=_prepare)

    publish_cmd = sub.add_parser("publish", help="Editoryal operatör yanıtını yayına taşır")
    group = publish_cmd.add_mutually_exclusive_group(required=True)
    group.add_argument("--response", help="Yanıt JSON dosyası")
    group.add_argument("--stdin", action="store_true", help="Yanıtı stdin'den oku")
    publish_cmd.add_argument("--author", choices=SUPPORTED_AUTHORS, default=DEFAULT_AUTHOR, help=f"Yayın imzası (varsayılan: {DEFAULT_AUTHOR})")
    publish_cmd.add_argument("--no-build", action="store_true", help="Astro build adımını atla")
    publish_cmd.add_argument("--no-commit", action="store_true", help="Commit adımını atla")
    publish_cmd.set_defaults(func=_publish)

    status_cmd = sub.add_parser("status", help="Çevrim durumunu gösterir")
    status_cmd.set_defaults(func=_status)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:  # noqa: BLE001 - ajan için tek biçimli hata yüzeyi
        return _emit({"ok": False, "problems": [f"{type(exc).__name__}: {exc}"]}, ok=False)


if __name__ == "__main__":
    raise SystemExit(main())
