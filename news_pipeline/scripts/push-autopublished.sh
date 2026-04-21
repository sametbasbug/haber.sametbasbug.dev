#!/usr/bin/env bash
set -euo pipefail

ROOT="/Volumes/KIOXIA/haber-project"
cd "$ROOT"

if [ "$#" -eq 0 ]; then
  exit 0
fi

paths=()
for path in "$@"; do
  if [ -f "$path" ]; then
    paths+=("$path")
  fi
done

if [ "${#paths[@]}" -eq 0 ]; then
  exit 0
fi

git add -- "${paths[@]}"

if git diff --cached --quiet; then
  exit 0
fi

first_slug="$(basename "${paths[0]}" .md)"
commit_message="news: autopublish ${first_slug}"

git commit -m "$commit_message"
git push origin main
