/** Gerçek SQLite şeması ve gerçek Markdown renderer üzerinde yayın testi.
 * Node'un bellek içi SQLite'ı D1 SQL'ini çalıştırır; diske test dosyası yazmaz. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { renderTechnologyBody } from "../src/render.ts";
import { publishTechnologyAs, listTechnologyAs, readTechnologyAs, editTechnologyAs, setTechnologyPublicationState, replayTechnologyAdminRequest } from "../src/technology-publication.ts";

import { TECHNOLOGY_AGENTS } from "../../src/data/technologyAgents.ts";
import { siteAction } from "../src/orbit-eylem.ts";
import { retiredWriterResponse } from "../../src/server/routes/legacy-news-gate.ts";

// The two legacy HTTP writers must not bypass the new four Orbit agent rule.
{
  const retired = retiredWriterResponse({});
  assert.equal(retired?.status, 410, "old publisher-key HTTP publishing is closed by default");
  assert.match(await retired.text(), /Orbit kimliği/u);
  assert.equal(retiredWriterResponse({ ENABLE_LEGACY_NEWS_ACTIONS: "true" })?.status, 410,
    "arbitrary truthy values cannot reopen legacy publishing");
  assert.equal(retiredWriterResponse({ ENABLE_LEGACY_NEWS_ACTIONS: "1" }), null,
    "only explicit server-controlled rollback flag enables legacy");
}

// // Security regression: raw HTML, executable links and image Markdown
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
const selene = { subject: "person-a", actor: `agent:${TECHNOLOGY_AGENTS[3].id}`, author: "Selene AI", mayPublish: true, mayWriteBrief: true, via: "orbit-action" };
const hemera = { subject: "person-a", actor: `agent:${TECHNOLOGY_AGENTS[1].id}`, author: "Hemera AI", mayPublish: true, mayWriteBrief: true, via: "orbit-action" };
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
r = await read(publishTechnologyAs({ ...selene, actor: "agent:unlisted" }, article, env));
assert.equal(r.status, 403, "unregistered Orbit agent cannot claim Selene author name");
r = await read(publishTechnologyAs({ ...selene, actor: `agent:${TECHNOLOGY_AGENTS[0].id}` }, article, env));
assert.equal(r.status, 403, "Nyx's ID cannot claim Selene's author name");

r = await read(publishTechnologyAs(selene, { ...article, author: "Hemera AI" }, env));
assert.equal(r.status, 422);

r = await read(publishTechnologyAs(selene, article, env));
assert.equal(r.status, 201, JSON.stringify(r.body));
assert.equal(r.body.yazar, "Selene AI");
assert.equal(r.body.orbitActor, `agent:${TECHNOLOGY_AGENTS[3].id}`);
assert.equal(r.body.kategori, "siber-guvenlik");
assert.equal(r.body.gorsel, null);
assert.ok(r.body.yayinTarihi.endsWith("Z"), r.body.yayinTarihi);

const slug = r.body.slug;
const row = database.prepare("SELECT * FROM articles WHERE slug=?").get(slug);
assert.equal(row.publication_era, "technology");
assert.equal(row.category, "Teknoloji");
assert.equal(row.tech_category, "siber-guvenlik");
assert.equal(row.orbit_actor_subject, `agent:${TECHNOLOGY_AGENTS[3].id}`);
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
assert.equal(r.body.haberler[0].orbitActor, `agent:${TECHNOLOGY_AGENTS[3].id}`);
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

// Human admin uses separate pairwise browser role and never becomes an AI publisher.
const humanAdmin = {
  subject: "person-a", actor: "admin:person-a", author: "Haber yöneticisi",
  mayWriteBrief: false, mayPublish: false, via: "orbit-session", isNewsroomAdministrator: true,
};
r = await read(publishTechnologyAs(humanAdmin, {
  ...article,
  metin: article.metin.replace("yeni bir açık", "farklı bir açık"),
  kaynaklar: ["https://example.org/human-cannot-publish"],
}, env));
assert.equal(r.status, 403, "human administrator never publishes pretending to be an AI");
r = await read(editTechnologyAs({
  ...humanAdmin, via: "orbit-action",
}, { slug, gerekce: "should not work" }, env));
assert.equal(r.status, 403, "agent action cannot impersonate human administrator");
r = await read(editTechnologyAs(humanAdmin, {
  slug, gerekce: "kaynakların editoryal kontrolü tamamlandı",
  metin: article.metin.replace("yeni bir açık buldu", "yetkili yönetici tarafından kontrol edildi"),
}, env));
assert.equal(r.status, 200, "human admin can edit an article without owning the actor ID");
r = await read(setTechnologyPublicationState(humanAdmin,
  { slug, gerekce: "insan editör kaynağı geçici olarak denetliyor" }, env, "withdraw"));
assert.equal(r.status, 200, "human admin may withdraw any published new-era story");
r = await read(setTechnologyPublicationState(humanAdmin,
  { slug, gerekce: "insan editör kaynak doğrulamasını tamamladı" }, env, "restore"));
assert.equal(r.status, 200, "human admin may restore withdrawn new-era story");
assert.ok(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=? AND actor_subject='admin:person-a'").get(slug).n >= 3,
  "administrator actions must be recorded separately from agent ownership");
// Durable administration request idempotency: receipt and article mutation
// are one atomic transaction. A retried POST must not add a revision.
const requestId = { key: "admin-idempotent-edit-0001", fingerprint: "same-payload-a" };
const idempotentAdmin = { ...humanAdmin, adminRequest: requestId };
const idempotentInput = {
  slug, gerekce: "tekrarlanan ağ isteği korunuyor",
  metin: article.metin.replace("önemli bir güvenlik açığını", "incelemedeki güvenlik açığını"),
};
const previousRevisions = database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(slug).n;
const firstEdit = await read(editTechnologyAs(idempotentAdmin, idempotentInput, env));
assert.equal(firstEdit.status, 200);
const replayedEdit = await read(replayTechnologyAdminRequest(idempotentAdmin, DB));
assert.deepEqual(replayedEdit, firstEdit);
const retriedEdit = await read(editTechnologyAs(idempotentAdmin, idempotentInput, env));
assert.deepEqual(retriedEdit, firstEdit, "same admin key and same body must return exact original result");
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(slug).n,
  previousRevisions + 1, "retries may not insert additional revisions");

const changedAdminKey = { ...humanAdmin,
  adminRequest: { key: requestId.key, fingerprint: "different-body-b" } };
const mismatchedReplay = await read(replayTechnologyAdminRequest(changedAdminKey, DB));
assert.equal(mismatchedReplay.status, 409, "same key with changed payload rejected");
const mismatchedAction = await read(editTechnologyAs(changedAdminKey, {
  ...idempotentInput, gerekce: "değiştirilen içerikli aynı istek anahtarı",
}, env));
assert.equal(mismatchedAction.status, 409, "duplicate request key with new body cannot mutate");

const raceAdmin = { ...humanAdmin,
  adminRequest: { key: "admin-simultaneous-0002", fingerprint: "same-transaction-c" } };
const raceInput = { slug, gerekce: "eşzamanlı yönetici düzeltmesi doğrulandı",
  metin: article.metin.replace("önemli bir güvenlik açığını", "ikinci doğrulanmış güvenlik açığını"),
};
const beforeRace = database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(slug).n;
const simultaneous = await Promise.all([
  read(editTechnologyAs(raceAdmin, raceInput, env)),
  read(editTechnologyAs(raceAdmin, raceInput, env)),
]);
assert.deepEqual(simultaneous.map((value) => value.status), [200, 200]);
assert.deepEqual(simultaneous[0].body, simultaneous[1].body,
  "duplicate concurrent request returns the original committed reply");
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(slug).n,
  beforeRace + 1, "concurrent identical key must write a single revision");

const withdrawAdmin = { ...humanAdmin,
  adminRequest: { key: "admin-withdraw-0003", fingerprint: "withdraw-a" } };
const originalWithdraw = await read(setTechnologyPublicationState(withdrawAdmin,
  { slug, gerekce: "idempotent yönetim kaldirma denemesi" }, env, "withdraw"));
assert.equal(originalWithdraw.status, 200);
const repeatedWithdraw = await read(replayTechnologyAdminRequest(withdrawAdmin, DB));
assert.deepEqual(repeatedWithdraw, originalWithdraw, "withdrawal replay must preserve original 200 reply");
const repeatedWithdrawAction = await read(setTechnologyPublicationState(withdrawAdmin,
  { slug, gerekce: "idempotent yönetim kaldirma denemesi" }, env, "withdraw"));
assert.deepEqual(repeatedWithdrawAction, originalWithdraw,
  "already-withdrawn concurrent request with same key must replay rather than return 409");
const restoreAdmin = { ...humanAdmin,
  adminRequest: { key: "admin-restore-0004", fingerprint: "restore-a" } };
assert.equal((await read(setTechnologyPublicationState(restoreAdmin,
  { slug, gerekce: "idempotent yönetim geri alma denemesi" }, env, "restore"))).status, 200);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM newsroom_admin_requests").get().n, 4,
  "exactly one receipt per unique successful request");
const strangerReplay = await replayTechnologyAdminRequest({
  ...humanAdmin, subject: "different-human", actor: "admin:different-human", adminRequest: requestId,
}, DB);
assert.equal(strangerReplay, null, "other human cannot read admin receipts");

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
).run(`agent:${TECHNOLOGY_AGENTS[3].id}`, "Selene AI", 0, 1, new Date().toISOString(), "person-a");
database.prepare(
  `INSERT INTO publishers (subject,author,may_write_brief,may_publish,created_at,acts_for)
   VALUES (?,?,?,?,?,?)`,
).run(`agent:${TECHNOLOGY_AGENTS[1].id}`, "Hemera AI", 1, 1, new Date().toISOString(), "person-a");
const registerTechnology = readFileSync(new URL("../migrations/0013_register_technology_publishers.sql", import.meta.url), "utf8");
database.exec(registerTechnology);
database.exec(registerTechnology);
for (const agent of TECHNOLOGY_AGENTS) {
  const row = database.prepare("SELECT author,may_publish,acts_for FROM publishers WHERE subject=?").get(`agent:${agent.id}`);
  assert.equal(row?.author, agent.author, `${agent.name} should be enrolled`);
  assert.equal(row?.may_publish, 1);
  assert.equal(row?.acts_for, "person-a");
}
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM publishers WHERE author IN ('Nyx AI','Hemera AI','Asteria AI','Selene AI')").get().n, 4);

const adminRegistration = readFileSync(new URL("../migrations/0014_technology_newsroom_administrators.sql", import.meta.url), "utf8");
const seedAdmin = adminRegistration.slice(adminRegistration.indexOf("INSERT INTO newsroom_administrators"));
database.exec(seedAdmin);
database.exec(seedAdmin);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM newsroom_administrators").get().n, 1);
assert.equal(database.prepare("SELECT orbit_subject FROM newsroom_administrators").get().orbit_subject, "person-a");
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
async function signedAction(operation, actor = `agent:${TECHNOLOGY_AGENTS[3].id}`) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "ES256", kid: "key1" });
  const claims = encode({ iss: issuer, aud: "orbit-haber", sub: "person-a",
    act: { sub: actor, handle: "selene" }, scope: "site.actions", operation,
    iat: now, exp: now + 60, jti: crypto.randomUUID() });
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey,
    new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${Buffer.from(signature).toString("base64url")}`;
}
async function throughOrbit(operation, input, actor = `agent:${TECHNOLOGY_AGENTS[3].id}`, key = crypto.randomUUID()) {
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
r = await throughOrbit("haber.yayinla", orbitArticle, `agent:${TECHNOLOGY_AGENTS[3].id}`, key);
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.status, "applied");
assert.equal(r.body.output.uygulandi, true);
assert.equal(r.body.output.yazar, "Selene AI");
r = await throughOrbit("haber.yayinla", orbitArticle, `agent:${TECHNOLOGY_AGENTS[3].id}`, key);
assert.equal(r.body.status, "replayed", "aynı logical intent iki defa yayımlanmamalı");
r = await throughOrbit("haber.yayinla", {
  ...orbitArticle, kaynaklar: ["https://example.com/changed"],
}, `agent:${TECHNOLOGY_AGENTS[3].id}`, key);
assert.equal(r.status, 409, "aynı key farklı gövde reddedilmeli");
r = await throughOrbit("haber.haberleriOku", {}, "agent:unlisted");
assert.equal(r.status, 200, "yazma yetkisi olmayan Orbit ajanı haber okuyabilir");
assert.equal(r.body.output.haberler.length, 2, "iki yeni dönem haberi listelenmeli");
r = await throughOrbit("haber.yayinla", {
  ...orbitArticle, kaynaklar: ["https://example.com/third"],
}, "agent:unlisted");
assert.equal(r.status, 403, "yetkisiz Orbit ajanı haber yayımlayamaz");

// Signed Orbit action idempotency is atomic with the D1 article mutation.
const concurrentArticle = {
  ...article,
  metin: "# Açık kaynak veri aktarım standardında yeni bir sürüm duyuruldu\n\nTeknoloji geliştiricileri veri aktarım araçları için yeni bir sürüm taslağı yayımladı. Sürüm, farklı uygulamaların aynı veri biçimini kullanırken karşılaştığı uyumluluk sorunlarına çözüm getirmeyi hedefliyor.\n\nYeni değişikliklerin belgeleri ve uygulama takvimi ilgili ekibin teknik sayfasında yayımlandı.",
  kaynaklar: ["https://example.com/concurrent-article-test"],
};
const agentReceiptsBefore = database.prepare("SELECT COUNT(*) AS n FROM technology_agent_requests").get().n;
const twice = await Promise.all([
  throughOrbit("haber.yayinla", concurrentArticle, selene.actor, "atomic-publish-unique-key-1"),
  throughOrbit("haber.yayinla", concurrentArticle, selene.actor, "atomic-publish-unique-key-1"),
]);
assert.deepEqual(twice.map(x => x.status), [200, 200]);
assert.deepEqual(twice.map(x => x.body.status).sort(), ["applied","replayed"]);
assert.equal(twice[0].body.output.slug, twice[1].body.output.slug);
assert.deepEqual(twice[0].body.output, twice[1].body.output);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM technology_agent_requests").get().n,
  agentReceiptsBefore + 1, "only one atomic Orbit receipt for two concurrent actions");
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM articles WHERE slug=?")
  .get(twice[0].body.output.slug).n, 1);

const otherAgentSameKey = await throughOrbit(
  "haber.yayinla", concurrentArticle, hemera.actor, "atomic-publish-unique-key-1",
);
assert.equal(otherAgentSameKey.status, 409,
  "different agent sharing a sponsor must never replay or learn the first agent's output");
const changedPayloadSameKey = await throughOrbit(
  "haber.yayinla", { ...concurrentArticle, kaynaklar: ["https://example.com/changed-concurrent"] },
  selene.actor, "atomic-publish-unique-key-1",
);
assert.equal(changedPayloadSameKey.status, 409, "same agent and key cannot be reused for changed payload");

const ownerSlug = twice[0].body.output.slug;
const atomicCorrection = {
  slug: ownerSlug,
  gerekce: "eşzamanlı Orbit düzenlemesi için gerekçe",
  metin: concurrentArticle.metin.replace("önemli bir güvenlik açığını", "güncellenmiş bir güvenlik açığını"),
};
const revisionCountBefore = database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(ownerSlug).n;
const editTwice = await Promise.all([
  throughOrbit("haber.duzenle", atomicCorrection, selene.actor, "atomic-edit-unique-key-2"),
  throughOrbit("haber.duzenle", atomicCorrection, selene.actor, "atomic-edit-unique-key-2"),
]);
assert.deepEqual(editTwice.map(x => x.status), [200, 200]);
assert.deepEqual(editTwice.map(x => x.body.status).sort(), ["applied","replayed"]);
assert.deepEqual(editTwice[0].body.output, editTwice[1].body.output);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(ownerSlug).n,
  revisionCountBefore + 1, "concurrent signed edit adds precisely one revision");
assert.equal((await throughOrbit("haber.duzenle", atomicCorrection, hemera.actor,
  "atomic-owner-denied-3")).status, 403, "other authorized publisher cannot edit someone else's article");

const stateInput = { slug: ownerSlug, gerekce: "kaynakların yeniden incelenmesi için geri çekildi" };
const withdrawTwice = await Promise.all([
  throughOrbit("haber.yayindanKaldir", stateInput, selene.actor, "atomic-withdraw-unique-key-4"),
  throughOrbit("haber.yayindanKaldir", stateInput, selene.actor, "atomic-withdraw-unique-key-4"),
]);
assert.deepEqual(withdrawTwice.map(x => x.status), [200,200]);
assert.deepEqual(withdrawTwice.map(x => x.body.status).sort(), ["applied","replayed"]);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM articles WHERE slug=? AND is_draft=1").get(ownerSlug).n, 1);
const restoreTwice = await Promise.all([
  throughOrbit("haber.yayinaAlGeri",
    { slug: ownerSlug, gerekce: "kaynaklar kontrol edildi ve tekrar onaylandı" },
    selene.actor, "atomic-restore-unique-key-5"),
  throughOrbit("haber.yayinaAlGeri",
    { slug: ownerSlug, gerekce: "kaynaklar kontrol edildi ve tekrar onaylandı" },
    selene.actor, "atomic-restore-unique-key-5"),
]);
assert.deepEqual(restoreTwice.map(x=>x.status), [200,200]);
assert.deepEqual(restoreTwice.map(x=>x.body.status).sort(), ["applied","replayed"]);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM articles WHERE slug=? AND is_draft=0").get(ownerSlug).n, 1);
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM article_revisions WHERE slug=?").get(ownerSlug).n,
  revisionCountBefore + 3, "exactly one edit, withdrawal, restoration per unique signed action");

// The catalog and runtime must advertise exactly the six v2 operations;
// historical two-step actions can be enabled only via rollback flag.
const legacyBlocked = await throughOrbit("haber.panoYaz",
  { board: [] }, selene.actor, "blocked-retired-1");
assert.equal(legacyBlocked.status, 404, "old public news board operation is unavailable by default");
assert.equal(database.prepare("SELECT COUNT(*) AS n FROM technology_agent_requests").get().n,
  agentReceiptsBefore + 4, "only successful signed tech mutations create receipts");

// All four REAL Orbit agent identities can publish as themselves, but their
// names come from the publisher DB, never the untrusted act.handle claim.
const samples = [
  ["Nyx", "Makine öğrenimi modelleri için yeni değerlendirme kılavuzu", "yapay-zeka"],
  ["Hemera", "Yazılım derleme araçlarında yeni sürüm duyurusu", "yazilim"],
  ["Asteria", "Güvenlik araştırmalarında açık raporlama standardı", "siber-guvenlik"],
  ["Selene", "Donanım üreticileri için yeni enerji verimliliği yöntemi", "donanim"],
];
for (const [index, [name, title, category]] of samples.entries()) {
  const agent = TECHNOLOGY_AGENTS.find(x => x.name === name);
  assert.ok(agent);
  const next = await throughOrbit("haber.yayinla", {
    metin: `# ${title}\n\nTeknoloji topluluğunda kullanılmak üzere hazırlanan bir çalışma planının ayrıntıları paylaşıldı. Bu haber yalnızca imzalı Orbit kimliklerinin dört yayıncıyla doğru eşleştiğini yerel testte doğrulamak içindir.\n\nİçeriğin bir gerçek olay olduğu iddia edilmez; kaynak örnek bağlantısı yalnızca test içindir.`,
    kategori: category,
    kaynaklar: [`https://example.net/agent-${index}-local-smoke`],
  }, `agent:${agent.id}`, `four-publisher-proof-${index}`);
  assert.equal(next.status, 200, `${name}: ${JSON.stringify(next.body)}`);
  assert.equal(next.body.output.uygulandi, true);
  assert.equal(next.body.output.yazar, agent.author);
  assert.equal(next.body.output.orbitActor, `agent:${agent.id}`);
  assert.equal(database.prepare("SELECT author FROM articles WHERE slug=?").get(next.body.output.slug).author,
    agent.author, `${name} is attributed from the trusted identity DB`);
}
const catalog = JSON.parse(readFileSync(new URL("../../public/orbit-actions.json", import.meta.url), "utf8"));
assert.equal(catalog.version, 1);
assert.deepEqual(catalog.operations.map(x=>x.operationId).sort(), [
  "haber.yayinla", "haber.haberleriOku", "haber.haberOku",
  "haber.duzenle", "haber.yayindanKaldir", "haber.yayinaAlGeri",
].sort());
assert.equal(catalog.operations.find(x=>x.operationId==="haber.yayinla").input.required.join(","),
  "metin,kategori,kaynaklar");
assert.ok(!catalog.operations.some(x=>/pano|legacy|teknoloji/i.test(x.operationId)),
  "old two-step UI actions must not leak into the public catalogue");

database.close();
console.log("Technology publication E2E: all checks passed (in-memory SQLite, Orbit JWS, admin idempotency)");
