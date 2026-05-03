#!/usr/bin/env bash
set -euo pipefail

ROOT="/Volumes/KIOXIA/haber-project"
BIN="$ROOT/news_pipeline/.venv/bin/news-pipeline"
RAW_DIR="$ROOT/news_pipeline/data/raw"
STALE_SECONDS="${STALE_RAW_SECONDS:-10800}"
STATE_DIR="$ROOT/news_pipeline/data/state"
STATE_FILE="$STATE_DIR/heartbeat-cycle.json"
MIN_INTERVAL_SECONDS="${HEARTBEAT_CYCLE_MIN_INTERVAL_SECONDS:-3300}"
cd "$ROOT"

if [ ! -x "$BIN" ]; then
  echo "heartbeat-cycle: missing executable $BIN" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"

if [ "${FORCE_HEARTBEAT_CYCLE:-0}" != "1" ]; then
  if ! python3 - "$STATE_FILE" "$MIN_INTERVAL_SECONDS" <<'PYGUARD'
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

state_path = Path(sys.argv[1])
min_interval = int(sys.argv[2])
now = int(time.time())

try:
    state = json.loads(state_path.read_text(encoding="utf-8"))
except Exception:
    state = {}

last = int(state.get("last_started_at") or state.get("last_completed_at") or 0)
age = now - last if last else None
if last and age is not None and age < min_interval:
    print("--- HEARTBEAT GUARD ---")
    print(f"recent_cycle_age_seconds={age}")
    print(f"min_interval_seconds={min_interval}")
    print("guard_result=skip_recent_cycle")
    print("instruction=Asteria: this wake was likely caused by an exec-completion event from the previous heartbeat. Do not publish; reply HEARTBEAT_OK.")
    sys.exit(1)

state["last_started_at"] = now
state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PYGUARD
  then
    exit 0
  fi
else
  python3 - "$STATE_FILE" <<'PYFORCE'
import json, sys, time
from pathlib import Path
path = Path(sys.argv[1])
try:
    state = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    state = {}
state["last_started_at"] = int(time.time())
path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PYFORCE
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

python3 - "$STATE_FILE" <<'PYDONE'
import json, sys, time
from pathlib import Path
path = Path(sys.argv[1])
try:
    state = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    state = {}
state["last_completed_at"] = int(time.time())
path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PYDONE
