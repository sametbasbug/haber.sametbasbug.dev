#!/usr/bin/env node
/* D1 -> git aynası (write-behind).
 *
 * Yayın artık D1'e yazıyor; site oradan okuyor. Bu betik D1'i `src/content/`
 * altındaki markdown arşivine yansıtıyor. Amaç git'i gerçek kaynak yapmak
 * DEĞİL — git burada arşiv ve kurtarma yolu:
 *   - D1 kaybolursa `worker/tools/migrate-archive.mjs` ile geri yüklenebilir,
 *   - statik derleme (acil fren) güncel içerikle çalışır,
 *   - içerik değişiklikleri sürüm geçmişinde okunabilir kalır.
 *
 * Ayna TAM yansımadır: D1'de olmayan haberin dosyası silinir. Tek yönlüdür,
 * D1'den markdown'a. Ters yön (markdown -> D1) migrate-archive'ın işi.
 *
 * Başarı ölçütü: içerik değişmediyse betiği koşmak çalışma ağacını
 * DEĞİŞTİRMEMELİ. Üretilen dosya elle yazılmış dosyayla bayt bayt aynı
 * olmalı; `git status` temiz kalmıyorsa biçimlendirme ayrışmış demektir.
 *
 * Kullanım:  node scripts/haber-ayna.mjs [--yerel] [--kuru]
 *   --yerel : uzak D1 yerine yerel veritabanını okur (testler için)
 *   --kuru  : dosya yazmaz, ne olacağını söyler
 *
 * `--yerel` kullanılırken veritabanı `worker/.wrangler/state` altından
 * okunuyor: denklik takımı yerel D1'i oradan dolduruyor ve wrangler'ın
 * varsayılan kalıcı dizini çalışılan dizine göre değiştiği için ikisi
 * aksi halde ayrı veritabanlarına bakıyor.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ARGS = process.argv.slice(2);
const YEREL = ARGS.includes("--yerel");
const KURU = ARGS.includes("--kuru");
const DIZIN = "src/content/equinoxHaber";
const CONFIG = "wrangler.ssr.jsonc";

/* Gövdeler büyük olduğu için sorgu sayfalanıyor: tek seferde bütün arşivi
 * istemek komut çıktısını gereksiz şişiriyor. */
function sorgula(sql) {
  const cikti = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "haber", YEREL ? "--local" : "--remote",
     ...(YEREL ? ["--persist-to", "worker/.wrangler/state"] : []),
     "--config", CONFIG, "--json", "--command", sql],
    { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(cikti.slice(cikti.indexOf("[")))[0].results;
}

/* Tarih biçimi arşivle aynı olmak zorunda: yerel saat ve +03:00 ofseti.
 * Türkiye 2016'dan beri kalıcı UTC+3, yaz saati uygulaması yok. */
function tarih(isoUtc) {
  const d = new Date(isoUtc);
  const y = new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString();
  return `${y.slice(0, 19)}+03:00`;
}

/* YAML dizge alıntılama — arşivin kuralıyla aynı.
 *
 * Varsayılan çift tırnak; ama değerin içinde çift tırnak varsa tek tırnağa
 * geçiliyor (tek tırnaklı YAML'de kaçış yok, yalnız `'` iki kez yazılır).
 * Bu tercih keyfi değil: arşivdeki dosyalar da böyle yazılmış, ve ayna
 * onlarla bayt bayt aynı çıktı üretmek zorunda. */
function q(s) {
  const v = String(s);
  if (v.includes('"')) return `'${v.replace(/'/g, "''")}'`;
  return `"${v.replace(/\\/g, "\\\\")}"`;
}

