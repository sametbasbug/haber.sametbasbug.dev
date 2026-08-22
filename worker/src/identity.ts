/* Kimlik doğrulama.
 *
 * İki soru ayrı ayrı sorulur ve bu ayrım tasarımın kendisidir:
 *
 *   1. Bu istek KİMDEN geliyor?  → Orbit'in ES256 imzalı ID token'ı
 *   2. O kişi NE yapabilir?      → haber'in kendi `publishers` tablosu
 *
 * Orbit ikinci soruyu cevaplamaz ve cevaplamaması bilinçlidir: site
 * kapsamlarının tamamı okuma yetkisidir ve `site-authorization-scopes.ts`
 * "ajan adına yazma yetkisi" verilmediğini açıkça yazar. Bir siteye giriş
 * için verilen izin, o sitenin kullanıcı adına konuşmasına dönüşemez.
 *
 * Bu yüzden burada Orbit'ten bir "publish" kapsamı beklenmiyor. Token yalnız
 * `sub`'u kanıtlar; yayımlama yetkisi bu tarafta verilir. Yetkiyi ithal etmek,
 * Orbit'in kasten kapattığı kapıyı arkadan açmak olurdu.
 *
 * ————————————————————————————————————————————————————————————————
 * BUGÜN İKİ KİMLİK YOLU VAR VE BUNUN GEÇİCİ BİR SEBEBİ VAR
 *
 * Orbit'te bir AJANIN alabileceği kimlik henüz yok: site kapısı tarayıcı
 * tabanlı kullanıcı girişi akışıdır, MCP yetkileri ise ajanın Orbit ÜZERİNDE
 * iş yapması içindir. Selene'nin haber'e sunabileceği bir token üreten yol
 * yok ve bunu eklemek Orbit'in token ucunu değiştirmek demek — Orbit anime
 * sitesinin de kimlik sağlayıcısı, o ayrı bir karar.
 *
 * Bu yüzden yayıncı anahtarı yolu var. Orbit'in yerine geçmiyor, boşluğu
 * dolduruyor; Orbit doğrulaması aşağıda duruyor ve sınanmış durumda.
 * `ORBIT_ISSUER` tanımlandığı gün Orbit yolu devreye girer. Anahtar yolu
 * kendiliğinden kapanmaz ve kapanmamalı: geçiş sırasında ikisinin birden
 * çalışması gerekiyor, yoksa Orbit açıldığı an Selene yayımlayamaz hale
 * gelir. Anahtar yolunu kapatmak `publishers.key_digest` sütununu boşaltmakla
 * olur — açık ve geri alınabilir bir işlem.
 * ———————————————————————————————————————————————————————————————— */

export interface Identity {
  /** Orbit ID token'ındaki `sub`. Handle değil — handle geri alınabiliyor. */
  subject: string;
  /** Yayın imzası. Token'dan değil, `publishers` tablosundan gelir. */
  author: string;
  mayWriteBrief: boolean;
  mayPublish: boolean;
  /** Kimliğin nasıl kanıtlandığı. Denetim ve hata mesajları için. */
  via: "orbit" | "publisher-key" | "shared-secret";
}

export interface AuthFailure {
  status: number;
  error: string;
}

export type AuthResult = { ok: true; identity: Identity } | { ok: false } & AuthFailure;

const CLOCK_SKEW_SECONDS = 60;

/* JWKS önbelleği. Her istekte anahtar çekmek hem yavaş hem kırılgan: Orbit'in
 * kısa bir kesintisi haber yayınını durdururdu. Anahtar değişimi ekleme
 * yoluyla yapılıyor (yeni anahtar yayınlanır, eski bir süre JWKS'te kalır),
 * yani birkaç dakikalık bayat önbellek güvenli.
 *
 * Bilinmeyen bir `kid` görüldüğünde önbellek süresi dolmasa bile yenilenir —
 * anahtar değişiminin ilk isteğini reddetmemek için. */
const JWKS_TTL_MS = 10 * 60 * 1000;

interface JwksCache { keys: Map<string, CryptoKey>; fetchedAt: number; }
let jwksCache: JwksCache | null = null;

