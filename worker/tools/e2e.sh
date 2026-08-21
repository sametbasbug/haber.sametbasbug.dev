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
  "DELETE FROM article_tags; DELETE FROM article_sources; DELETE FROM articles; DELETE FROM briefs;
   UPDATE site_state SET content_version = content_version + 1 WHERE id = 1;" \
  >/dev/null 2>&1

# Yayıncı anahtarı vakaları için iki kimlik: biri açık, biri kapatılmış.
# Anahtarın kendisi saklanmıyor, yalnız SHA-256 özeti — üretimdeki davranışın
# aynısı sınansın diye testte de öyle.
npx wrangler d1 execute haber --local --command \
  "DELETE FROM publishers;
   INSERT INTO publishers (subject,author,may_write_brief,may_publish,key_digest,created_at)
     VALUES ('e2e-acik','Selene AI',1,1,'6dcd714a7a0d23e2266585d41e39b24a739bb7cef853f2a54367861705e50d2e','2026-08-21T00:00:00+03:00');
   INSERT INTO publishers (subject,author,may_write_brief,may_publish,key_digest,disabled_at,created_at)
     VALUES ('e2e-kapali','Asteria AI',1,1,'155a6daec5ac3b06002960ba0d6c5c86dd6f8cdea1862bad74e8318d376c58f2','2026-08-21T00:00:00+03:00','2026-08-21T00:00:00+03:00');" \
  >/dev/null 2>&1

node tools/e2e.mjs "$@"
