import assert from "node:assert/strict";
import { TECHNOLOGY_CATEGORIES, normalizeSourceUrl, validateTechnologyArticle } from "../src/technology-contract.ts";

const good = {
  metin: "# Yapay zekâ sistemlerinde yeni bir gelişme\n\nŞirket yeni sürümünü duyurdu. Bu duyuru, sistemin daha verimli çalışmasını sağlayan teknik değişiklikleri ve yaygın erişim planını açıklıyor.\n\nGüncellemenin ilk aşamada belirli kullanıcılara açılması bekleniyor.",
  kategori: "yapay-zeka",
  kaynaklar: ["https://www.example.com/news?utm_source=feed#detail"],
};
const parsed = validateTechnologyArticle(good);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.article.baslik, "Yapay zekâ sistemlerinde yeni bir gelişme");
assert.equal(parsed.article.kategori, "yapay-zeka");
assert.equal(parsed.article.sources[0].name, "example.com");
assert.equal(parsed.article.kaynaklar[0], "https://www.example.com/news");
assert.equal(parsed.article.ozet.startsWith("Şirket yeni sürümünü duyurdu"), true);
assert.equal(TECHNOLOGY_CATEGORIES.length, 6);

const rejects = [
  [{ ...good, author: "Nyx AI" }, "izin verilmeyen alan: author"],
  [{ ...good, heroPrompt: "..." }, "izin verilmeyen alan: heroPrompt"],
  [{ ...good, kategori: "Siyaset" }, "kategori geçerli"],
  [{ ...good, kaynaklar: [] }, "kaynaklar 1-8"],
  [{ ...good, kaynaklar: ["javascript:alert(1)"] }, "güvenli HTTP(S)"],
  [{ ...good, kaynaklar: ["http://localhost/admin"] }, "güvenli HTTP(S)"],
  [{ ...good, kaynaklar: ["http://192.168.1.2/private"] }, "güvenli HTTP(S)"],
  [{ ...good, kaynaklar: ["https://example.com", "https://example.com#h"] }, "aynı kaynak"],
  [{ ...good, metin: good.metin.replace("# Yapay", "Yapay") }, "ilk satırı"],
  [{ ...good, metin: good.metin + "\n\n<script>alert('x')</script>" }, "ham HTML"],
];
for (const [payload, expected] of rejects) {
  const result = validateTechnologyArticle(payload);
  assert.ok(result.errors.some((x) => x.includes(expected)), `bekleniyordu: ${expected}, alınan: ${result.errors}`);
}
assert.equal(normalizeSourceUrl("https://example.com/?utm_source=a#x"), "https://example.com/");
console.log("Technology publication contract: 13 cases passed");
