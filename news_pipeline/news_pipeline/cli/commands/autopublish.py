from __future__ import annotations

import typer


def autopublish_command() -> None:
    """Deprecated direct autopublish entrypoint.

    This command intentionally refuses to publish. The current production rail is
    Asteria-led: prepare a headline board, let Asteria read/write/polish the
    story, then run the guarded heartbeat publish command.
    """
    typer.echo(
        "DEPRECATED: `news-pipeline autopublish` is disabled.\n"
        "Do not use this command for Equinox Haber. It bypasses Asteria's editorial handoff.\n"
        "Use instead:\n"
        "  news-pipeline heartbeat prepare-one --json\n"
        "  news-pipeline queue polish <QUEUE_ID> ... --json\n"
        "  news-pipeline heartbeat publish-one --execute --no-collect --json",
        err=True,
    )
    raise typer.Exit(code=2)
