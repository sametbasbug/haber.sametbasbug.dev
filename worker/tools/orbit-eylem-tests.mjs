/* Ajan eylem ucunu gerçek kriptoyla sınar.
 *
 * `orbit-token-tests.mjs` ile aynı ilke: anahtar burada üretiliyor, belge
 * burada imzalanıyor, doğrulama gerçek WebCrypto ile yapılıyor. Sahte bir
 * "doğrulandı" dönüşü yok.
 *
 * Sınanan yol, canlıdaki yolun kendisi: `siteAction` → `verifyOrbitActionToken`
 * → `authorizeAction` → `writeBriefAs` → tekrar kaydı. Yayın ucunu (`publishAs`)
 * buradan koşturmuyoruz; o R2 ve dolu bir veritabanı istiyor ve uçtan uca
 * Orbit üzerinden ayrıca doğrulandı. Buradaki iş kapı mantığı.
 */
import { OPERATIONS, siteAction } from "../src/orbit-eylem.ts";
import { restoreAs, withdrawAs } from "../src/index.ts";

const ISSUER = "https://orbit.example.test";
const AUDIENCE = "orbit-haber";
const INSAN = "insan-pairwise-sub";
const AJAN = "agent:019ff000-0000-7000-8000-000000000000";

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const encodeJson = (value) => b64url(new TextEncoder().encode(JSON.stringify(value)));

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const jwks = [{ kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y, kid: "k1", alg: "ES256", use: "sig" }];

globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.endsWith("/.well-known/openid-configuration")) {
    return new Response(JSON.stringify({ issuer: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }), { status: 200 });
  }
  if (target.endsWith("/.well-known/jwks.json")) return new Response(JSON.stringify({ keys: jwks }), { status: 200 });
  return new Response("yok", { status: 404 });
};

async function belge({ claims = {}, key = pair.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = encodeJson({ alg: "ES256", typ: "JWT", kid: "k1" });
  const body = encodeJson({
    iss: ISSUER, aud: AUDIENCE, sub: INSAN,
    act: { sub: AJAN, handle: "selene" },
    scope: "site.actions", operation: "haber.panoYaz",
    jti: crypto.randomUUID(), iat: now, exp: now + 60,
    ...claims,
  });
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key,
    new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

/* Sahte D1. SQL'e bakıp cevap veriyor; yazılanları `yazilanlar` içinde
 * biriktiriyor ki tekrar kaydının gerçekten yazıldığı görülebilsin. */
function sahteDB({ yayinciSatiri, gecmis = null, satirlar = [] }) {
  const yazilanlar = [];
  const reddedilenler = [];
  return {
    yazilanlar,
    reddedilenler,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM publishers")) {
                /* Eşleşme SORGUYA bakarak yapılıyor, bağlanan argümanlara
                 * körü körüne değil. Önce körü körüne yapıyordu ve mutasyon
                 * turunda ortaya çıktı: sorgudan `acts_for` koşulunu
                 * silmek testi düşürmüyordu, çünkü sahte veritabanı o
                 * koşulu kendi başına uyguluyordu. Sahte, sınadığı şeyi
                 * kendi yapıyorsa test bir şey sınamıyor demektir. */
                if (!yayinciSatiri) return null;
                if (args[0] !== yayinciSatiri.subject) return null;
                if (sql.includes("acts_for = ?") && args[1] !== yayinciSatiri.acts_for) return null;
                return yayinciSatiri;
              }
              if (sql.includes("FROM orbit_action_log")) return gecmis;
              return null;
            },
            async all() { return { results: satirlar }; },
            async run() {
              if (sql.includes("orbit_action_denials")) reddedilenler.push({ sql, args });
              else yazilanlar.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

const SELENE = { subject: AJAN, acts_for: INSAN, author: "Selene AI", may_write_brief: 1, may_publish: 1, disabled_at: null };

function istek(token, govde, { idempotencyKey = "anahtar-1", method = "POST" } = {}) {
  return new Request("https://haber.sametbasbug.dev/api/orbit-eylem", {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      "content-type": "application/json",
    },
    ...(method === "POST" ? { body: JSON.stringify(govde) } : {}),
  });
}

const ORTAM = { ORBIT_ISSUER: ISSUER, ORBIT_AUDIENCE: AUDIENCE };
const PANO = { board: [{ id: "a1", title: "Bir haber", url: "https://ornek.test/1", source: "Örnek" }], task: { selectCount: 1 } };

const results = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  results.push({ ok, label });
  console.log(`${ok ? "  ok  " : "FAIL  "}${label.padEnd(50)} ${String(actual).padEnd(42)} beklenen: ${expected}`);
}
const sonuc = async (response) => `${response.status} ${JSON.stringify(await response.json().catch(() => null)).slice(0, 90)}`;

console.log("── kapı ──");
{
  const db = sahteDB({ yayinciSatiri: SELENE });
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }), { DB: db, ...ORTAM });
  const govde = await r.json();
  check("geçerli belge panoyu yazıyor", `${r.status} ${govde.status} ${govde.output.uygulandi}`, "200 applied true");
  check("  pano satırı gerçekten yazıldı", db.yazilanlar.some((y) => y.sql.includes("INSERT INTO briefs")), true);
  check("  tekrar kaydı yazıldı", db.yazilanlar.some((y) => y.sql.includes("orbit_action_log")), true);
  check("  aktör kaydediliyor", db.yazilanlar.find((y) => y.sql.includes("orbit_action_log")).args[5], AJAN);
}
{
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ORBIT_ISSUER: ISSUER });
  check("ORBIT_AUDIENCE yoksa 503", await sonuc(r), '503 {"error":"ajan eylemleri yapılandırılmamış"}');
}
{
  const r = await siteAction(istek(null, { operationId: "haber.panoYaz", input: PANO }), { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("belgesiz istek reddediliyor", r.status, 401);
}
{
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }, { idempotencyKey: "" }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("Idempotency-Key zorunlu", r.status, 400);
}
{
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }, { method: "GET" }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("GET kabul edilmiyor", r.status, 405);
}

