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
import { verifyOrbitToken, verifyOrbitActionToken, validatedOrbitJwksUrl } from "../src/identity.ts";

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

console.log("\n── bozuk ECDSA imza ve token uzunluğu ──");
{
  const [header,payload] = (await mint(key)).split('.');
  for(const [label,badSig] of [
    ['imza base64url dışı karakter', '~invalid~'],
    ['boş imza', ''],
    ['bir baytlık imza', 'AQ'],
    ['gereğinden büyük imza', 'A'.repeat(160)],
  ]){
    const r=await verifyOrbitToken(`${header}.${payload}.${badSig}`,ISSUER,AUDIENCE);
    check(label,outcome(r),'401 imza doğrulanmadı');
  }
  const large=(await mint(key))+'A'.repeat(8300);
  const oversized=await verifyOrbitToken(large,ISSUER,AUDIENCE);
  check('aşırı büyük JWT daha decode etmeden 401',outcome(oversized),'401 token biçimi geçersiz');
}

console.log("\n── JSON claims yapısı ve kısa ömürlü eylem belgesi ──");
{
  async function mintRaw(head, payload) {
    const headerSegment=encodeJson(head);
    const bodySegment=encodeJson(payload);
    const signature=await crypto.subtle.sign(
      {name:"ECDSA",hash:"SHA-256"},key.privateKey,
      new TextEncoder().encode(headerSegment+"."+bodySegment),
    );
    return headerSegment+"."+bodySegment+"."+b64url(new Uint8Array(signature));
  }
  const now=Math.floor(Date.now()/1000);
  const normalHeader={alg:"ES256",kid:key.kid};
  const baseClaims={iss:ISSUER,sub:"orbit-sub-selene",aud:AUDIENCE,iat:now,exp:now+60};
  const actionClaims={...baseClaims,scope:"site.actions",operation:"haber.haberOku",
    act:{sub:"agent:synthetic",handle:"selene"},jti:"local-unique"};
  for (const [label,header] of [
    ["header null",null],["header array",[]],["header string","object yerine metin"],
  ]) {
    const r=await verifyOrbitToken(await mintRaw(header,baseClaims),ISSUER,AUDIENCE);
    check(label,outcome(r),"401 token çözülemedi");
  }
  for (const [label,body] of [
    ["claims null",null],["claims array",[]],["claims number",42],
  ]) {
    const r=await verifyOrbitToken(await mintRaw(normalHeader,body),ISSUER,AUDIENCE);
    check(label,outcome(r),"401 token çözülemedi");
  }
  for (const [label,claims] of [
    ["site action missing iat",{...actionClaims,iat:undefined}],
    ["site action wrong iat",{...actionClaims,iat:"now"}],
    ["site action impossible exp before iat",{...actionClaims,exp:now-10}],
    ["site action exp 61 seconds",{...actionClaims,exp:now+61}],
    ["site action exp too far ahead",{...actionClaims,exp:now+3600}],
  ]) {
    const r=await verifyOrbitActionToken(await mintRaw(normalHeader,claims),ISSUER,AUDIENCE);
    check(label,("error" in r)?(r.status+" "+r.error):"ACCEPTED",
      "401 token zaman iddiaları geçersiz");
  }
  for(const [label,claims] of [
    ["site action 1 second expired despite 60-second shared clock tolerance",
      {...actionClaims,iat:now-61,exp:now-1}],
    ["site action 20 seconds expired despite shared tolerance",
      {...actionClaims,iat:now-80,exp:now-20}],
  ]){
    const r=await verifyOrbitActionToken(await mintRaw(normalHeader,claims),ISSUER,AUDIENCE);
    check(label,("error" in r)?(r.status+" "+r.error):"ACCEPTED",
      "401 eylem belgesinin süresi dolmuş");
  }
  {
    const issuedFarFuture=await verifyOrbitActionToken(
      await mintRaw(normalHeader,{...actionClaims,iat:now+30,exp:now+90}),
      ISSUER,AUDIENCE);
    check("site action cannot start 30 seconds in the future",
      ("error" in issuedFarFuture)?(issuedFarFuture.status+" "+issuedFarFuture.error):"ACCEPTED",
      "401 eylem belgesinin tarihi henüz gelmemiş");
  }
  const smallIssuerLead=await verifyOrbitActionToken(
    await mintRaw(normalHeader,{...actionClaims,iat:now+3,exp:now+63}),
    ISSUER,AUDIENCE);
  check("3-second issuer clock lead accepted for signed action",
    "error" in smallIssuerLead?"ERROR":smallIssuerLead.operation,
    "haber.haberOku");
  const good=await verifyOrbitActionToken(await mintRaw(normalHeader,actionClaims),ISSUER,AUDIENCE);
  check("gerçek biçimde 60sn Orbit eylemi hâlâ geçer","error" in good?"ERROR":good.operation,
    "haber.haberOku");
  const hitsBefore=jwksHits;
  const fakeHeader={alg:"ES256",kid:"kid-not-yet-published"};
  const invalidSignature=encodeJson(fakeHeader)+"."+encodeJson(actionClaims)+".AQ";
  const malformed=await verifyOrbitToken(invalidSignature,ISSUER,AUDIENCE);
  check("bozuk imza bilinmeyen kid bile olsa 401",outcome(malformed),"401 imza doğrulanmadı");
  check("bozuk imza hiçbir JWKS yenilemesine neden olmaz",jwksHits,hitsBefore);
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

console.log("\n── OIDC JWKS ağ güvenliği ──");
{
  const valid = `${ISSUER}/.well-known/jwks.json`;
  check("aynı HTTPS sağlayıcıdan JWKS",validatedOrbitJwksUrl(ISSUER,valid),valid);
  for(const bad of [
    'http://orbit.example.test/.well-known/jwks.json',
    'https://evil.example.test/jwks.json',
    'https://orbit.example.test.evil.example.test/jwks.json',
    'https://user:secret@orbit.example.test/.well-known/jwks.json',
    'https://orbit.example.test/.well-known/jwks.json#anchor',
    null,
  ]){
    let rejected=false;
    try{validatedOrbitJwksUrl(ISSUER,bad);}catch{rejected=true;}
    check("yetkisiz JWKS URI reddi",rejected,true);
  }
  const originalFetch=globalThis.fetch;
  async function attempt(factory){
    const visited=[];
    globalThis.fetch=async (url,options)=>{
      visited.push(String(url));
      if(options?.redirect!=='manual' || !(options?.signal instanceof AbortSignal)){
        throw new Error('unbounded_oidc_fetch');
      }
      return factory(String(url),options,visited);
    };
    try{
      const response=await verifyOrbitToken(await mint(otherKey),ISSUER,AUDIENCE);
      return {response,visited};
    }finally{globalThis.fetch=originalFetch;}
  }
  const discover=(overrides={})=>Response.json({
    issuer:ISSUER,jwks_uri:valid,...overrides,
  });
  for(const [label,factory] of [
    ['farklı domaine JWKS discovery',url=>discover({jwks_uri:'https://evil.example.test/jwks.json'})],
    ['keşif sağlayıcısı uyuşmuyor',url=>discover({issuer:'https://evil.example.test'})],
    ['keşif redirect reddi',url=>Response.redirect('https://evil.example.test/oidc')],
    ['keşif content-length taşması',url=>new Response('{}',{headers:{'content-length':'90000'}})],
    ['keşif akış taşması',url=>new Response('x'.repeat(33*1024))],
    ['keşif bozuk JSON',url=>new Response('broken PRIVATE_SHOULD_NOT_LEAK')],
    ['JWKS redirect reddi',url=>url.endsWith('openid-configuration')?discover():Response.redirect('https://evil.example.test/jwks')],
    ['JWKS boyut taşması',url=>url.endsWith('openid-configuration')?discover():new Response('x'.repeat(65*1024))],
    ['JWKS çok fazla anahtar',url=>url.endsWith('openid-configuration')?discover():Response.json({keys:Array(17).fill(key.jwk)})],
    ['JWKS anahtar dizisi değil',url=>url.endsWith('openid-configuration')?discover():Response.json({keys:{kid:key.kid}})],
  ]){
    const {response,visited}=await attempt(factory);
    check(label,response.status,503);
    check('  izinli sağlayıcı dışına çıkmadı',
      visited.every(url=>url.startsWith(ISSUER+'/')),true);
    check('  gizli upstream hata gövdesi sızmadı',
      !String(response.error).includes('PRIVATE_SHOULD_NOT_LEAK'),true);
  }
  // A newly rotated legitimate signing key must still be discoverable.
  published=[key.jwk,rotatedKey.jwk,otherKey.jwk];
  const {response}=await attempt(url=>url.endsWith('openid-configuration')
    ?discover():Response.json({keys:published}));
  check('geçerli yeni kid hâlâ tanınıyor',outcome(response),'sub=orbit-sub-selene');
  published=[key.jwk,rotatedKey.jwk];
}

console.log("\n── eşzamanlı bilinmeyen kid ve JWKS yeniden keşfi ──");
{
  // An untrusted caller can send a syntactically valid ES256 token with a
  // made-up kid. Six simultaneous probes should share ONE identity-provider
  // refresh, not produce a fan-out of six discovery + JWKS downloads.
  let discoveryCalls=0,jwksCalls=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const path=String(url);
    await Promise.resolve();
    if(path.endsWith("/.well-known/openid-configuration")){
      discoveryCalls++;
      return Response.json({issuer:ISSUER,jwks_uri:ISSUER+"/.well-known/jwks.json"});
    }
    if(path.endsWith("/.well-known/jwks.json")){
      jwksCalls++;
      return Response.json({keys:[key.jwk,rotatedKey.jwk]});
    }
    throw new Error("Unexpected JWKS test request");
  };
  try {
    const unknownKidKey=await makeKey("unpublished-concurrent-kid");
    const unknownKidToken=await mint(unknownKidKey);
    const attempts=await Promise.all(
      Array.from({length:6},()=>verifyOrbitToken(unknownKidToken,ISSUER,AUDIENCE)),
    );
    check("altı bilinmeyen kid güvenli reddedildi",
      attempts.every(r=>r.status===401),true);
    check("eşzamanlı discovery bir kez çalıştı",discoveryCalls,1);
    check("eşzamanlı JWKS bir kez indirildi",jwksCalls,1);

    // A known cached key must remain usable while an unknown kid is
    // being refreshed (and must not trigger another network request).
    const signedWithKnownKey=await mint(key);
    const known=await Promise.all(
      Array.from({length:4},()=>verifyOrbitToken(signedWithKnownKey,ISSUER,AUDIENCE)),
    );
    check("önbellekteki geçerli kimlikler çalışıyor",
      known.every(r=>r.subject==="orbit-sub-selene"),true);
    check("geçerli anahtar için tekrar keşif yapılmıyor",jwksCalls,1);

    let unavailableHits=0;
    globalThis.fetch=async()=>{unavailableHits++;return new Response("temporary", {status:503});};
    const duringOutage=await Promise.all(
      Array.from({length:5},()=>verifyOrbitToken(unknownKidToken,ISSUER,AUDIENCE)),
    );
    check("eşzamanlı JWKS kesintisi güvenli 503 döner",
      duringOutage.every(r=>r.status===503),true);
    check("kesintide tek discovery isteği yapıldı",unavailableHits,1);

    globalThis.fetch=async(url)=>{
      const path=String(url);
      if(path.endsWith("/.well-known/openid-configuration")){
        discoveryCalls++;
        return Response.json({issuer:ISSUER,jwks_uri:ISSUER+"/.well-known/jwks.json"});
      }
      if(path.endsWith("/.well-known/jwks.json")){
        jwksCalls++;
        return Response.json({keys:[key.jwk,rotatedKey.jwk]});
      }
      throw new Error("Unexpected JWKS retry test request");
    };
    const retry=await verifyOrbitToken(unknownKidToken,ISSUER,AUDIENCE);
    check("başarısız keşiften sonra sonraki yenileme çalışıyor",retry.status,401);
    check("yeni yenileme isteği gerçekten yapılmış",jwksCalls,2);
  }finally{globalThis.fetch=originalFetch;}
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} geçti`);
if (failed.length) { console.error("düşenler: " + failed.map((f) => f.label).join(", ")); process.exit(1); }