/* Dönüş türü `Uint8Array<ArrayBuffer>`, çıplak `Uint8Array` değil. Çıplak
 * biçim `Uint8Array<ArrayBufferLike>`e denk ve o, paylaşımlı belleği
 * (`SharedArrayBuffer`) de kapsıyor; `crypto.subtle.verify` ise yalnız
 * `ArrayBuffer` tabanlı bir görünüm kabul ediyor. `new Uint8Array(n)` zaten
 * ArrayBuffer üretiyor, yani burada daraltılan şey gerçeklik değil beyan. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(value: string): any {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

async function loadJwks(issuer: string, force: boolean): Promise<Map<string, CryptoKey>> {
  const fresh = jwksCache !== null && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return jwksCache!.keys;

  /* Keşif belgesi üzerinden gidiliyor, `jwks_uri` varsayılmıyor. Orbit bugün
   * `{issuer}/.well-known/jwks.json` yayınlıyor ama bu bir uygulama ayrıntısı;
   * keşif belgesi sözleşmenin kendisi. */
  const discovery = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!discovery.ok) throw new Error(`keşif belgesi alınamadı: ${discovery.status}`);
  const { jwks_uri: jwksUri } = await discovery.json<{ jwks_uri: string }>();

  const response = await fetch(jwksUri);
  if (!response.ok) throw new Error(`JWKS alınamadı: ${response.status}`);
  const { keys: jwks } = await response.json<{ keys: any[] }>();

  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks ?? []) {
    // Yalnız ES256/P-256 kabul ediliyor. Algoritmayı token'ın header'ından
    // okumak, saldırgana algoritma seçtirmek demektir (`alg: none` ailesi).
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.kid !== "string") continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      ),
    );
  }

  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/** Orbit ID token'ını doğrular ve `sub`'u döner. Yetki kararı vermez. */
export async function verifyOrbitToken(
  token: string,
  issuer: string,
  audience: string,
): Promise<{ subject: string } | AuthFailure> {
  const parts = token.split(".");
  if (parts.length !== 3) return { status: 401, error: "token biçimi geçersiz" };

  let header: any, claims: any;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    return { status: 401, error: "token çözülemedi" };
  }

  if (header.alg !== "ES256") return { status: 401, error: "beklenen imza ES256" };
  if (typeof header.kid !== "string") return { status: 401, error: "token kid taşımıyor" };

  let keys: Map<string, CryptoKey>;
  try {
    keys = await loadJwks(issuer, false);
    // Bilinmeyen kid: anahtar değişimi olmuş olabilir, bir kez zorla yenile.
    if (!keys.has(header.kid)) keys = await loadJwks(issuer, true);
  } catch (error) {
    // Anahtar alınamıyorsa "yetkisiz" demek yanıltıcı olurdu: sorun istekte
    // değil bizde. 503, çağıranın tekrar denemesi gerektiğini söyler.
    return { status: 503, error: `imza anahtarları alınamadı: ${String(error)}` };
  }

  const key = keys.get(header.kid);
  if (!key) return { status: 401, error: "token bilinmeyen bir anahtarla imzalanmış" };

  const signature = base64UrlToBytes(parts[2]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature,
    signed,
  );
  if (!valid) return { status: 401, error: "imza doğrulanmadı" };

  if (claims.iss !== issuer) return { status: 401, error: "token başka bir sağlayıcıdan" };

  // `aud` tek değer veya dizi olabilir (OIDC). İkisi de kabul, ama bizim
  // kimliğimizi taşımak zorunda: başka bir site için verilmiş token burada
  // geçerli olmamalı.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) return { status: 401, error: "token bu site için verilmemiş" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    return { status: 401, error: "token süresi dolmuş" };
  }
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > now) {
    return { status: 401, error: "token gelecekte verilmiş" };
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    return { status: 401, error: "token sub taşımıyor" };
  }

  return { subject: claims.sub };
}

/** Anahtarın SHA-256 özeti, onaltılık.
 *
 * Anahtarın kendisi hiç saklanmıyor. Veritabanı sızarsa özet yayımlama
 * yetkisi vermez; ters çevirmek için anahtarın entropisini kırmak gerekir. */
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Yayıncı anahtarı öneki. Yanlışlıkla başka bir sırrın buraya girmesini
 *  zorlaştırır ve logda görülünce ne olduğu anlaşılır. */
const PUBLISHER_KEY_PREFIX = "hbr_pub_v1_";

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export interface AuthEnv {
  DB: D1Database;
  ORBIT_ISSUER?: string;
  ORBIT_AUDIENCE?: string;
  /* Yalnız yerel geliştirme içindir. Üretimde tanımlı olmamalı; tanımlıysa
   * ve `ORBIT_ISSUER` yoksa aşağıdaki uyarı devreye girer. */
  DEV_PUBLISH_TOKEN?: string;
  DEV_PUBLISH_AUTHOR?: string;
}