console.log("\n── belge iddiaları ──");
{
  /* En önemli vaka: pano için alınmış belge, gövdesi değiştirilerek yayına
   * çevrilemez. Belgedeki `operation` gömülü. */
  const r = await siteAction(istek(await belge(), { operationId: "haber.yayinla", input: { briefId: "x", selections: [] } }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("belge başka işleme çevrilemiyor", await sonuc(r), '403 {"error":"belge bu işlem için verilmemiş"}');
}
{
  const r = await siteAction(istek(await belge({ claims: { scope: "openid" } }), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("ID token eylem belgesi yerine geçmiyor", await sonuc(r), '401 {"error":"token eylem belgesi değil"}');
}
{
  const r = await siteAction(istek(await belge({ claims: { act: undefined } }), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("aktörsüz belge reddediliyor", await sonuc(r), '401 {"error":"belge aktör (act) taşımıyor"}');
}
{
  const r = await siteAction(istek(await belge({ claims: { aud: "orbit-equinox-rota" } }), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("başka site için verilmiş belge reddediliyor", r.status, 401);
}
{
  const now = Math.floor(Date.now() / 1000);
  const r = await siteAction(istek(await belge({ claims: { iat: now - 300, exp: now - 120 } }), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("süresi dolmuş belge reddediliyor", r.status, 401);
}
{
  const yabanci = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const r = await siteAction(istek(await belge({ key: yabanci.privateKey }), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("başka anahtarla imzalanmış belge reddediliyor", await sonuc(r), '401 {"error":"imza doğrulanmadı"}');
}

console.log("\n── yetki ──");
{
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: null }), ...ORTAM });
  check("listede olmayan ajan 403 alıyor", await sonuc(r), '403 {"error":"bu ajan yayıncı listesinde değil"}');
}
{
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: { ...SELENE, disabled_at: "2026-08-23T00:00:00Z" } }), ...ORTAM });
  check("kapatılmış ajan 403 alıyor", await sonuc(r), '403 {"error":"bu ajanın erişimi kapatılmış"}');
}
{
  /* Aynı ajan, BAŞKA bir insanın adına: `acts_for` eşleşmiyor. */
  const r = await siteAction(istek(await belge({ claims: { sub: "baska-insan" } }), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("ajan başkasının adına yayımlayamıyor", r.status, 403);
}
{
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }),
    { DB: sahteDB({ yayinciSatiri: { ...SELENE, may_write_brief: 0 } }), ...ORTAM });
  /* Yetki eksikliği bir editoryal karar değil: 2xx gövdesine sarılmıyor. */
  check("pano yetkisi yoksa reddediliyor", r.status, 403);
}
{
  const r = await siteAction(istek(await belge({ claims: { operation: "haber.silAll" } }), { operationId: "haber.silAll", input: {} }),
    { DB: sahteDB({ yayinciSatiri: SELENE }), ...ORTAM });
  check("bilinmeyen işlem reddediliyor", r.status, 404);
}

console.log("\n── tekrar ──");
{
  /* Özet, ucun hesapladığıyla aynı olmalı; aynı formülü burada tekrar
   * kuruyoruz — sabit bir dize yazsaydık formül değiştiğinde test sessizce
   * "tekrar değil" dalına düşer ve tekrar korumasını hiç sınamazdı. */
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ operationId: "haber.panoYaz", input: PANO })),
  );
  const ozet = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const db = sahteDB({
    yayinciSatiri: SELENE,
    gecmis: { input_digest: ozet, output: JSON.stringify({ uygulandi: true, briefId: "ilk-calisma" }) },
  });
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }), { DB: db, ...ORTAM });
  const govde = await r.json();
  check("aynı anahtar + aynı gövde ilk cevabı döndürüyor", `${govde.status} ${govde.output.briefId}`, "replayed ilk-calisma");
  check("  ve pano ikinci kez yazılmıyor", db.yazilanlar.length, 0);
}
{
  const db = sahteDB({ yayinciSatiri: SELENE, gecmis: { input_digest: "baska-ozet", output: "{}" } });
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }), { DB: db, ...ORTAM });
  check("aynı anahtar farklı gövde çakışma", await sonuc(r), '409 {"error":"aynı Idempotency-Key farklı bir istekle kullanıldı"}');
  check("  ve hiçbir şey yazılmıyor", db.yazilanlar.length, 0);
}

