/* `authenticate` yol seçimini sınar.
 *
 * Bu dosya bir yorumun verdiği sözü koda bağlamak için var. `identity.ts`
 * "Orbit tanımlanır tanımlanmaz yerel geliştirme yolu kapanır" diyordu ama
 * koşul `ORBIT_ISSUER && ORBIT_AUDIENCE` olduğu için üretimde tam tersi
 * geçerliydi: ISSUER vardı, AUDIENCE yoktu, akış dev dalına düşüyordu.
 * `DEV_PUBLISH_TOKEN` tanımlı olmadığı için kimse fark etmedi — yani kusur
 * bir gün o token eklendiğinde sessizce açılacaktı.
 *
 * En önemli vaka bu yüzden "eksik ayar + geçerli dev token" vakası: garanti
 * tutuyorsa oradan kimlik ÇIKMAMALI.
 */
import { authenticate } from "../src/identity.ts";

const DEV = "dev-token-123";

/* `first()` her zaman null döner: yayıncı anahtarı yolunun veritabanına
 * gittiğini ama eşleşme bulamadığını temsil ediyor. Yol seçimini sınıyoruz,
 * satır okumayı değil. */
const bosDB = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };

const istek = (token) =>
  new Request("https://haber.sametbasbug.dev/api/publish", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const results = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  results.push({ ok, label });
  console.log(`${ok ? "  ok  " : "FAIL  "}${label.padEnd(52)} ${String(actual).padEnd(46)} beklenen: ${expected}`);
}
const outcome = (r) => (r.ok ? `ok via=${r.identity.via}` : `${r.status} ${r.error}`);

console.log("── Orbit kapısı ──");
{
  /* DÜZELTMENİN TA KENDİSİ: eksik AUDIENCE dev dalını açmamalı. */
  const r = await authenticate(istek(DEV), {
    DB: bosDB, ORBIT_ISSUER: "https://orbit.sametbasbug.dev", DEV_PUBLISH_TOKEN: DEV,
  });
  check("eksik ORBIT_AUDIENCE dev yolunu açmıyor", outcome(r), "503 Orbit yapılandırması eksik: ORBIT_AUDIENCE tanımlı değil");
}
{
  /* Orbit tam yapılandırılmış: geçersiz token dev token'ıyla AYNI olsa bile
   * Orbit doğrulamasında kalmalı, dev dalına düşmemeli. */
  const r = await authenticate(istek(DEV), {
    DB: bosDB,
    ORBIT_ISSUER: "https://orbit.sametbasbug.dev",
    ORBIT_AUDIENCE: "haber.sametbasbug.dev",
    DEV_PUBLISH_TOKEN: DEV,
  });
  check("Orbit açıkken dev token Orbit'te reddediliyor", r.ok, false);
  check("  ve dev yoluna düşmüyor", r.status === 401 || r.status === 503, true);
}

console.log("\n── yerel geliştirme yolu ──");
{
  const r = await authenticate(istek(DEV), { DB: bosDB, DEV_PUBLISH_TOKEN: DEV });
  check("ORBIT_ISSUER yokken dev token geçiyor", outcome(r), "ok via=shared-secret");
}
{
  const r = await authenticate(istek("baska"), { DB: bosDB, DEV_PUBLISH_TOKEN: DEV });
  check("yanlış dev token reddediliyor", outcome(r), "401 yetkisiz");
}
{
  const r = await authenticate(istek(DEV), { DB: bosDB });
  check("DEV_PUBLISH_TOKEN yoksa reddediliyor", outcome(r), "401 yetkisiz");
}

console.log("\n── başlık ──");
{
  const r = await authenticate(istek(null), { DB: bosDB, DEV_PUBLISH_TOKEN: DEV });
  check("başlıksız istek reddediliyor", outcome(r), "401 yetkilendirme başlığı yok");
}

console.log("\n── yayıncı anahtarı ──");
{
  /* Anahtar öneki tanınıyor ve VERİTABANINA gidiliyor; eşleşme yoksa 401.
   * Önemli olan bu yolun Orbit kapısından bağımsız çalışmaya devam etmesi —
   * geçiş sırasında ikisi birden ayakta kalmalı. */
  const r = await authenticate(istek("hbr_pub_v1_xxx"), {
    DB: bosDB, ORBIT_ISSUER: "https://orbit.sametbasbug.dev", ORBIT_AUDIENCE: "haber.sametbasbug.dev",
  });
  check("anahtar yolu Orbit açıkken de deneniyor", outcome(r), "401 yetkisiz");
}
{
  const bulanDB = {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ subject: "asteria", author: "Asteria AI", may_write_brief: 1, may_publish: 1, disabled_at: null }),
      }),
    }),
  };
  const r = await authenticate(istek("hbr_pub_v1_xxx"), {
    DB: bulanDB, ORBIT_ISSUER: "https://orbit.sametbasbug.dev", ORBIT_AUDIENCE: "haber.sametbasbug.dev",
  });
  check("geçerli anahtar Orbit açıkken de kabul", outcome(r), "ok via=publisher-key");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} geçti`);
if (failed.length) { console.error("düşenler: " + failed.map((f) => f.label).join(", ")); process.exit(1); }