/** İsteği kimliklendirir ve yetkilerini `publishers` tablosundan okur. */
export async function authenticate(request: Request, env: AuthEnv): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "yetkilendirme başlığı yok" };

  /* Yayıncı anahtarı. Sorgu ÖZETLE yapılıyor, anahtarla değil: eşleşme
   * veritabanında tam eşitlik üzerinden çözülüyor ve anahtar hiçbir yerde
   * saklanmıyor. */
  if (token.startsWith(PUBLISHER_KEY_PREFIX)) {
    const row = await env.DB.prepare(
      `SELECT subject, author, may_write_brief, may_publish, disabled_at
         FROM publishers WHERE key_digest = ?`,
    ).bind(await digest(token)).first<any>();

    if (!row) return { ok: false, status: 401, error: "yetkisiz" };
    if (row.disabled_at) return { ok: false, status: 403, error: "bu kimliğin erişimi kapatılmış" };

    return {
      ok: true,
      identity: {
        subject: row.subject,
        author: row.author,
        mayWriteBrief: row.may_write_brief === 1,
        mayPublish: row.may_publish === 1,
        via: "publisher-key",
      },
    };
  }

  /* Kapı `ORBIT_ISSUER`: tanımlıysa bu bloktan CANLI ÇIKIŞ YOK, yani aşağıdaki
   * yerel geliştirme dalına düşmek imkânsız. Koşul önceden
   * `ORBIT_ISSUER && ORBIT_AUDIENCE` idi ve üretimde tam olarak bu boşluk
   * açıktı: `ORBIT_ISSUER` tanımlı, `ORBIT_AUDIENCE` tanımlı değil, dolayısıyla
   * blok atlanıp dev dalına düşülüyordu. `DEV_PUBLISH_TOKEN` tanımlı olmadığı
   * için sonuç 401'di — ama yukarıdaki yorumun verdiği "Orbit tanımlanır
   * tanımlanmaz dev yolu kapanır" garantisi yürürlükte değildi. Eksik ayar
   * artık sessizce başka bir yola sapmıyor, 503 ile duruyor. */
  if (env.ORBIT_ISSUER) {
    if (!env.ORBIT_AUDIENCE) {
      return { ok: false, status: 503, error: "Orbit yapılandırması eksik: ORBIT_AUDIENCE tanımlı değil" };
    }
    const verified = await verifyOrbitToken(token, env.ORBIT_ISSUER, env.ORBIT_AUDIENCE);
    if ("error" in verified) return { ok: false, ...verified };

    const row = await env.DB.prepare(
      `SELECT subject, author, may_write_brief, may_publish, disabled_at
         FROM publishers WHERE subject = ?`,
    ).bind(verified.subject).first<any>();

    // Kimliği kanıtlanmış ama listede olmayan biri: 403, 401 değil. Fark
    // önemli — "kim olduğunu bilmiyorum" ile "kim olduğunu biliyorum, yetkin
    // yok" farklı sorunlar ve farklı çözümleri var.
    if (!row) return { ok: false, status: 403, error: "bu kimlik yayıncı listesinde değil" };
    if (row.disabled_at) return { ok: false, status: 403, error: "bu kimliğin erişimi kapatılmış" };

    return {
      ok: true,
      identity: {
        subject: row.subject,
        author: row.author,
        mayWriteBrief: row.may_write_brief === 1,
        mayPublish: row.may_publish === 1,
        via: "orbit",
      },
    };
  }

  /* Orbit yapılandırılmamış: yalnız yerel geliştirme yolu. Buraya ancak
   * `ORBIT_ISSUER` HİÇ tanımlı değilken gelinir — yukarıdaki blok tanımlıysa
   * her durumda kendi içinde sonuçlanıyor. Unutulup açık kalabilecek ayrı bir
   * bayrak yok. */
  if (env.DEV_PUBLISH_TOKEN && timingSafeEqual(token, env.DEV_PUBLISH_TOKEN)) {
    return {
      ok: true,
      identity: {
        subject: "dev",
        author: env.DEV_PUBLISH_AUTHOR ?? "Asteria AI",
        mayWriteBrief: true,
        mayPublish: true,
        via: "shared-secret",
      },
    };
  }

  return { ok: false, status: 401, error: "yetkisiz" };
}
