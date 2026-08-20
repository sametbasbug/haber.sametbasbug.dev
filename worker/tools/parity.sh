#!/usr/bin/env bash
# Python sözleşmesi ile TypeScript çevirisini karşılaştırır.
#
# Dört kapı da aynı soruyu soruyor: Worker'daki kod, `newsroom` paketiyle aynı
# kararı mı veriyor. Referans üretimi Python tarafında yapılıyor ki karşılaştırma
# iki bağımsız uygulamayı sınasın, tek uygulamayı kendine karşı değil.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"
PY="$ROOT/newsroom/.venv/bin/python"
CASES=".cases"

if [ ! -x "$PY" ]; then
  echo "newsroom sanal ortamı yok: $PY" >&2
  echo "kurulum: python3 -m venv newsroom/.venv && newsroom/.venv/bin/pip install -e 'newsroom[test]'" >&2
  exit 1
fi

mkdir -p "$CASES"

echo "referanslar üretiliyor (Python)…"
"$PY" tools/dump-fuzz-cases.py   "$CASES/fuzz.json"
"$PY" tools/dump-lang-cases.py   "$CASES/lang.json"
"$PY" tools/dump-accept-cases.py "$CASES/accept.json"
"$PY" tools/dump-slug-cases.py   "$CASES/slug.json"

echo
echo "── benzerlik ölçüsü (rapidfuzz) ──"; node tools/parity-fuzz.mjs   "$CASES/fuzz.json"
echo; echo "── dil kapısı ──";            node tools/parity-lang.mjs   "$CASES/lang.json"
echo; echo "── kabul sözleşmesi ──";      node tools/parity-accept.mjs "$CASES/accept.json"
echo; echo "── slug üretimi ──";          node tools/parity-slug.mjs   "$CASES/slug.json"
echo; echo "── render (canlı dist'e karşı) ──"; node tools/parity-render.mjs
echo
echo "Beş takım da geçti."
