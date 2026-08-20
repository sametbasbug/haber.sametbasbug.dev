#!/usr/bin/env bash
# Uçtan uca takımı temiz bir yerel veritabanıyla koşar.
#
# Sıfırlama burada, Worker'da değil: bir "test verilerini sil" ucu yazmak,
# üretimde yanlışlıkla açık kalabilecek bir kapı açmak demektir. Takım yerel
# geliştirme içindir ve yerel D1'e wrangler üzerinden doğrudan erişir.
set -euo pipefail
cd "$(dirname "$0")/.."

npx wrangler d1 execute haber --local --command \
  "DELETE FROM article_tags; DELETE FROM article_sources; DELETE FROM articles; DELETE FROM briefs;" \
  >/dev/null 2>&1

node tools/e2e.mjs "$@"
