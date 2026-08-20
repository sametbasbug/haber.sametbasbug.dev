/* Slug üretimini Python'a karşı sınar.
 *
 * Referans dosya ADI DEĞİL, Python `slugify`'ın çıktısıdır. Arşivdeki 587
 * dosyanın yalnız 348'i bugünkü slugify ile uyuşuyor; kalanlar eski sistemden
 * kalma ve bir kısmı kaynağın İngilizce manşetinden türemiş (bu, `publish.py`
 * docstring'inde anlatılan bilinen bir geçmiş). Dosya adını referans almak,
 * doğru çalışan bir çeviriyi hatalı gösterirdi. */
import { readFileSync } from "node:fs";
import { slugify } from "../src/index.ts";

const cases = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const failures = [];

for (const item of cases) {
  const got = slugify(item.title);
  if (got !== item.slug && failures.length < 6) {
    failures.push({ title: item.title.slice(0, 70), beklenen: item.slug, gelen: got });
  }
}

console.log(`vaka: ${cases.length}`);
if (failures.length) {
  console.error("\nSAPMA:");
  for (const f of failures) console.error(JSON.stringify(f, null, 1));
  process.exit(1);
}
console.log("Python slugify ile birebir.");
