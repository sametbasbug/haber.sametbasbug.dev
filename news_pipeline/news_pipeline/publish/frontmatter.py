from __future__ import annotations

from datetime import UTC, datetime

from news_pipeline.models.queue import QueueItem
from news_pipeline.publish.hero_image import pick_hero_image


def build_frontmatter(item: QueueItem, *, is_draft: bool = True) -> str:
    now = datetime.now(UTC).astimezone().isoformat(timespec="seconds")
    category = item.draft_category or "Teknoloji"
    primary_sources = item.draft_sources[:1]
    all_sources = [*primary_sources, *item.supporting_sources]
    sources = "\n".join(
        [f"  - name: \"{source.name}\"\n    url: \"{source.url}\"" for source in all_sources]
    )
    tags = ", ".join([f'\"{tag}\"' for tag in (item.draft_tags or ["pipeline", "haber"])])
    draft_value = "true" if is_draft else "false"
    hero_image = pick_hero_image(item)
    return f"""---
title: \"{item.draft_title}\"
description: \"{item.draft_description}\"
pubDate: '{now}'
updatedDate: '{now}'
heroImage: "{hero_image}"
isDraft: {draft_value}
tags: [{tags}]
author: "Asteria AI"
category: "{category}"
breaking: false
sources:
{sources if sources else '  []'}
autoGlossaryLinks: true
---
"""
