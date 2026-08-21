/* Çalışan Worker'a karşı uçtan uca sınama.
 *
 * `npm run parity` çeviriyi Python'a karşı ölçüyor; bu takım ayrı bir soruyu
 * soruyor: uçlar, kimlik, pano yaşam döngüsü ve yazma yolu birlikte doğru
 * davranıyor mu. Her vaka kendi taze panosunu ve kendi başlığını alır —
 * paylaşılan durum yüzünden bir vakanın diğerini maskelemesi, bu takımın ilk
 * turunda fiilen başıma geldi.
 *
 * Kullanım:  node tools/e2e.mjs [taban-url]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:8790";
const TOKEN = process.env.DEV_PUBLISH_TOKEN ?? "yerel-gelistirme-tokeni-degistirilecek";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

const corpus = readFileSync(`${ROOT}newsroom/tests/corpus/published.jsonl`, "utf-8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

let counter = 0;
/** Her vaka için benzersiz başlık: tekrar yayın kapısı vakaları birbirine
 *  karıştırmasın. Gövde gerçek bir yayından geliyor ki dil ve derinlik
 *  kapıları gerçekten ölçülsün. */
function selection(overrides = {}) {
  counter += 1;
  const row = corpus[counter % corpus.length];
  return {
    candidateId: "c1",
    title: `Deneme ${counter} ${row.title}`.slice(0, 120),
    description: row.description,
    category: row.category,
    body: row.body,
    tags: row.tags,
    heroPrompt: "soyut görsel yönergesi",
    heroAlt: "Görseli anlatan Türkçe alt metin",
    heroQuery: "abstract stock terms",
    ...overrides,
  };
}

async function newBrief(overrides = {}) {
  const brief = {
    task: { selectCount: 1 },
    board: [{
      id: "c1",
      source: "TechCrunch",
      url: `https://techcrunch.com/2026/08/20/deneme-${counter}-${Math.random().toString(36).slice(2)}/`,
      title: "An English source headline that must be translated",
    }],
    policy: { fingerprint: "d311041a7e5a" },
    ...overrides,
  };
  const response = await fetch(`${BASE}/api/brief`, {
    method: "POST", headers: auth, body: JSON.stringify(brief),
  });
  return { status: response.status, body: await response.json() };
}

async function post(path, body, headers = auth) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const results = [];
function check(label, actual, expected, detail = "") {
  const ok = actual === expected;
  results.push({ ok, label, actual, expected, detail });
  console.log(`${ok ? "  ok  " : "FAIL  "}${label.padEnd(38)} ${actual} (beklenen ${expected}) ${detail}`);
}

function firstProblem(body) {
  const list = body?.problems ?? body?.contractErrors;
  if (Array.isArray(list) && list.length > 0) {
    return typeof list[0] === "string" ? list[0] : `${list[0].code}`;
  }
  return body?.error ?? "";
}

console.log("── kimlik ──");
check("token yok", (await post("/api/publish", {}, { "content-type": "application/json" })).status, 401);
check("yanlış token", (await post("/api/publish", {}, { authorization: "Bearer yanlis", "content-type": "application/json" })).status, 401);

console.log("\n── pano ──");
check("board'suz pano", (await post("/api/brief", { task: {} })).status, 400);
const good = await newBrief();
check("pano yazımı", good.status, 201, good.body.briefId ? "" : "briefId yok!");

console.log("\n── pano yaşam döngüsü ──");
check("briefId eksik", (await post("/api/publish", { selections: [selection()] })).status, 400);
check("bilinmeyen pano", (await post("/api/publish", { briefId: "00000000-0000-0000-0000-000000000000", selections: [selection()] })).status, 404);

{
  const brief = await newBrief();
  const first = await post("/api/publish", { briefId: brief.body.briefId, selections: [selection()] });
  check("yayın", first.status, 201, first.body?.published?.[0]?.slug?.slice(0, 28) ?? firstProblem(first.body));
  const second = await post("/api/publish", { briefId: brief.body.briefId, selections: [selection()] });
  check("aynı pano ikinci kez", second.status, 409, firstProblem(second.body));
}

{
  // Seçim yapılmaması hata değil ama panoyu tüketir.
  const brief = await newBrief();
  const declined = await post("/api/publish", { briefId: brief.body.briefId, selections: [], note: "yayımlanabilir aday yok" });
  check("seçim yok", declined.status, 200, declined.body?.declinedReason ?? "");
  const reuse = await post("/api/publish", { briefId: brief.body.briefId, selections: [selection()] });
  check("seçim yok sonrası pano", reuse.status, 409, firstProblem(reuse.body));
}

