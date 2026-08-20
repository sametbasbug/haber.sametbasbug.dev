/* Sayfa denkliği: D1'den üretilen sayfa ile statik derlemenin ürettiği sayfa.
 *
 * `parity-render.mjs` yalnız gövdeyi karşılaştırıyor; buradaki soru bütün
 * sayfa: şablon, ilgili haberler, önceki/sonraki, JSON-LD, meta etiketler.
 * Amaç `NewsLayout`'u D1 için ikinci kez yazmaktan kaçınmanın gerçekten
 * işe yaradığını göstermek.
 *
 * Çalışan SSR sunucusu ister (`haber-site-ssr`, 8790) ve `dist/` içinde güncel
 * bir statik derleme.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:8790";
const limit = Number(process.argv[3] ?? Infinity);
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const slugs = readdirSync(`${ROOT}src/content/equinoxHaber`)
  .filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));

/* Kaçınılmaz farklar, tek tek gerekçeli:
 *
 * - `data-astro-cid-*`: Astro'nun kapsamlı CSS kimlikleri. İki derleme ayrı
 *   yapıldığı için karma değerleri farklı olabiliyor; görünen çıktıyı
 *   etkilemiyor.
 * - `/_astro/*.css|js` dosya adlarındaki içerik karmaları: aynı sebep.
 * - `globalThis.process??={}` öneki: Cloudflare adaptörünün satır içi
 *   betiklere eklediği polyfill. Derleme aracının eklentisi; sayfanın
 *   içeriğiyle, düzeniyle veya davranışıyla ilgisi yok.
 *
 * `&` kaçışı için normalizasyon YOK ve olmamalı: site de Worker da artık
 * `unified` kullanıyor, yani o fark kaynağında ortadan kalktı. Buraya bir
 * normalizasyon eklemek, iki işlemcinin yeniden ayrıştığını gizlerdi.
 */
const normalize = (html) => html
  .replaceAll(/data-astro-cid-[a-z0-9]+/gu, "data-astro-cid-X")
  .replaceAll(/\/_astro\/([A-Za-z0-9_.-]+?)\.[A-Za-z0-9_-]{8}\.(css|js)/gu, "/_astro/$1.X.$2")
  .replaceAll("globalThis.process??={},globalThis.process.env??={};", "");

let checked = 0, skipped = 0;
const failures = [];

for (const slug of slugs.slice(0, limit)) {
  const distPath = `${ROOT}dist/${slug}/index.html`;
  if (!existsSync(distPath)) { skipped += 1; continue; }

  const response = await fetch(`${BASE}/${slug}/`);
  if (!response.ok) {
    failures.push({ slug, sorun: `SSR ${response.status}` });
    continue;
  }

  const fromD1 = normalize(await response.text());
  const fromStatic = normalize(readFileSync(distPath, "utf-8"));

  if (fromD1 !== fromStatic) {
    if (failures.length < 3) {
      let i = 0;
      while (i < fromD1.length && i < fromStatic.length && fromD1[i] === fromStatic[i]) i += 1;
      failures.push({
        slug, ilkAyrim: i,
        statik: fromStatic.slice(Math.max(0, i - 70), i + 110),
        d1: fromD1.slice(Math.max(0, i - 70), i + 110),
      });
    } else if (failures.length < 40) {
      failures.push({ slug, sorun: "ayrışıyor" });
    }
  }
  checked += 1;
}

console.log(`karşılaştırılan: ${checked} · atlanan: ${skipped} · ayrışan: ${failures.length}`);
if (failures.length) {
  console.error("\nSAPMA:");
  for (const f of failures.slice(0, 3)) console.error(JSON.stringify(f, null, 1));
  if (failures.length > 3) console.error(`… ve ${failures.length - 3} tane daha`);
  process.exit(1);
}
console.log("D1'den ve koleksiyondan üretilen sayfalar birebir aynı.");
