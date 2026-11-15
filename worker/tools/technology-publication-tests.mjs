/** Gerçek SQLite şeması ve gerçek Markdown renderer üzerinde yayın testi.
 * Node'un bellek içi SQLite'ı D1 SQL'ini çalıştırır; diske test dosyası yazmaz. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { renderTechnologyBody } from "../src/render.ts";
import { publishTechnologyAs, listTechnologyAs, readTechnologyAs, editTechnologyAs, setTechnologyPublicationState } from "../src/technology-publication.ts";

import { siteAction } from "../src/orbit-eylem.ts";

// Security regression: raw HTML, executable links and image Markdown
// never appear in the new rendering path (legacy parity stays intact).
{
  const rendered = await renderTechnologyBody([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '![a](https://example.com/image.png)',
    '[harmful](javascript:alert(1))',
    '[safe](https://example.com/guideline)',
  ].join("\n\n"));
  assert.ok(!/<script|<img|onerror|javascript:|<iframe/iu.test(rendered.html), rendered.html);
  assert.ok(rendered.html.includes('href="https://example.com/guideline"'), rendered.html);
}

const database = new DatabaseSync(":memory:");
for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter((n) => n.endsWith(".sql")).sort()) {
  database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
}

let batchQueue = Promise.resolve();
const DB = {
  prepare(sql) {
    return {
      async all() { return { results: database.prepare(sql).all() }; },
      async first() { return database.prepare(sql).get() ?? null; },
      bind(...params) {
        const stmt = database.prepare(sql);
        return {
          async first() { return stmt.get(...params) ?? null; },
          async all() { return { results: stmt.all(...params) }; },
          async run() { return stmt.run(...params); },
        };
      },
    };
  },
  async batch(statements) {
    // workerd D1.batch serializes each transaction; the SQLite simulation
    // must not interleave BEGIN/COMMIT statements across awaited writes.
    const execute = async () => {
      database.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    };
    const current = batchQueue.then(execute);
    batchQueue = current.then(() => undefined, () => undefined);
    return current;
  },
};

const env = { DB };
const selene = { subject: "person-a", actor: "agent:selene", author: "Selene AI", mayPublish: true, mayWriteBrief: true, via: "orbit-action" };
const hemera = { subject: "person-a", actor: "agent:hemera", author: "Hemera AI", mayPublish: true, mayWriteBrief: true, via: "orbit-action" };
const unauthorized = { subject: "person-x", actor: "agent:unlisted", author: "Fake AI", mayPublish: true, mayWriteBrief: true, via: "orbit-action" };
const article = {
  metin: "# Güvenlik araştırmacıları yeni bir açık buldu\n\nAraştırmacılar, yazılımı etkileyen önemli bir güvenlik açığını açıkladı. Geliştirici, hatayı gidermek için yeni bir güncelleme yayımladığını duyurdu.\n\nGüncelleme kullanılabilir durumda; kullanıcıların ilgili sürümü yüklemeleri öneriliyor.",
  kategori: "siber-guvenlik",
  kaynaklar: ["https://example.com/research?utm_medium=rss", "https://example.org/advisory"],
};

const read = async (promise) => { const response = await promise; return { status: response.status, body: await response.json() }; };

let r = await read(publishTechnologyAs(unauthorized, article, env));
assert.equal(r.status, 403);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM articles").get().n, 0);

r = await read(publishTechnologyAs({ ...selene, actor: undefined }, article, env));
assert.equal(r.status, 403);

r = await read(publishTechnologyAs(selene, { ...article, author: "Hemera AI" }, env));
assert.equal(r.status, 422);

r = await read(publishTechnologyAs(selene, article, env));
assert.equal(r.status, 201, JSON.stringify(r.body));
assert.equal(r.body.yazar, "Selene AI");
assert.equal(r.body.orbitActor, "agent:selene");
assert.equal(r.body.kategori, "siber-guvenlik");
assert.equal(r.body.gorsel, null);
assert.ok(r.body.yayinTarihi.endsWith("Z"), r.body.yayinTarihi);

const slug = r.body.slug;
const row = database.prepare("SELECT * FROM articles WHERE slug=?").get(slug);
assert.equal(row.publication_era, "technology");
assert.equal(row.category, "Teknoloji");
assert.equal(row.tech_category, "siber-guvenlik");
assert.equal(row.orbit_actor_subject, "agent:selene");
assert.equal(row.hero_image, null);
assert.ok(row.body_html.includes("Kaynaklar"));
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_sources WHERE slug=?").get(slug).n, 2);

r = await read(publishTechnologyAs(selene, article, env));
assert.equal(r.status, 409, "aynı içerik ikinci kez yazılmamalı");
r = await read(publishTechnologyAs(hemera, { ...article, metin: article.metin.replace("yeni bir açık buldu", "önemli bir açık buldu") }, env));
assert.equal(r.status, 409, "başka ajanın aynı kaynağı yayımlaması engellenmeli");

r = await read(listTechnologyAs({ kategori: "siber-guvenlik" }, env));
assert.equal(r.status, 200);
assert.equal(r.body.toplam, 1);
assert.equal(r.body.haberler[0].orbitActor, "agent:selene");
assert.equal(r.body.haberler[0].gorsel, undefined);
r = await read(listTechnologyAs({ kategori: "yapay-zeka" }, env));
assert.equal(r.body.toplam, 0);

r = await read(readTechnologyAs({ slug }, env));
assert.equal(r.status, 200);
assert.equal(r.body.kaynaklar.length, 2);
assert.ok(r.body.metin.startsWith("# Güvenlik"));
assert.ok(!r.body.metin.includes("## Kaynaklar"), "API source list must not duplicate the generated source section");
assert.equal(r.body.url, `https://haber.sametbasbug.dev/${slug}/`);
assert.deepEqual(r.body.duzeltmeler, [], "new article has no corrections");
r = await read(readTechnologyAs({ slug: "../../private" }, env));
assert.equal(r.status, 400);

// Sahiplik, sürüm ve kaldırma kapıları.
r = await read(editTechnologyAs(hemera, { slug, gerekce: "metni düzeltmek istiyorum" }, env));
assert.equal(r.status, 403, "başka ajan metni düzeltemez");
r = await read(setTechnologyPublicationState(hemera, { slug, gerekce: "yanlış haber olduğunu düşünüyorum" }, env, "withdraw"));
assert.equal(r.status, 403, "başka ajan haberi kaldıramaz");

const duzeltilen = article.metin.replace("önemli bir güvenlik açığını", "kritik bir güvenlik açığını");
r = await read(editTechnologyAs(selene, { slug, gerekce: "teknik açıklama düzeltildi", metin: duzeltilen }, env));
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(slug).n, 1);
r = await read(readTechnologyAs({ slug }, env));
assert.ok(r.body.metin.includes("kritik bir güvenlik açığını"));
assert.equal(r.body.duzeltmeler.length, 1);
assert.equal(r.body.duzeltmeler[0].tur, "duzeltme");
assert.ok(!JSON.stringify(r.body).includes("teknik açıklama düzeltildi"), "internal edit reason must stay private");

r = await read(setTechnologyPublicationState(selene, { slug, gerekce: "kaynak bilgisi doğrulanacak" }, env, "withdraw"));
assert.equal(r.status, 200);
r = await read(listTechnologyAs({}, env));
assert.equal(r.body.toplam, 0, "yayından kaldırılan haber yeni akışta görünmez");
r = await read(readTechnologyAs({ slug }, env));
assert.equal(r.status, 404, "kaldırılan haber API'de görünmez");
r = await read(editTechnologyAs(selene, { slug, gerekce: "bir düzeltme daha gerekli" }, env));
assert.equal(r.status, 409, "yayından kaldırılan haber düzenlenmez");
r = await read(setTechnologyPublicationState(selene, { slug, gerekce: "kaynaklar yeniden doğrulandı" }, env, "restore"));
assert.equal(r.status, 200);
r = await read(listTechnologyAs({}, env));
assert.equal(r.body.toplam, 1);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(slug).n, 3);

// Two agents/requests editing the *same version* cannot both append a
// revision or interleave source changes. The database UNIQUE constraint
// enforces this inside the same atomic batch, not in application memory.
const concurrentResults = await Promise.all([
  read(editTechnologyAs(selene, {
    slug, gerekce: "birinci eşzamanlı düzeltme",
    metin: article.metin.replace("önemli bir güvenlik açığını", "önemli bir sistem açığını"),
  }, env)),
  read(editTechnologyAs(selene, {
    slug, gerekce: "ikinci eşzamanlı düzeltme",
    metin: article.metin.replace("önemli bir güvenlik açığını", "önemli bir uygulama açığını"),
  }, env)),
]);
assert.deepEqual(concurrentResults.map((x) => x.status).sort(), [200, 409],
  "concurrent edits must not both succeed on the same article revision");
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(slug).n, 4);
const winningBody = database.prepare("SELECT body_md FROM articles WHERE slug=?").get(slug).body_md;
assert.ok(winningBody.includes("sistem açığını") || winningBody.includes("uygulama açığını"));

// Yeni dönem akışı yalnız yeni haberleri görür: eski arşiv kaydı sızmamalı.
database.prepare(
  `INSERT INTO articles (
    slug,title,description,category,author,body_md,body_html,render_version,
    pub_date,updated_date,origin_url,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
).run("legacy-slug", "Eski haber", "Eski açıklama", "Siyaset", "Asteria AI", "eski", "<p>eski</p>", 1,
  "2026-08-23T12:00:00Z", "2026-08-23T12:00:00Z", "https://example.org/legacy",
  "2026-08-23T12:00:00Z", "2026-08-23T12:00:00Z");
r = await read(listTechnologyAs({}, env));
assert.equal(r.body.toplam, 1);
assert.equal(database.prepare("SELECT publication_era FROM articles WHERE slug='legacy-slug'").get().publication_era, "legacy");

// Gerçek Orbit imza doğrulaması + D1 yetkisi + tek-adım yayın.
database.prepare(
  `INSERT INTO publishers
    (subject,author,may_write_brief,may_publish,created_at,acts_for)
    VALUES (?,?,?,?,?,?)`,
).run("agent:selene", "Selene AI", 0, 1, new Date().toISOString(), "person-a");
const issuer = "https://orbit.example.test";
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
globalThis.fetch = async (url) => {
  const endpoint = String(url);
  if (endpoint.endsWith("/.well-known/openid-configuration")) {
    return Response.json({ jwks_uri: `${issuer}/.well-known/jwks.json` });
  }
  if (endpoint.endsWith("/.well-known/jwks.json")) {
    return Response.json({ keys: [{ kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, kid: "key1" }] });
  }
  return new Response("not found", { status: 404 });
};
const encode = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
async function signedAction(operation, actor = "agent:selene") {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "ES256", kid: "key1" });
  const claims = encode({ iss: issuer, aud: "orbit-haber", sub: "person-a",
    act: { sub: actor, handle: "selene" }, scope: "site.actions", operation,
    iat: now, exp: now + 60, jti: crypto.randomUUID() });
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey,
    new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${Buffer.from(signature).toString("base64url")}`;
}
async function throughOrbit(operation, input, actor = "agent:selene", key = crypto.randomUUID()) {
  return read(siteAction(new Request("https://haber.example.test/api/orbit-eylem", {
    method: "POST",
    headers: { authorization: `Bearer ${await signedAction(operation, actor)}`,
      "idempotency-key": key, "content-type": "application/json" },
    body: JSON.stringify({ operationId: operation, input }),
  }), { ...env, ORBIT_ISSUER: issuer, ORBIT_AUDIENCE: "orbit-haber" }));
}
const orbitArticle = {
  ...article,
  metin: article.metin.replace("yeni bir açık buldu", "bir güncelleme yayımladı"),
  kaynaklar: ["https://example.com/second-news"],
};
const key = "one-action-one-key";
r = await throughOrbit("haber.teknolojiYayinla", orbitArticle, "agent:selene", key);
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.status, "applied");
assert.equal(r.body.output.uygulandi, true);
assert.equal(r.body.output.yazar, "Selene AI");
r = await throughOrbit("haber.teknolojiYayinla", orbitArticle, "agent:selene", key);
assert.equal(r.body.status, "replayed", "aynı logical intent iki defa yayımlanmamalı");
r = await throughOrbit("haber.teknolojiYayinla", {
  ...orbitArticle, kaynaklar: ["https://example.com/changed"],
}, "agent:selene", key);
assert.equal(r.status, 409, "aynı key farklı gövde reddedilmeli");
r = await throughOrbit("haber.teknolojiHaberleriOku", {}, "agent:unlisted");
assert.equal(r.status, 200, "yazma yetkisi olmayan Orbit ajanı haber okuyabilir");
assert.equal(r.body.output.haberler.length, 2, "iki yeni dönem haberi listelenmeli");
r = await throughOrbit("haber.teknolojiYayinla", {
  ...orbitArticle, kaynaklar: ["https://example.com/third"],
}, "agent:unlisted");
assert.equal(r.status, 403, "yetkisiz Orbit ajanı haber yayımlayamaz");

database.close();
console.log("Technology publication E2E: 40 assertions passed (in-memory real SQLite and renderer)");
