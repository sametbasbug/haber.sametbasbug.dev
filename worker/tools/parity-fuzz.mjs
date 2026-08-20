/* TypeScript çevirisini rapidfuzz'ın gerçek çıktısına karşı sınar.
 * Tek bir sapma testi düşürür: bu kapıların eşikleri ampirik seçildi ve
 * yaklaşık bir benzerlik ölçüsü onları sessizce kaydırır. */
import { readFileSync } from "node:fs";
import { tokenSetRatio, ratio } from "../src/fuzz.ts";

const cases = JSON.parse(readFileSync(process.argv[2], "utf-8"));

// Python float ile JS number aynı IEEE-754 çift duyarlığı kullanıyor, ama
// işlem sırası farkı son bitte oynayabilir. Eşik karşılaştırması tam sayı
// mertebesinde olduğu için 1e-9 fazlasıyla dar.
const EPSILON = 1e-9;

let worstTsr = 0, worstRatio = 0, failures = [];

for (const item of cases) {
  const gotTsr = tokenSetRatio(item.a, item.b);
  const gotRatio = ratio(item.a, item.b);
  const dTsr = Math.abs(gotTsr - item.tsr);
  const dRatio = Math.abs(gotRatio - item.ratio);
  worstTsr = Math.max(worstTsr, dTsr);
  worstRatio = Math.max(worstRatio, dRatio);
  if (dTsr > EPSILON || dRatio > EPSILON) {
    if (failures.length < 5) {
      failures.push({ a: item.a, b: item.b, beklenen: item.tsr, gelen: gotTsr, beklenenRatio: item.ratio, gelenRatio: gotRatio });
    }
  }
}

console.log(`vaka: ${cases.length}`);
console.log(`en büyük sapma  token_set_ratio: ${worstTsr.toExponential(3)}`);
console.log(`en büyük sapma  ratio:           ${worstRatio.toExponential(3)}`);

if (failures.length) {
  console.error("\nSAPMA:");
  for (const f of failures) console.error(JSON.stringify(f, null, 2));
  process.exit(1);
}
console.log("\nrapidfuzz ile birebir.");
