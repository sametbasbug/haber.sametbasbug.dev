/* Orbit ID token doğrulamasını gerçek kriptoyla sınar.
 *
 * Anahtar burada üretiliyor, token burada imzalanıyor, doğrulama gerçek
 * WebCrypto ile yapılıyor. Sahte bir "doğrulandı" dönüşü yok: imza bozulunca
 * test düşmeli, yoksa bu katman güvenlik değil dekordur.
 *
 * `fetch` yerine geçen şey ağ çağrısını atlar ama keşif belgesi ve JWKS
 * AYRIŞTIRMASINI atlamaz — o kod gerçekten çalışıyor. Ağın kendisi ayrıca
 * `tools/e2e-orbit.sh` içinde çalışan Worker'a karşı sınanıyor.
 */
import { verifyOrbitToken } from "../src/identity.ts";

const ISSUER = "https://orbit.example.test";
const AUDIENCE = "haber.sametbasbug.dev";

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const encodeJson = (value) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function makeKey(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { kid, privateKey: pair.privateKey, jwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, kid, alg: "ES256", use: "sig" } };
}

const key = await makeKey("anahtar-1");
const otherKey = await makeKey("anahtar-2");   // JWKS'te YOK
const rotatedKey = await makeKey("anahtar-3"); // sonradan JWKS'e girecek

let published = [key.jwk];
let discoveryHits = 0, jwksHits = 0;

globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.endsWith("/.well-known/openid-configuration")) {
    discoveryHits += 1;
    return new Response(JSON.stringify({ issuer: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }), { status: 200 });
  }
  if (target.endsWith("/.well-known/jwks.json")) {
    jwksHits += 1;
    return new Response(JSON.stringify({ keys: published }), { status: 200 });
  }
  return new Response("yok", { status: 404 });
};

