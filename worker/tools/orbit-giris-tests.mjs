/* Orbit ile giriş akışının güvenlik kararlarını sınar.
 *
 * Buradaki testlerin hepsi "kötü girdi reddediliyor mu" sorusunu soruyor.
 * Mutlu yol ayrıca canlı akışta görülüyor; mutlu yolu sınayan bir test
 * bu katmanda az şey kanıtlar, çünkü kusur her zaman reddedilmesi gereken
 * girdinin kabul edilmesinde ortaya çıkıyor.
 */
import assert from "node:assert/strict";

import { claimsOku, pkce, sha256Base64Url } from "../../src/server/orbit.ts";
import {
  cerezOku,
  donusYolunuTemizle,
  girisCerezi,
  girisDurumuOku,
  oturumCereziVarMi,
} from "../../src/server/session.ts";

let gecti = 0;
const basarisiz = [];

function test(ad, fn) {
  try {
    fn();
    gecti += 1;
  } catch (hata) {
    basarisiz.push(`${ad}: ${hata.message}`);
  }
}

async function testAsync(ad, fn) {
  try {
    await fn();
    gecti += 1;
  } catch (hata) {
    basarisiz.push(`${ad}: ${hata.message}`);
  }
}

const istek = (url, cerez) =>
  new Request(url, cerez ? { headers: { cookie: cerez } } : undefined);

/* ————————————————— açık yönlendirici koruması ————————————————— */

test("site içi yol geçiyor", () => {
  assert.equal(donusYolunuTemizle("/sayfa/2/"), "/sayfa/2/");
});

test("protokol-göreli adres reddediliyor", () => {
  // Tarayıcı `//evil.example`i BAŞKA BİR SİTE olarak çözer. Tek eğik çizgi
  // kontrolü bunu yakalamaz; iki eğik çizgi ayrıca elenmek zorunda.
  assert.equal(donusYolunuTemizle("//evil.example/kap"), "/");
});

test("tam adres reddediliyor", () => {
  assert.equal(donusYolunuTemizle("https://evil.example"), "/");
});

test("boş ve null güvenli varsayılana düşüyor", () => {
  assert.equal(donusYolunuTemizle(null), "/");
  assert.equal(donusYolunuTemizle(""), "/");
});

test("şemasız ama eğik çizgisiz girdi reddediliyor", () => {
  assert.equal(donusYolunuTemizle("evil.example"), "/");
});

/* ————————————————————— çerez okuma ————————————————————— */

test("çerez adı tam eşleşiyor, önek eşleşmesi yok", () => {
  // `haber_oturum_baska` çerezi `haber_oturum` olarak okunmamalı.
  const r = istek("https://x.dev/", "haber_oturum_baska=A; haber_oturum=B");
  assert.equal(cerezOku(r, "haber_oturum"), "B");
});

test("çerez yoksa null", () => {
  assert.equal(cerezOku(istek("https://x.dev/"), "haber_oturum"), null);
  assert.equal(oturumCereziVarMi(istek("https://x.dev/")), false);
});

test("oturum çerezi varlığı doğru saptanıyor", () => {
  assert.equal(oturumCereziVarMi(istek("https://x.dev/", "haber_oturum=abc.def")), true);
});

/* ————————————————— giriş çerezinin nitelikleri ————————————————— */

const DURUM = { state: "s", nonce: "n", verifier: "v", donus: "/" };

test("https'te Secure, HttpOnly ve SameSite=Lax var", () => {
  const c = girisCerezi(DURUM, istek("https://haber.sametbasbug.dev/giris/orbit"));
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
});

test("SameSite Strict DEĞİL — olsaydı Orbit dönüşünde çerez gitmezdi", () => {
  const c = girisCerezi(DURUM, istek("https://haber.sametbasbug.dev/giris/orbit"));
  assert.ok(!/SameSite=Strict/.test(c));
});

test("localhost'ta Secure yok, yoksa yerel geliştirmede çerez hiç yazılmaz", () => {
  const c = girisCerezi(DURUM, istek("http://localhost:4321/giris/orbit"));
  assert.ok(!/Secure/.test(c));
});

/* ————————————————— giriş durumu ayrıştırma ————————————————— */

test("bozuk JSON null dönüyor, patlamıyor", () => {
  assert.equal(girisDurumuOku(istek("https://x.dev/", "haber_giris=%7Bbozuk")), null);
});

test("eksik alan taşıyan durum reddediliyor", () => {
  const eksik = encodeURIComponent(JSON.stringify({ state: "s", nonce: "n" }));
  assert.equal(girisDurumuOku(istek("https://x.dev/", `haber_giris=${eksik}`)), null);
});

test("tam durum okunuyor", () => {
  const tam = encodeURIComponent(JSON.stringify(DURUM));
  assert.deepEqual(girisDurumuOku(istek("https://x.dev/", `haber_giris=${tam}`)), DURUM);
});

/* ————————————————————————— PKCE ————————————————————————— */

await testAsync("doğrulayıcı RFC 7636 uzunluk aralığında", async () => {
  const { verifier } = await pkce();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, `uzunluk ${verifier.length}`);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
});

await testAsync("meydan okuma gerçekten S256(doğrulayıcı)", async () => {
  const { verifier, challenge } = await pkce();
  assert.equal(challenge, await sha256Base64Url(verifier));
});

await testAsync("her çağrı farklı doğrulayıcı üretiyor", async () => {
  const a = await pkce();
  const b = await pkce();
  assert.notEqual(a.verifier, b.verifier);
});

/* ————————————————————— claims okuma ————————————————————— */

const jwtYap = (govde) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64")
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${b64({ alg: "ES256" })}.${b64(govde)}.imza`;
};

test("claims okunuyor ve türkçe karakterler bozulmuyor", () => {
  const c = claimsOku(jwtYap({ nonce: "n", name: "Samet Başbuğ ĞŞİ" }));
  assert.equal(c.nonce, "n");
  assert.equal(c.name, "Samet Başbuğ ĞŞİ");
});

test("üç parçalı olmayan token null", () => {
  assert.equal(claimsOku("a.b"), null);
  assert.equal(claimsOku(""), null);
});

test("gövdesi nesne olmayan token null", () => {
  const b64 = Buffer.from('"düz metin"').toString("base64url");
  assert.equal(claimsOku(`x.${b64}.y`), null);
});

test("bozuk base64 null dönüyor, patlamıyor", () => {
  assert.equal(claimsOku("x.!!!bozuk!!!.y"), null);
});

console.log(`\n${gecti} geçti, ${basarisiz.length} düştü`);
for (const b of basarisiz) console.log(`  DÜŞTÜ  ${b}`);
process.exit(basarisiz.length === 0 ? 0 : 1);