console.log("\n── yayından kaldırma ──");
{
  /* Sahte veritabanı SORGUYA bakıyor, argümanlara değil — mutasyon turunda
   * bir kez bunun tersini yapıp testi kör bırakmıştım. */
  const haberDBHam = (haber, olaylar = []) => ({
    olaylar,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return sql.includes("FROM articles") ? haber : null; },
            async all() { return { results: [] }; },
            async run() { return { success: true }; },
            __sql: sql, __args: args,
          };
        },
      };
    },
    async batch(ifadeler) { olaylar.push(...ifadeler.map((i) => ({ sql: i.__sql, args: i.__args }))); return []; },
  });
  /* `withdrawAs` bir `Env` alıyor, çıplak veritabanı değil. */
  const haberDB = (haber) => { const olaylar = []; return { DB: haberDBHam(haber, olaylar), olaylar }; };

  const SAAT = 3_600_000;
  const taze = { slug: "taze-haber", title: "Taze", pub_date: new Date(Date.now() - 2 * SAAT).toISOString(), is_draft: 0 };
  const eski = { slug: "eski-haber", title: "Eski", pub_date: new Date(Date.now() - 30 * SAAT).toISOString(), is_draft: 0 };
  const kimlik = { subject: INSAN, author: "Selene AI", mayWriteBrief: true, mayPublish: true, via: "orbit-action", actor: AJAN };

  const cikti = async (r) => ({ status: r.status, govde: await r.json() });

  {
    const db = haberDB(taze);
    const { status, govde } = await cikti(await withdrawAs(kimlik, { slug: taze.slug, reason: "kaynak yanlış çıktı, teyit bekliyoruz" }, db));
    check("taze haber kaldırılabiliyor", `${status} ${govde.kaldirildi}`, "200 true");
    check("  is_draft 1 yapılıyor", db.olaylar.some((o) => o.sql.includes("is_draft = 1")), true);
    check("  olay kaydediliyor", db.olaylar.some((o) => o.sql.includes("article_withdrawals")), true);
    check("  aktör olayda", db.olaylar.find((o) => o.sql.includes("article_withdrawals")).args[3], AJAN);
    check("  içerik sürümü artıyor", db.olaylar.some((o) => o.sql.includes("content_version + 1")), true);
  }
  {
    /* PENCERE. Dört ay önceki bir haberi tek çağrıyla kaldırmak editoryal bir
     * karardır ve ajanın elinde olmamalı. */
    const db = haberDB(eski);
    const { status, govde } = await cikti(await withdrawAs(kimlik, { slug: eski.slug, reason: "artık geçerli değil bence" }, db));
    check("24 saatten eski haber kaldırılamıyor", status, 409);
    check("  hiçbir şey yazılmıyor", db.olaylar.length, 0);
  }
  {
    /* GEREKÇE ZORUNLU. Gerekçesiz kaldırma, altı ay sonra sebebi kaybolmuş
     * bir boşluktur. */
    const db = haberDB(taze);
    const { status } = await cikti(await withdrawAs(kimlik, { slug: taze.slug, reason: "yanlış" }, db));
    check("kısa gerekçe reddediliyor", status, 400);
    check("  hiçbir şey yazılmıyor", db.olaylar.length, 0);
  }
  {
    const db = haberDB(taze);
    const { status } = await cikti(await withdrawAs(kimlik, { slug: taze.slug }, db));
    check("gerekçesiz kaldırma reddediliyor", status, 400);
  }
  {
    const db = haberDB({ ...taze, is_draft: 1 });
    const { status } = await cikti(await withdrawAs(kimlik, { slug: taze.slug, reason: "zaten kaldırılmıştı sanırım" }, db));
    check("zaten kaldırılmış haber 409", status, 409);
  }
  {
    const db = haberDB(null);
    const { status } = await cikti(await withdrawAs(kimlik, { slug: "yok-boyle", reason: "olmayan haberi kaldırmayı deniyorum" }, db));
    check("olmayan haber 404", status, 404);
  }
  {
    const db = haberDB(taze);
    const { status } = await cikti(await withdrawAs({ ...kimlik, mayPublish: false }, { slug: taze.slug, reason: "yetkim yok ama deniyorum" }, db));
    check("yayın yetkisi olmayan kaldıramıyor", status, 403);
  }
  {
    /* GERİ ALMA: pencere YOK. Kaldırmak sınırlı, geri almak değil — geri
     * almak daha güvenli bir işlem ve eski bir haberi yanlışlıkla kaldırmış
     * olabiliriz. */
    const db = haberDB({ ...eski, is_draft: 1 });
    const { status, govde } = await cikti(await restoreAs(kimlik, { slug: eski.slug }, db));
    check("eski haber geri alınabiliyor", `${status} ${govde.yayinda}`, "200 true");
    check("  is_draft 0 yapılıyor", db.olaylar.some((o) => o.sql.includes("is_draft = 0")), true);
  }
  {
    const db = haberDB(taze);
    const { status } = await cikti(await restoreAs(kimlik, { slug: taze.slug }, db));
    check("zaten yayındaki haber 409", status, 409);
  }
}

