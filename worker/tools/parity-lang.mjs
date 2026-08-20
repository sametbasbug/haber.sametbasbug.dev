/* Dil kapısı çevirisini Python ölçümüne karşı sınar. */
import { readFileSync } from "node:fs";
import { measure, bodyIsTurkish, looksUntranslated } from "../src/lang.ts";

const cases = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const EPSILON = 1e-9;
const failures = [];
let worst = 0, bodies = 0, untranslated = 0;

for (const item of cases) {
  if (item.kind === "body") {
    bodies += 1;
    const m = measure(item.text);
    const verdict = bodyIsTurkish(item.text);
    const dEn = Math.abs(m.englishDensity - item.englishDensity);
    const dTr = Math.abs(m.turkishEvidence - item.turkishEvidence);
    worst = Math.max(worst, dEn, dTr);

    const bad =
      m.wordCount !== item.wordCount ||
      dEn > EPSILON || dTr > EPSILON ||
      verdict.ok !== item.ok ||
      verdict.reason !== item.reason;

    if (bad && failures.length < 4) {
      failures.push({
        kind: "body", text: item.text.slice(0, 90),
        beklenen: { wordCount: item.wordCount, en: item.englishDensity, tr: item.turkishEvidence, ok: item.ok, reason: item.reason },
        gelen: { wordCount: m.wordCount, en: m.englishDensity, tr: m.turkishEvidence, ok: verdict.ok, reason: verdict.reason },
      });
    }
  } else {
    untranslated += 1;
    const got = looksUntranslated(item.text, item.source);
    if ((got.untranslated !== item.untranslated || got.detail !== item.detail) && failures.length < 4) {
      failures.push({ kind: "untranslated", text: item.text.slice(0, 90), source: item.source.slice(0, 90),
                      beklenen: [item.untranslated, item.detail], gelen: [got.untranslated, got.detail] });
    }
  }
}

console.log(`gövde ölçümü: ${bodies} · çevrilmemişlik: ${untranslated}`);
console.log(`en büyük yoğunluk sapması: ${worst.toExponential(3)}`);

if (failures.length) {
  console.error("\nSAPMA:");
  for (const f of failures) console.error(JSON.stringify(f, null, 2));
  process.exit(1);
}
console.log("\nPython ölçümüyle birebir (sayı, karar ve gerekçe metni).");
