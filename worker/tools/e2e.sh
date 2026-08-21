#!/usr/bin/env bash
# Uçtan uca takımı temiz bir yerel veritabanıyla koşar.
#
# Sıfırlama burada, Worker'da değil: bir "test verilerini sil" ucu yazmak,
# üretimde yanlışlıkla açık kalabilecek bir kapı açmak demektir. Takım yerel
# geliştirme içindir ve yerel D1'e wrangler üzerinden doğrudan erişir.
#
# Varsayılan hedef 8790: yayın uçlarının CANLIDA çalışacağı yer Astro SSR
# sitesi (`wrangler.ssr.jsonc`), ayrı Worker değil. Takımın gerçek dağıtım
# yolunu sınaması için oraya bakıyor. `worker/wrangler.jsonc` ile ayağa kalkan
# bağımsız Worker hâlâ çalışıyor ve adres verilerek sınanabilir:
#   npm run e2e -- http://localhost:8787
set -euo pipefail
cd "$(dirname "$0")/.."

npx wrangler d1 execute haber --local --command \
  "DELETE FROM article_tags; DELETE FROM article_sources; DELETE FROM articles; DELETE FROM briefs;" \
  >/dev/null 2>&1

node tools/e2e.mjs "$@"