console.log("\n── yetki katmanları ──");
{
  /* Yayıncı satırı OLMAYAN bir ajan yayımlanmış haberleri okuyabilmeli:
   * ekosistemdeki başka bir ajan "bugünün haberlerini getir" diyebilsin. */
  const db = sahteDB({ yayinciSatiri: null, satirlar: [{ slug: "bir-haber", title: "Bir haber" }] });
  const r = await siteAction(
    istek(await belge({ claims: { operation: "haber.yayinlariOku" } }), { operationId: "haber.yayinlariOku", input: {} }),
    { DB: db, ...ORTAM },
  );
  const govde = await r.json();
  check("yayıncı olmayan ajan haberleri okuyabiliyor", `${r.status} ${govde.status}`, "200 applied");
  check("  okuma tekrar kaydı yazmıyor", db.yazilanlar.length, 0);
}
{
  /* Ama yazma işlemleri duvarın arkasında kalmalı. */
  for (const islem of ["haber.panoYaz", "haber.yayinla", "haber.yayindanKaldir", "haber.yayinaAlGeri", "haber.panoOku"]) {
    const r = await siteAction(
      istek(await belge({ claims: { operation: islem } }), { operationId: islem, input: {} }),
      { DB: sahteDB({ yayinciSatiri: null }), ...ORTAM },
    );
    check(`  ${islem} yayıncı satırı istiyor`, r.status, 403);
  }
}

