/* Orbit kimliğiyle uçtan uca: gerçek ağ, gerçek imza, gerçek yetki tablosu.
 *
 * `orbit-token-tests.mjs` kriptoyu ve iddiaları sınıyor; buradaki soru farklı:
 * Worker gerçek bir sağlayıcıdan anahtar çekip, kimliği doğrulayıp, YETKİYİ
 * kendi tablosundan okuyor mu. Orbit kim olduğunu söyler, ne yapabileceğini
 * bu taraf söyler — ayrımın çalıştığı burada görülüyor.
 */
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:8788";
const tokens = JSON.parse(readFileSync(new URL("../.cases/orbit-tokens.json", import.meta.url), "utf-8"));

const results = [];
function check(label, actual, expected, detail = "") {
  const ok = actual === expected;
  results.push({ ok, label });
  console.log(`${ok ? "  ok  " : "FAIL  "}${label.padEnd(38)} ${String(actual).padEnd(5)} (beklenen ${expected}) ${detail}`);
}

async function call(path, token, body) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const board = () => ({
  task: { selectCount: 1 },
  board: [{ id: "c1", source: "TechCrunch", title: "An English source headline",
            url: `https://techcrunch.com/2026/08/20/orbit-${Math.random().toString(36).slice(2)}/` }],
});

console.log("── Orbit modunda paylaşılan sır ──");
{
  // ORBIT_ISSUER tanımlıyken geliştirme tokeni kabul EDİLMEMELİ; yoksa
  // üretimde unutulan bir sır arka kapı olurdu.
  const r = await call("/api/brief", "yerel-gelistirme-tokeni-degistirilecek", board());
  check("dev token reddediliyor", r.status, 401, r.body?.error ?? "");
}

console.log("\n── token doğrulama (ağ üzerinden) ──");
check("token yok", (await call("/api/brief", null, board())).status, 401);
{
  const r = await call("/api/brief", tokens.suresiDolmus, board());
  check("süresi dolmuş", r.status, 401, r.body?.error ?? "");
}
{
  const r = await call("/api/brief", tokens.baskaSite, board());
  check("başka site için verilmiş", r.status, 401, r.body?.error ?? "");
}
{
  const t = tokens.gecerli;
  const bozuk = t.slice(0, -1) + (t.at(-1) === "A" ? "B" : "A");
  const r = await call("/api/brief", bozuk, board());
  check("bozulmuş imza", r.status, 401, r.body?.error ?? "");
}

console.log("\n── yetkilendirme (haber'in kendi tablosu) ──");
{
  const r = await call("/api/brief", tokens.listedeYok, board());
  check("kimlik doğru, listede yok", r.status, 403, r.body?.error ?? "");
}
{
  const r = await call("/api/brief", tokens.kapatilmis, board());
  check("erişimi kapatılmış kimlik", r.status, 403, r.body?.error ?? "");
}

console.log("\n── geçerli kimlikle tam akış ──");
{
  const brief = await call("/api/brief", tokens.gecerli, board());
  check("pano yazımı", brief.status, 201, brief.body?.briefId ? "briefId alındı" : "briefId YOK");

  const corpus = readFileSync(new URL("../../newsroom/tests/corpus/published.jsonl", import.meta.url), "utf-8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const row = corpus[7];

  const publish = await call("/api/publish", tokens.gecerli, {
    briefId: brief.body.briefId,
    // İmza kasten yanlış yollanıyor: yükten gelen yazar YOK SAYILMALI.
    author: "Asteria AI",
    selections: [{
      candidateId: "c1",
      title: `Orbit akışı ${Date.now()} ${row.title}`.slice(0, 118),
      description: row.description, category: row.category, body: row.body, tags: row.tags,
      heroPrompt: "yönerge", heroAlt: "alt metin", heroQuery: "abstract",
    }],
  });
  check("yayın", publish.status, 201, publish.body?.published?.[0]?.slug?.slice(0, 30) ?? JSON.stringify(publish.body).slice(0, 80));
  check("imza kimlikten geliyor", publish.body?.published?.[0]?.author, "Selene AI", "(yükte 'Asteria AI' yazıyordu)");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} geçti`);
if (failed.length) { console.error("düşenler: " + failed.map((f) => f.label).join(", ")); process.exit(1); }
