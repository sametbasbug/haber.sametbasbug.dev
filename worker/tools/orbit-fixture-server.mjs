/* Yerel sahte Orbit sağlayıcısı — YALNIZ TEST İÇİN.
 *
 * Gerçek Orbit'in keşif belgesi ve JWKS uçlarını taklit eder ki Worker'daki
 * doğrulama kodu gerçek bir ağ çağrısı üzerinden sınanabilsin. Ürettiği
 * anahtar her koşuda yenidir ve diske yalnız test süresince yazılır.
 *
 * Bu dosyanın ürettiği token'lar yalnız bu sahte sağlayıcı için geçerlidir;
 * gerçek Orbit'in anahtarıyla imzalanmadıkları için başka hiçbir yerde
 * kabul edilmezler.
 */
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const PORT = Number(process.env.FIXTURE_PORT ?? 8799);
const ISSUER = `http://localhost:${PORT}`;
const AUDIENCE = process.env.FIXTURE_AUDIENCE ?? "haber.sametbasbug.dev";
const KID = "test-anahtar-1";

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const jwks = { keys: [{ kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y, kid: KID, alg: "ES256", use: "sig" }] };

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const encodeJson = (v) => b64url(new TextEncoder().encode(JSON.stringify(v)));

async function mint(claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = encodeJson({ alg: "ES256", typ: "JWT", kid: KID });
  const body = encodeJson({ iss: ISSUER, aud: AUDIENCE, iat: now, exp: now + 600, ...claims });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey,
    new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

// Testin kullanacağı token'lar. Sunucu ayağa kalkar kalkmaz yazılıyor.
writeFileSync(new URL("../.cases/orbit-tokens.json", import.meta.url), JSON.stringify({
  issuer: ISSUER,
  audience: AUDIENCE,
  listedSubject: "orbit-sub-selene",
  gecerli: await mint({ sub: "orbit-sub-selene" }),
  listedeYok: await mint({ sub: "orbit-sub-yabanci" }),
  kapatilmis: await mint({ sub: "orbit-sub-kapali" }),
  suresiDolmus: await mint({ sub: "orbit-sub-selene", exp: Math.floor(Date.now() / 1000) - 3600 }),
  baskaSite: await mint({ sub: "orbit-sub-selene", aud: "baska-site.example" }),
}, null, 2));

createServer((request, response) => {
  const send = (body) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.url === "/.well-known/openid-configuration") {
    return send({ issuer: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json`,
                  id_token_signing_alg_values_supported: ["ES256"] });
  }
  if (request.url === "/.well-known/jwks.json") return send(jwks);
  response.writeHead(404); response.end("yok");
}).listen(PORT, () => console.log(`sahte Orbit sağlayıcısı: ${ISSUER}`));
