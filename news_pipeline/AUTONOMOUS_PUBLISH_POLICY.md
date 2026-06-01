# Autonomous Publish Policy

This document defines the current autonomy boundary for the Anlık Haber pipeline.

The historical direct-autopublish path is **disabled**. The production model is now the Asteria/heartbeat/manual-review model: Python prepares and verifies the technical rail; Asteria provides the editorial handoff; sensitive or weak items stay out of production.

## Current default

- Heartbeat runs collect/process/cleanup and queue diagnostics.
- `news-pipeline autopublish` refuses to publish.
- `news-pipeline publish <QUEUE_ID>` is a hidden, deprecated guardrail command and refuses to publish.
- The only production publish rail is:

```bash
news-pipeline heartbeat prepare-one --json
# Asteria reads the selected source URL and applies editorial polish
news-pipeline queue polish <QUEUE_ID> ... --json
news-pipeline heartbeat publish-one --execute --no-collect --json
```

`publish-one` is technical automation, not editorial authority. It may write the live Markdown only after the editorial polish and safety gates are present.

## What Asteria may publish through the technical rail

Asteria may advance a story when all of these are true:

- the item is low-risk and globally relevant;
- `manual-review:` notes are absent;
- Asteria has read the selected source URL directly;
- `queue polish` has supplied Turkish title, description, facts, body, tags, `heroPrompt`, and `heroAlt`;
- the item passes freshness, duplicate, Turkish-language, body-depth, hero, image audit, content audit, and build gates.

In the cautious production mode, at most one clean item should normally be published per heartbeat cycle unless Samet explicitly changes the operating mode.

## What must not bypass manual review

Do not publish automatically when the item involves:

- lawsuits, investigations, sexual abuse claims, personal allegations, or reputationally risky claims;
- single-source hard accusations;
- high-tension domestic politics without strong global context;
- unclear or contradictory source material;
- `manual-review:` notes;
- weak Turkish body/description/facts;
- duplicate/near-duplicate topic risk.

These stay in the queue for explicit editorial escalation.

## Responsibility split

- **Python pipeline:** collect, normalize, dedupe, score, queue, expose a headline board, enforce gates, generate/write assets, audit, build, and keep commits narrow.
- **Asteria:** choose the candidate, read the source, write the Turkish article, create the hero brief, and decide whether the story deserves publication.
- **Samet/Nyx:** approve or steer high-risk policy changes, provider changes, and broad automation changes.

## Non-goals

This policy is not a license to run blind autonomous news publishing. The goal is boring reliability: keep the feed maintainable while preventing the common failures of AI-assisted publishing—duplicated stories, stale sources, leaked internal notes, and unreviewed sensitive claims.