async function mint(signingKey, { header = {}, claims = {} } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = encodeJson({ alg: "ES256", typ: "JWT", kid: signingKey.kid, ...header });
  const body = encodeJson({ iss: ISSUER, sub: "orbit-sub-selene", aud: AUDIENCE, iat: now, exp: now + 600, ...claims });
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, signingKey.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

const results = [];
function check(label, actual, expected, detail = "") {
  const ok = actual === expected;
  results.push({ ok, label });
  console.log(`${ok ? "  ok  " : "FAIL  "}${label.padEnd(40)} ${String(actual).padEnd(34)} ${detail}`);
}
const outcome = (r) => ("subject" in r ? `sub=${r.subject}` : `${r.status} ${r.error}`);

console.log("── geçerli token ──");
{
  const r = await verifyOrbitToken(await mint(key), ISSUER, AUDIENCE);
  check("doğru imza kabul ediliyor", outcome(r), "sub=orbit-sub-selene");
}

console.log("\n── imza ──");
{
  const token = await mint(key);

  /* İmza BAYT düzeyinde bozuluyor, metnin son karakteri değiştirilerek değil.
   *
   * Bu test önce son karakteri "A" yapıyordu ve KARARSIZDI — beş koşumun
   * ikisinde düşüyordu. Sebep: ECDSA P-256 imzası 64 bayt, 64 = 3×21 + 1,
   * yani son base64 grubu tek bayt taşıyor. O grubun ikinci karakterinin
   * dört biti dolgu ve çözümde yok sayılıyor; geriye iki anlamlı bit
   * kalıyor. Yani 64 karakterin 16'sı ("A"–"P") aynı bayta çözülüyor.
   * Son karakter o aralıktaysa "A" yazmak HİÇBİR ŞEYİ değiştirmiyordu:
   * imza aynı kalıyor, doğrulama haklı olarak geçiyor, test düşüyordu.
   *
   * Testin kendisi kararsızdı, sınadığı kod değil. Ama kararsız bir güvenlik
   * testi, düştüğünde "gürültü" diye geçiştirilir ve bir gün gerçek bir
   * gerilemeyi de öyle geçiştirir. */
  const [h, p, s] = token.split(".");
  const baytlar = Buffer.from(s, "base64url");
  baytlar[0] ^= 0x01;
  const tampered = `${h}.${p}.${baytlar.toString("base64url")}`;
  if (tampered === token) throw new Error("bozma işe yaramadı: token değişmedi");

  const r = await verifyOrbitToken(tampered, ISSUER, AUDIENCE);
  check("bozulmuş imza reddediliyor", outcome(r), "401 imza doğrulanmadı");
}
{
  // Gövdeyi değiştir, imzayı olduğu gibi bırak — klasik saldırı.
  const token = await mint(key);
  const [h, , s] = token.split(".");
  const now = Math.floor(Date.now() / 1000);
  const forged = `${h}.${encodeJson({ iss: ISSUER, sub: "baskasi", aud: AUDIENCE, iat: now, exp: now + 600 })}.${s}`;
  const r = await verifyOrbitToken(forged, ISSUER, AUDIENCE);
  check("değiştirilmiş gövde reddediliyor", outcome(r), "401 imza doğrulanmadı");
}
{
  const r = await verifyOrbitToken(await mint(otherKey), ISSUER, AUDIENCE);
  check("bilinmeyen anahtar reddediliyor", outcome(r), "401 token bilinmeyen bir anahtarla imzalanmış");
}

console.log("\n── algoritma ──");
{
  const now = Math.floor(Date.now() / 1000);
  const head = encodeJson({ alg: "none", typ: "JWT", kid: key.kid });
  const body = encodeJson({ iss: ISSUER, sub: "saldirgan", aud: AUDIENCE, iat: now, exp: now + 600 });
  const r = await verifyOrbitToken(`${head}.${body}.`, ISSUER, AUDIENCE);
  check("alg:none reddediliyor", outcome(r), "401 beklenen imza ES256");
}
{
  const r = await verifyOrbitToken(await mint(key, { header: { alg: "HS256" } }), ISSUER, AUDIENCE);
  check("alg değiştirme reddediliyor", outcome(r), "401 beklenen imza ES256");
}
{
  const r = await verifyOrbitToken(await mint(key, { header: { kid: undefined } }), ISSUER, AUDIENCE);
  check("kid'siz token reddediliyor", outcome(r), "401 token kid taşımıyor");
}

console.log("\n── iddialar ──");
{
  const now = Math.floor(Date.now() / 1000);
  const r = await verifyOrbitToken(await mint(key, { claims: { exp: now - 3600 } }), ISSUER, AUDIENCE);
  check("süresi dolmuş reddediliyor", outcome(r), "401 token süresi dolmuş");
}
{
  const now = Math.floor(Date.now() / 1000);
  const r = await verifyOrbitToken(await mint(key, { claims: { exp: now - 30 } }), ISSUER, AUDIENCE);
  check("saat kayması toleransı", outcome(r), "sub=orbit-sub-selene", "(60 sn içinde kabul)");
}
{
  const r = await verifyOrbitToken(await mint(key, { claims: { aud: "baska-site.example" } }), ISSUER, AUDIENCE);
  check("başka site için verilmiş", outcome(r), "401 token bu site için verilmemiş");
}
{
  const r = await verifyOrbitToken(await mint(key, { claims: { aud: ["baska-site.example", AUDIENCE] } }), ISSUER, AUDIENCE);
  check("dizi aud kabul ediliyor", outcome(r), "sub=orbit-sub-selene");
}
{
  const r = await verifyOrbitToken(await mint(key, { claims: { iss: "https://sahte.example" } }), ISSUER, AUDIENCE);
  check("başka sağlayıcı reddediliyor", outcome(r), "401 token başka bir sağlayıcıdan");
}
{
  const now = Math.floor(Date.now() / 1000);
  const r = await verifyOrbitToken(await mint(key, { claims: { iat: now + 3600 } }), ISSUER, AUDIENCE);
  check("gelecekte verilmiş reddediliyor", outcome(r), "401 token gelecekte verilmiş");
}
{
  const r = await verifyOrbitToken(await mint(key, { claims: { sub: "" } }), ISSUER, AUDIENCE);
  check("sub'suz token reddediliyor", outcome(r), "401 token sub taşımıyor");
}

console.log("\n── biçim ──");
for (const [label, token] of [["boş", ""], ["tek parça", "abc"], ["iki parça", "a.b"], ["çöp", "a.b.c.d"]]) {
  const r = await verifyOrbitToken(token, ISSUER, AUDIENCE);
  check(`bozuk biçim: ${label}`, outcome(r), "401 token biçimi geçersiz");
}
{
  const r = await verifyOrbitToken("!!!.@@@.###", ISSUER, AUDIENCE);
  check("çözülemeyen base64", outcome(r), "401 token çözülemedi");
}

console.log("\n── anahtar değişimi ──");
{
  const before = jwksHits;
  await verifyOrbitToken(await mint(key), ISSUER, AUDIENCE);
  check("önbellek ikinci çağrıda ağa çıkmıyor", jwksHits, before, `(jwks çağrısı: ${jwksHits})`);
}
{
  // Yeni anahtar yayınlanıyor; bilinmeyen kid önbelleği zorla tazelemeli.
  published = [key.jwk, rotatedKey.jwk];
  const r = await verifyOrbitToken(await mint(rotatedKey), ISSUER, AUDIENCE);
  check("yeni anahtar tanınıyor", outcome(r), "sub=orbit-sub-selene", "(önbellek zorla tazelendi)");
}

console.log("\n── sağlayıcı erişilemiyor ──");
{
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response("kapalı", { status: 503 });
  // Önbelleği geçersiz kılmak için bilinmeyen bir kid ile gel.
  const r = await verifyOrbitToken(await mint(otherKey), ISSUER, AUDIENCE);
  check("JWKS alınamıyorsa 503", String(r.status), "503", "(401 demek yanıltıcı olurdu)");
  globalThis.fetch = saved;
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} geçti`);
if (failed.length) { console.error("düşenler: " + failed.map((f) => f.label).join(", ")); process.exit(1); }
