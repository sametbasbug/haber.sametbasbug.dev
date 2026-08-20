/* Render-on-write çıktısını CANLI `dist/` çıktısına karşı sınar.
 *
 * Karşılaştırma kaynağı bilerek Astro'nun kendi build çıktısı: amaç "aynı
 * paketi çağırdım mı" değil, "D1'den gelen haber arşivdeki 587 haberle aynı
 * görünüyor mu". İkincisi için tek dürüst referans diskteki HTML. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderBody } from "../src/render.ts";

// Yollar depo köküne göre çözülüyor: harness hangi dizinden çağrılırsa
// çağrılsın aynı dosyalara bakmalı.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CONTENT = `${ROOT}src/content/equinoxHaber`;
const DIST = `${ROOT}dist`;

/** Frontmatter'ı ayırır; Astro'nun içerik koleksiyonuna verdiği gövde budur. */
function bodyOf(markdown) {
  const m = /^---\n[\s\S]*?\n---\n/.exec(markdown);
  return m ? markdown.slice(m[0].length) : markdown;
}

/** `<div class="article-prose" …>` etiketinin iç HTML'i; iç içe div'ler
 *  dengelenerek. */
function proseOf(html) {
  const open = html.indexOf('<div class="article-prose"');
  if (open === -1) return null;
  const bodyStart = html.indexOf(">", open) + 1;

  let depth = 1, i = bodyStart;
  const tag = /<\/?div\b/g;
  tag.lastIndex = bodyStart;
  let match;
  while ((match = tag.exec(html)) !== null) {
    depth += match[0][1] === "/" ? -1 : 1;
    if (depth === 0) { i = match.index; break; }
  }
  return html.slice(bodyStart, i);
}

const slugs = readdirSync(CONTENT).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
const limit = Number(process.argv[2] ?? slugs.length);

let checked = 0, skipped = 0;
const failures = [];

for (const slug of slugs.slice(0, limit)) {
  const distPath = `${DIST}/${slug}/index.html`;
  if (!existsSync(distPath)) { skipped += 1; continue; }

  const prose = proseOf(readFileSync(distPath, "utf-8"));
  if (prose === null) { skipped += 1; continue; }

  const mine = await renderBody(bodyOf(readFileSync(`${CONTENT}/${slug}.md`, "utf-8")));

  // dist içindeki gövde, sarmalayıcı etiketten sonra tek boşlukla başlıyor ve
  // kapanıştan önce tek boşlukla bitiyor (compressHTML). Bu sarmalayıcının
  // biçimlendirmesi, markdown çıktısının parçası değil.
  //
  // Tek normalize edilen fark: `&` kaçışının biçimi. Sitenin bugünkü işlemcisi
  // (`satteri`) `&amp;`, Worker'ınki (`unified`) `&#x26;` yazıyor. İkisi de
  // geçerli HTML ve tarayıcıda aynı karaktere çözülüyor; arşivde bu farkı
  // gösteren 182 haber var ve hepsinde tek sebep kaynak URL'indeki utm
  // parametreleri. Site de `unified()` işlemcisine alınırsa bu satır düşer.
  //
  // Kırpma YAPILMIYOR. Başlangıçta `.trim()` vardı ve sondaki satır sonu
  // farkını 587 haberin hepsinde gizliyordu; hata ancak tam sayfa
  // karşılaştırmasında ortaya çıktı. Şablonun kattığı tek boşluk baştan ve
  // sondan çıkarılıyor, geri kalan markdown çıktısının kendisi.
  const normalize = (value) => value.replaceAll("&#x26;", "&amp;");
  const inner = prose.replace(/^ /u, "").replace(/ $/u, "");

  if (normalize(inner) !== normalize(mine.html)) {
    if (failures.length < 3) {
      const a = normalize(inner), b = normalize(mine.html);
      let at = 0;
      while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
      failures.push({ slug, ilkAyrimIndex: at,
                      dist: a.slice(Math.max(0, at - 60), at + 90),
                      worker: b.slice(Math.max(0, at - 60), at + 90) });
    }
  }
  checked += 1;
}

console.log(`karşılaştırılan: ${checked} · atlanan: ${skipped}`);
if (failures.length) {
  console.error("\nSAPMA:");
  for (const f of failures) console.error(JSON.stringify(f, null, 2));
  process.exit(1);
}
console.log("Astro'nun canlı dist çıktısıyla birebir.");
