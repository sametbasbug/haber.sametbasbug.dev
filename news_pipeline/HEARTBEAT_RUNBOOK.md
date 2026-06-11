# Heartbeat Runbook

Concise runbook for the current Equinox Haber heartbeat.

For full operations details, use `news_pipeline/OPERATIONS.md`. This file intentionally mirrors the same canonical flow.

## One command

```bash
cd /Volumes/KIOXIA/haber-project && bash news_pipeline/scripts/heartbeat-cycle.sh
```

## What the script does

1. `news_pipeline/.venv/bin/news-pipeline collect`
2. `news_pipeline/.venv/bin/news-pipeline process`
3. `news_pipeline/.venv/bin/news-pipeline queue cleanup`
4. report raw freshness (`raw_latest`, `raw_age_seconds`, `raw_status`)
5. `news_pipeline/.venv/bin/news-pipeline queue summary`
6. print that direct autopublish is disabled
7. `news_pipeline/.venv/bin/news-pipeline queue review | sed -n '1,5p'`
8. `news_pipeline/.venv/bin/news-pipeline queue list --status new | sed -n '1,8p'`
9. skip the extra Asteria gate by default; run it only with `RUN_ASTERIA_GATE=1`

## Important boundary

The heartbeat script itself does not publish live articles.

Production publish requires:

```bash
news-pipeline heartbeat prepare-one --json
news-pipeline queue polish <QUEUE_ID> ... --json
news-pipeline heartbeat publish-one --execute --no-collect --json
```

Asteria must read the selected source URL and apply the editorial polish before `publish-one` can carry the item through the technical rail.

## When to speak up

Send a short update only when one of these is true:

- a new `manual-review` item appears;
- a strong publish candidate appears;
- the same story gains useful supporting sources;
- collect/process/audit/build fails;
- raw input is stale or missing for a meaningful period.

## When to stay quiet

Reply `HEARTBEAT_OK` when:

- only duplicates/noise were filtered;
- no meaningful candidate exists;
- all candidates are weak or stale;
- the cycle is skipped by recent-cycle guard;
- the last useful update was very recent.

## Direct autopublish status

Direct autopublish remains disabled. `news-pipeline autopublish` and hidden `news-pipeline publish <QUEUE_ID>` are guardrails, not production paths.
