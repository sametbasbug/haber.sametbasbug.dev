from __future__ import annotations

import typer

from news_pipeline.cli.commands.audit_content import audit_content_command
from news_pipeline.cli.commands.audit_images import audit_images_command
from news_pipeline.cli.commands.autopublish import autopublish_command
from news_pipeline.cli.commands.collect import collect_command
from news_pipeline.cli.commands.demo import demo_seed_command, demo_walkthrough_command
from news_pipeline.cli.commands.process import process_command
from news_pipeline.cli.commands.publish import publish_command
from news_pipeline.cli.commands.queue_approve import queue_approve_command
from news_pipeline.cli.commands.queue_cleanup import queue_cleanup_command
from news_pipeline.cli.commands.queue_inspect import queue_inspect_command
from news_pipeline.cli.commands.queue_list import queue_list_command
from news_pipeline.cli.commands.queue_reject import queue_reject_command
from news_pipeline.cli.commands.queue_review import queue_review_command
from news_pipeline.cli.commands.queue_summary import queue_summary_command
from news_pipeline.cli.commands.queue_polish import queue_polish_command
from news_pipeline.cli.commands.heartbeat_prepare_one import prepare_one_command
from news_pipeline.cli.commands.heartbeat_publish_one import publish_one_command

app = typer.Typer(help="Editorial-first news pipeline CLI")
queue_app = typer.Typer(help="Queue operations")
heartbeat_app = typer.Typer(help="Heartbeat operations")
demo_app = typer.Typer(help="Provider-free demo dataset helpers")

app.command("collect")(collect_command)
app.command("process")(process_command)
app.command("publish", hidden=True)(publish_command)
app.command("autopublish")(autopublish_command)
app.command("audit-images")(audit_images_command)
app.command("audit-content")(audit_content_command)
queue_app.command("list")(queue_list_command)
queue_app.command("inspect")(queue_inspect_command)
queue_app.command("approve")(queue_approve_command)
queue_app.command("reject")(queue_reject_command)
queue_app.command("review")(queue_review_command)
queue_app.command("summary")(queue_summary_command)
queue_app.command("cleanup")(queue_cleanup_command)
queue_app.command("polish")(queue_polish_command)
heartbeat_app.command("prepare-one")(prepare_one_command)
heartbeat_app.command("publish-one")(publish_one_command)
demo_app.command("seed")(demo_seed_command)
demo_app.command("walkthrough")(demo_walkthrough_command)
app.add_typer(queue_app, name="queue")
app.add_typer(heartbeat_app, name="heartbeat")
app.add_typer(demo_app, name="demo")


if __name__ == "__main__":
    app()