function markdownUret(a, etiketler, kaynaklar) {
  const s = [];
  s.push("---");
  s.push(`title: ${q(a.title)}`);
  s.push(`description: ${q(a.description)}`);
  s.push(`pubDate: '${tarih(a.pub_date)}'`);
  s.push(`updatedDate: '${tarih(a.updated_date)}'`);
  s.push(`heroImage: ${q(a.hero_image ?? "")}`);
  if (a.hero_alt) s.push(`heroAlt: ${q(a.hero_alt)}`);
  s.push(`isDraft: ${a.is_draft ? "true" : "false"}`);
  s.push(`tags: [${etiketler.map(q).join(", ")}]`);
  s.push(`author: ${q(a.author)}`);
  s.push(`category: ${q(a.category)}`);
  s.push(`breaking: ${a.breaking ? "true" : "false"}`);
  if (a.editor_pick) s.push("editorPick: true");
  s.push("sources:");
  for (const k of kaynaklar) {
    s.push(`  - name: ${q(k.name)}`);
    s.push(`    url: ${q(k.url)}`);
  }
  s.push(`autoGlossaryLinks: ${a.auto_glossary_links ? "true" : "false"}`);
  s.push("---");
  s.push("");
  return s.join("\n") + "\n" + a.body_md.replace(/\s*$/, "") + "\n";
}

const toplam = sorgula("SELECT COUNT(*) n FROM articles")[0].n;
const makaleler = [];
const ADIM = 60;
for (let off = 0; off < toplam; off += ADIM) {
  makaleler.push(...sorgula(
    "SELECT slug,title,description,category,author,body_md,hero_image,hero_alt," +
    "pub_date,updated_date,is_draft,breaking,editor_pick,auto_glossary_links " +
    `FROM articles ORDER BY slug LIMIT ${ADIM} OFFSET ${off}`));
}
const etiketSatir = sorgula("SELECT slug,tag FROM article_tags ORDER BY slug,position");
const kaynakSatir = sorgula("SELECT slug,name,url FROM article_sources ORDER BY slug,position");

const etiketler = new Map(), kaynaklar = new Map();
for (const r of etiketSatir) { if (!etiketler.has(r.slug)) etiketler.set(r.slug, []); etiketler.get(r.slug).push(r.tag); }
for (const r of kaynakSatir) { if (!kaynaklar.has(r.slug)) kaynaklar.set(r.slug, []); kaynaklar.get(r.slug).push(r); }

let yazilan = 0, degismeyen = 0, sadeceSonBosluk = 0, farkliIcerik = 0;
const beklenen = new Set();
for (const a of makaleler) {
  const yol = join(DIZIN, `${a.slug}.md`);
  beklenen.add(`${a.slug}.md`);
  const yeni = markdownUret(a, etiketler.get(a.slug) ?? [], kaynaklar.get(a.slug) ?? []);
  /* Önce `existsSync` sorup sonra okumak iki ayrı sistem çağrısı: arada
   * dosya kaybolursa okuma patlar. Doğrudan okuyup ENOENT'i yokluk sayıyoruz
   * — tek çağrı, yarış yok (js/file-system-race). Diğer hatalar yutulmuyor:
   * izin hatasını "dosya yok" saymak, arşivi sessizce yeniden yazdırırdı. */
  let eski = null;
  try {
    eski = readFileSync(yol, "utf-8");
  } catch (hata) {
    if (hata.code !== "ENOENT") throw hata;
  }
  if (eski === yeni) { degismeyen++; continue; }
  if (eski !== null && eski.trimEnd() === yeni.trimEnd()) sadeceSonBosluk++;
  else if (eski !== null) { farkliIcerik++; if (farkliIcerik <= 5) console.log(`  İÇERİK FARKI: ${a.slug}`); }
  if (!KURU) writeFileSync(yol, yeni);
  yazilan++;
}

const fazla = readdirSync(DIZIN).filter((f) => f.endsWith(".md") && !beklenen.has(f));
for (const f of fazla) { if (!KURU) unlinkSync(join(DIZIN, f)); console.log(`  silindi: ${f}`); }

console.log(`\nD1: ${toplam} haber · yazılan ${yazilan} · değişmeyen ${degismeyen} · silinen ${fazla.length}${KURU ? "  (KURU ÇALIŞMA)" : ""}`);
if (yazilan) console.log(`  yalnız son boşlukta farklı: ${sadeceSonBosluk} · gerçek içerik farkı: ${farkliIcerik}`);
if (yazilan === 0 && fazla.length === 0) console.log("Ayna zaten güncel.");