console.log("\n── katalog ──");
{
  /* Katalog ile uç aynı listeyi taşımak zorunda.
   *
   * İkisi ayrı yerlerde duruyor ve ayrı sebeplerle değişiyor: dosya ajana
   * ne yapabileceğini söylüyor, `OPERATIONS` gerçekte neyin çalıştığını.
   * Ayrıştıklarında iki farklı arıza çıkar ve ikisi de sessiz: katalogda
   * fazla bir işlem, ajanı kesin 404 alacak bir isteğe davet eder; eksik
   * bir işlem, çalışan bir yeteneği görünmez yapar. */
  const { readFileSync } = await import("node:fs");
  const katalog = JSON.parse(readFileSync(new URL("../../public/orbit-actions.json", import.meta.url), "utf8"));
  const ilanEdilen = katalog.operations.map((o) => o.operationId).sort().join(", ");
  check("katalog sürümü", katalog.version, 1);
  check("katalog ile uç aynı işlemleri taşıyor", ilanEdilen, [...OPERATIONS].sort().join(", "));
  check("her işlem şema ve özet taşıyor",
    katalog.operations.every((o) => typeof o.summary === "string" && o.summary.length > 0 && o.input?.type === "object"),
    true);
}

console.log("\n── denetim izi ──");
{
  /* İmzası doğrulanmış bir isteğin reddi kaydedilmeli: ajan içeriksiz bir 502
   * görüyor, "kim denedi" sorusunun cevabı yalnız bizde olabilir. */
  const db = sahteDB({ yayinciSatiri: null });
  await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }), { DB: db, ...ORTAM });
  check("yetkisiz ajan denetim izine yazılıyor", db.reddedilenler.length, 1);
  const [, actor, opId, belgeIslem, status, sebep] = db.reddedilenler[0].args;
  check("  aktör kaydediliyor", actor, AJAN);
  check("  işlem kaydediliyor", `${opId} · ${belgeIslem}`, "haber.panoYaz · haber.panoYaz");
  check("  durum ve sebep kaydediliyor", `${status} ${sebep}`, "403 bu ajan yayıncı listesinde değil");
}
{
  const db = sahteDB({ yayinciSatiri: SELENE });
  await siteAction(istek(await belge(), { operationId: "haber.yayinla", input: {} }), { DB: db, ...ORTAM });
  check("işlem uyuşmazlığı kaydediliyor", db.reddedilenler[0].args[4], 403);
  check("  gövdedeki ve belgedeki işlem ayrı tutuluyor",
    `${db.reddedilenler[0].args[2]} · ${db.reddedilenler[0].args[3]}`, "haber.yayinla · haber.panoYaz");
}
{
  /* İMZASIZ istek denetim izine YAZILMAMALI. `/api/orbit-eylem` herkese açık;
   * imzasız çöpün her istekte satır yazdırması bir yazma silahı olurdu. */
  const db = sahteDB({ yayinciSatiri: SELENE });
  await siteAction(istek(null, { operationId: "haber.panoYaz", input: PANO }), { DB: db, ...ORTAM });
  const yabanci = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  await siteAction(istek(await belge({ key: yabanci.privateKey }), { operationId: "haber.panoYaz", input: PANO }), { DB: db, ...ORTAM });
  check("imzasız ve sahte imzalı istekler yazılmıyor", db.reddedilenler.length, 0);
}
{
  const db = sahteDB({ yayinciSatiri: SELENE, gecmis: { input_digest: "baska-ozet", output: "{}" } });
  await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: PANO }), { DB: db, ...ORTAM });
  check("anahtar çakışması kaydediliyor", db.reddedilenler[0].args[4], 409);
}
{
  /* Editoryal karar reddetme DEĞİL: cevaplandı, sebebi gövdede. */
  const db = sahteDB({ yayinciSatiri: SELENE });
  const r = await siteAction(istek(await belge(), { operationId: "haber.panoYaz", input: { board: "dizi değil" } }), { DB: db, ...ORTAM });
  const govde = await r.json();
  check("editoryal karar 2xx ile dönüyor", `${r.status} ${govde.output.uygulandi}`, "200 false");
  check("  ve denetim izine yazılmıyor", db.reddedilenler.length, 0);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} geçti`);
if (failed.length > 0) process.exit(1);
