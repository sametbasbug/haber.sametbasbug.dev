#!/usr/bin/env bash
# Sayfa denkliğini kendi durumunu kurarak koşar.
#
# Sarmalayıcı gerekli çünkü bu takım arşivin TAMAMININ D1'de olmasına
# dayanıyor: ilgili haberler, önceki/sonraki bağlantıları ve sıralama bütün
# koleksiyondan hesaplanıyor. `npm run e2e` tabloları temizlediği için iki
# takım aynı veritabanını paylaşamaz; sıraya güvenmek yerine her biri kendi
# durumunu kuruyor.
set -euo pipefail
cd "$(dirname "$0")/.."

node tools/migrate-archive.mjs .cases/migrate.sql >/dev/null
npx wrangler d1 execute haber --local --command \
  "DELETE FROM article_tags; DELETE FROM article_sources; DELETE FROM articles;" >/dev/null 2>&1
npx wrangler d1 execute haber --local --file .cases/migrate.sql >/dev/null 2>&1

node tools/parity-page.mjs "$@"
