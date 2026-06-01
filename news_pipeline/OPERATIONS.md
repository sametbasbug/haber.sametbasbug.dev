# News Pipeline Operations

This is the canonical production operations guide for Anlık Haber.

The current production model is **Asteria/heartbeat/manual-review**. Direct autopublish is disabled; production publishing goes through the heartbeat board, Asteria editorial polish, and the guarded `heartbeat publish-one` rail.

## Canonical production flow

From the repository root:

```bash
cd /Volumes/KIOXIA/haber-project
bash news_pipeline/scripts/heartbeat-cycle.sh
```

The heartbeat script performs the routine technical cycle:

1. `collect`
2. `process`
3. `queue cleanup`
4. raw freshness report
5. `queue summary`
6. manual-review preview
7. strong-new preview
8. optional Asteria gate only when `RUN_ASTERIA_GATE=1`

By default, `heartbeat-cycle.sh` does **not** call the extra Asteria gate. This avoids double-consuming Asteria turns in one wake. If a human/operator intentionally wants the extra gate in the same run:

```bash
RUN_ASTERIA_GATE=1 bash news_pipeline/scripts/heartbeat-cycle.sh
```

## Editorial handoff flow

When a candidate deserves work, the safe publish rail is:

```bash
news-pipeline heartbeat prepare-one --json
# Asteria reads the selected source URL and writes the Turkish story
news-pipeline queue polish <QUEUE_ID> \
  --title "..." \
  --description "..." \
  --category "Teknoloji" \
  --facts-json '["...", "..."]' \
  --body "..." \
  --hero-prompt "..." \
  --hero-alt "..." \
  --tags-json '["pipeline", "haber"]' \
  --json
news-pipeline heartbeat publish-one --execute --no-collect --json
```

`publish-one` handles the technical rail: freshness, duplicate guards, hero generation, image/content audits, build, and narrow git commit/push.

## Manual-review policy

Inspect sensitive items first:

```bash
news-pipeline queue review
```

Manual-review items must not be auto-published. Typical triggers:

- lawsuits or investigations;
- sexual abuse or personal allegations;
- high-reputation-risk claims;
- single-source hard accusations;
- unclear or contradictory source material.

## Disabled direct publish paths

These commands are intentionally not production paths:

```bash
news-pipeline autopublish
news-pipeline publish <QUEUE_ID>
```

They remain only as guardrails for old references and should refuse to publish. Use `heartbeat publish-one` after Asteria polish instead.

## Provider-free local checks

After pipeline changes:

```bash
python3 -m compileall news_pipeline/news_pipeline
news_pipeline/.venv/bin/python -m pytest news_pipeline/tests
news-pipeline audit-content
news-pipeline audit-images
npm run build
```

## Demo walkthrough

A tiny synthetic dataset is available for local OSS review without providers or third-party article bodies:

```bash
news-pipeline demo seed --force
news-pipeline demo walkthrough
```

The walkthrough uses dry-run `publish-one` by default, so it does not write articles, commit, push, or call providers. The demo data is synthetic and safe, but it is still runtime data; avoid seeding it into a production queue unless you intentionally want demo fixtures present.

## Reference docs

- `news_pipeline/HEARTBEAT_RUNBOOK.md` — concise heartbeat runbook
- `news_pipeline/AUTONOMOUS_PUBLISH_POLICY.md` — autonomy boundaries
- `news_pipeline/README.md` — CLI and pipeline details
