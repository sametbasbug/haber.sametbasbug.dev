from __future__ import annotations

import typer

from news_pipeline.cli.commands.autopublish import autopublish_command
from news_pipeline.cli.commands.collect import collect_command
from news_pipeline.cli.commands.process import process_command
from news_pipeline.cli.commands.publish import publish_command
from news_pipeline.cli.commands.queue_approve import queue_approve_command
from news_pipeline.cli.commands.queue_cleanup import queue_cleanup_command
from news_pipeline.cli.commands.queue_inspect import queue_inspect_command
from news_pipeline.cli.commands.queue_list import queue_list_command
from news_pipeline.cli.commands.queue_reject import queue_reject_command
from news_pipeline.cli.commands.queue_review import queue_review_command
from news_pipeline.cli.commands.queue_summary import queue_summary_command

app = typer.Typer(help="Editorial-first news pipeline CLI")
queue_app = typer.Typer(help="Queue operations")

app.command("collect")(collect_command)
app.command("process")(process_command)
app.command("publish")(publish_command)
app.command("autopublish")(autopublish_command)
queue_app.command("list")(queue_list_command)
queue_app.command("inspect")(queue_inspect_command)
queue_app.command("approve")(queue_approve_command)
queue_app.command("reject")(queue_reject_command)
queue_app.command("review")(queue_review_command)
queue_app.command("summary")(queue_summary_command)
queue_app.command("cleanup")(queue_cleanup_command)
app.add_typer(queue_app, name="queue")


if __name__ == "__main__":
    app()
