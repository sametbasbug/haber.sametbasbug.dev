/* Kabul kapısı çevirisini Python kararlarına karşı sınar.
 * Yalnız kabul/ret değil, hata kodları ve mesaj metinleri de karşılaştırılıyor:
 * operatöre neyin düştüğünü söyleyen şey o metin. */
import { readFileSync } from "node:fs";
import { validate } from "../src/accept.ts";

const cases = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const failures = [];
let withErrors = 0;

for (const item of cases) {
  const got = validate(item.payload, item.brief);
  if (item.errors.length > 0) withErrors += 1;

  const expected = item.errors.map((e) => `${e.candidate_id ?? "null"}|${e.code}|${e.message}`).sort();
  const actual = got.errors.map((e) => `${e.candidateId ?? "null"}|${e.code}|${e.message}`).sort();

  const bad =
    got.accepted.length !== item.accepted ||
    got.declinedReason !== item.declinedReason ||
    expected.length !== actual.length ||
    expected.some((v, i) => v !== actual[i]);

  if (bad && failures.length < 5) {
    failures.push({ label: item.label,
                    beklenen: { accepted: item.accepted, declined: item.declinedReason, errors: expected },
                    gelen: { accepted: got.accepted.length, declined: got.declinedReason, errors: actual } });
  }
}

console.log(`vaka: ${cases.length} · hata üreten: ${withErrors}`);
if (failures.length) {
  console.error("\nSAPMA:");
  for (const f of failures) console.error(JSON.stringify(f, null, 2));
  process.exit(1);
}
console.log("Python kararlarıyla birebir (kabul sayısı, gerekçe, hata kodu ve mesaj).");
