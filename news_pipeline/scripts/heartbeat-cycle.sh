#!/usr/bin/env bash
set -euo pipefail

ROOT="/Volumes/KIOXIA/haber-project"
BIN="$ROOT/news_pipeline/.venv/bin/news-pipeline"
RAW_DIR="$ROOT/news_pipeline/data/raw"
STALE_SECONDS="${STALE_RAW_SECONDS:-10800}"
cd "$ROOT"

if [ ! -x "$BIN" ]; then
  echo "heartbeat-cycle: missing executable $BIN" >&2
  exit 1
fi

"$BIN" collect >/tmp/news-pipeline-collect.log 2>&1 || cat /tmp/news-pipeline-collect.log
"$BIN" process >/tmp/news-pipeline-process.log 2>&1 || cat /tmp/news-pipeline-process.log
"$BIN" queue cleanup >/tmp/news-pipeline-cleanup.log 2>&1 || cat /tmp/news-pipeline-cleanup.log

echo "--- INPUT FRESHNESS ---"
python3 - <<'PY'
from pathlib import Path
import time
root = Path('/Volumes/KIOXIA/haber-project/news_pipeline/data/raw')
files = sorted(root.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)
if not files:
    print('raw_latest=missing')
else:
    latest = files[0]
    age = int(time.time() - latest.stat().st_mtime)
    print(f'raw_latest={latest.name}')
    print(f'raw_age_seconds={age}')
PY

if ! python3 - <<'PY'
from pathlib import Path
import os, sys, time
root = Path('/Volumes/KIOXIA/haber-project/news_pipeline/data/raw')
limit = int(os.environ.get('STALE_RAW_SECONDS', '10800'))
files = sorted(root.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)
if not files:
    sys.exit(1)
age = int(time.time() - files[0].stat().st_mtime)
sys.exit(0 if age <= limit else 1)
PY
then
  echo "raw_status=stale_or_missing"
else
  echo "raw_status=fresh"
fi

echo "--- HEARTBEAT SUMMARY ---"
"$BIN" queue summary || true

echo "--- AUTOPUBLISH ---"
echo "disabled: direct autopublish is off, waiting for Asteria editorial gate"

echo "--- MANUAL REVIEW ---"
"$BIN" queue review | sed -n '1,5p' || true

echo "--- STRONG NEW ---"
"$BIN" queue list --status new | sed -n '1,8p' || true

echo "--- ASTERIA EDITORIAL GATE ---"
# Default is OFF: the heartbeat itself may already consume an Asteria turn.
# Keeping this extra gate opt-in avoids double-triggering Asteria for one cycle
# and wasting the limited daily message budget.
if [ "${RUN_ASTERIA_GATE:-0}" = "1" ]; then
  bash news_pipeline/scripts/asteria-editorial-gate.sh || true
else
  echo "skipped by default to avoid duplicate Asteria turns; set RUN_ASTERIA_GATE=1 to force the extra gate run"
fi