console.log("\n── kabul sözleşmesi ──");
for (const [label, overrides, code] of [
  ["kısa gövde", { body: "Kısa.\n\nİki.\n\nÜç." }, "body_truncated"],
  ["geçersiz kategori", { category: "Magazin" }, "bad_category"],
  ["az etiket", { tags: ["tek"] }, "too_few_tags"],
  ["çok etiket", { tags: ["a","b","c","d","e","f","g"] }, "too_many_tags"],
  ["madde işareti", { body: corpus[0].body + "\n\n- bir\n- iki" }, "bullet_list"],
  ["panoda olmayan aday", { candidateId: "yok" }, "unknown_candidate"],
  ["iç not sızıntısı", { heroAlt: "manual-review bekliyor" }, "internal_leak"],
  ["kısa description", { description: "Kısa." }, "description_too_short"],
]) {
  const brief = await newBrief();
  const response = await post("/api/publish", { briefId: brief.body.briefId, selections: [selection(overrides)] });
  check(label, response.status, 422, firstProblem(response.body) === code ? code : `!! ${firstProblem(response.body)}`);
}

console.log("\n── hero ──");
{
  const brief = await newBrief();
  const response = await post("/api/publish", {
    briefId: brief.body.briefId, selections: [selection()],
    heroWebpBase64: Buffer.from("bu bir webp degil").toString("base64"),
  });
  check("hero WebP değil", response.status, 400, firstProblem(response.body));
}
{
  const brief = await newBrief();
  const response = await post("/api/publish", {
    briefId: brief.body.briefId, selections: [selection()],
    heroWebpBase64: "A".repeat(1_500_000),
  });
  check("hero çok büyük", response.status, 413, firstProblem(response.body));
}
{
  // Gerçek WebP: yayın geçmeli ve görsel okunabilir olmalı.
  const { readdirSync } = await import("node:fs");
  const dir = `${ROOT}public/images/generated/equinox-haber`;
  const webp = readdirSync(dir).find((f) => f.endsWith(".webp"));
  const bytes = readFileSync(`${dir}/${webp}`);
  const brief = await newBrief();
  const response = await post("/api/publish", {
    briefId: brief.body.briefId, selections: [selection()],
    heroWebpBase64: bytes.toString("base64"),
  });
  check("gerçek hero ile yayın", response.status, 201, `${(bytes.length/1024)|0} KB`);
  const heroUrl = response.body?.published?.[0]?.heroImage;
  if (heroUrl) {
    const image = await fetch(`${BASE}${heroUrl}`);
    check("hero okunabiliyor", image.status, 200, image.headers.get("content-type") ?? "");
    check("hero baytları aynı", (await image.arrayBuffer()).byteLength, bytes.length);
  }
}

console.log("\n── tekrar yayın ──");
{
  const title = `Tekrar denemesi ${Date.now()} bir haber başlığı`;
  const brief1 = await newBrief();
  const first = await post("/api/publish", { briefId: brief1.body.briefId, selections: [selection({ title })] });
  check("ilk yayın", first.status, 201);
  const brief2 = await newBrief();
  const again = await post("/api/publish", { briefId: brief2.body.briefId, selections: [selection({ title })] });
  check("aynı başlık ikinci kez", again.status, 409, firstProblem(again.body));

  /* Aynı başlık aynı slug'ı ürettiği için yukarıdaki vaka slug kapısına
   * takılıyor ve başlık benzerliği kapısını hiç sınamıyor. Benzer ama aynı
   * olmayan bir başlık gerekiyor: sözcük sırası değişik, bir sözcük eksik.
   * `token_set_ratio` bunu 82 eşiğinin üstünde görmeli. */
  const brief3 = await newBrief();
  const shuffled = title.split(" ").slice(0, -1).reverse().join(" ") + " ek";
  const similar = await post("/api/publish", { briefId: brief3.body.briefId, selections: [selection({ title: shuffled })] });
  check("benzer başlık", similar.status, 409, firstProblem(similar.body));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} geçti`);
if (failed.length > 0) { console.error("düşenler: " + failed.map((f) => f.label).join(", ")); process.exit(1); }
