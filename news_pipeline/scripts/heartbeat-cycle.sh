#!/usr/bin/env bash
set -euo pipefail

ROOT="/Volumes/KIOXIA/haber-project"
cd "$ROOT"

source news_pipeline/.venv/bin/activate

news-pipeline collect >/tmp/news-pipeline-collect.log 2>&1 || cat /tmp/news-pipeline-collect.log
news-pipeline process >/tmp/news-pipeline-process.log 2>&1 || cat /tmp/news-pipeline-process.log
news-pipeline queue cleanup >/tmp/news-pipeline-cleanup.log 2>&1 || cat /tmp/news-pipeline-cleanup.log

echo "--- HEARTBEAT SUMMARY ---"
news-pipeline queue summary || true

echo "--- AUTOPUBLISH ---"
echo "disabled: direct autopublish is off, waiting for Asteria editorial gate"

echo "--- MANUAL REVIEW ---"
news-pipeline queue review | sed -n '1,5p' || true

echo "--- STRONG NEW ---"
news-pipeline queue list --status new | sed -n '1,8p' || true

echo "--- ASTERIA EDITORIAL GATE ---"
# Default is OFF: the heartbeat itself may already consume an Asteria turn.
# Keeping this extra gate opt-in avoids double-triggering Asteria for one cycle
# and wasting the limited daily message budget.
if [ "${RUN_ASTERIA_GATE:-0}" = "1" ]; then
  bash news_pipeline/scripts/asteria-editorial-gate.sh || true
else
  echo "skipped by default to avoid duplicate Asteria turns; set RUN_ASTERIA_GATE=1 to force the extra gate run"
fi
