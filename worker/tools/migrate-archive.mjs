/* Arşivi D1'e göç ettirir.
 *
 * Kaynak `src/content/equinoxHaber/*.md`; gerçek kaynak hâlâ orada ve bu betik
 * onu değiştirmiyor. Üretilen SQL diske yazılıyor, doğrudan çalıştırılmıyor:
 * göç geri alınamaz bir iştir ve ne yazılacağının önce okunabilmesi gerekir.
 *
 * `body_html` göç anında üretiliyor — aynı renderer, aynı sürüm. Markdown'ı
 * saklayıp HTML'i sonra üretmek, arşivin bir kısmının render edilmemiş
 * kalabileceği bir ara durum yaratırdı.
 *
 * Kullanım:
 *   node tools/migrate-archive.mjs .cases/migrate.sql
 *   npx wrangler d1 execute haber --local --file .cases/migrate.sql
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { renderBody, RENDER_VERSION } from "../src/render.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CONTENT = `${ROOT}src/content/equinoxHaber`;
const out = process.argv[2] ?? ".cases/migrate.sql";

/** SQLite metin sabiti. Tek tırnak ikileniyor; başka kaçış yok ve olmamalı —
 *  bu dosya `wrangler d1 execute --file` ile çalışacak. */
const q = (value) =>
  value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

const files = readdirSync(CONTENT).filter((f) => f.endsWith(".md")).sort();
const statements = [];
const skipped = [];
let drafts = 0;

for (const file of files) {
  const slug = file.slice(0, -3);
  const raw = readFileSync(`${CONTENT}/${file}`, "utf-8");
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!match) { skipped.push(`${slug}: frontmatter yok`); continue; }

  const data = parseYaml(match[1]);

  /* Gövde kırpılıyor çünkü Astro'nun içerik koleksiyonu `entry.body`'yi
     kırpılmış veriyor ve `rss.xml.ts` onu doğrudan `content:encoded` içine
     yazıyor. Kırpmazsak RSS iki modda farklı çıkar. Bu kural varsayılmadı:
     statik RSS çıktısından geri okundu (`.strip()` ile birebir eşleşiyor).
     Markdown açısından baştaki/sondaki boş satır anlamsız, yani üretilen
     HTML değişmiyor. */
  const body = raw.slice(match[0].length).trim();

  /* Taslaklar da taşınıyor. Atlamak, arşivde var olan bir şeyi sessizce
     kaybetmek olurdu; `is_draft` alanı zaten ayrımı taşıyor. */
  if (data.isDraft) drafts += 1;

  const rendered = await renderBody(body);

  const pubDate = new Date(data.pubDate).toISOString();
  const updated = data.updatedDate ? new Date(data.updatedDate).toISOString() : pubDate;

  /* `origin_url` benzersiz indeksli ve tekrar yayın kapısı ona bakıyor.
     Arşivdeki ilk kaynak, adayın kendi yayınıdır. */
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const originUrl = sources[0]?.url ?? null;

  statements.push(
    `INSERT INTO articles (slug,title,description,category,author,body_md,body_html,render_version,` +
    `hero_image,hero_alt,pub_date,updated_date,is_draft,breaking,editor_pick,origin_url,created_at,updated_at) VALUES (` +
    [q(slug), q(data.title), q(data.description), q(data.category ?? "Teknoloji"), q(data.author ?? "Asteria AI"),
     q(body), q(rendered.html), RENDER_VERSION,
     q(data.heroImage ?? null), q(data.heroAlt ?? null), q(pubDate), q(updated),
     data.isDraft ? 1 : 0, data.breaking ? 1 : 0, data.editorPick ? 1 : 0,
     q(originUrl), q(pubDate), q(updated)].join(",") + ");",
  );

  (data.tags ?? []).forEach((tag, i) => {
    statements.push(`INSERT INTO article_tags (slug,tag,position) VALUES (${q(slug)},${q(tag)},${i});`);
  });
  sources.forEach((source, i) => {
    statements.push(`INSERT INTO article_sources (slug,position,name,url) VALUES (${q(slug)},${i},${q(source.name)},${q(source.url)});`);
  });
}

/* Göç de bir içerik değişikliğidir ve önbelleği geçersizleştirmek zorunda.
 * `publish()` sürümü kendi artırıyor; `publish()` DIŞINDAN yapılan her
 * değişiklik — göç, silme, elle düzeltme — bunu kendisi yapmalı. Unutulursa
 * belirti şu olur: veritabanı doğru, sayfa eski. */
statements.push(
  "UPDATE site_state SET content_version = content_version + 1, updated_at = datetime('now') WHERE id = 1;",
);

writeFileSync(out, statements.join("\n") + "\n");

console.log(`haber: ${files.length} · taslak: ${drafts} · ifade: ${statements.length}`);
console.log(`SQL: ${out} (${(readFileSync(out).length / 1024 / 1024).toFixed(1)} MB)`);
if (skipped.length) console.warn(`atlanan: ${skipped.length}\n  ${skipped.join("\n  ")}`);
