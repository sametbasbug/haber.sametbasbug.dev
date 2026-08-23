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
 * ÜÇ KİMLİK YOLU VAR
 *
 *   1. Yayıncı anahtarı (`hbr_pub_v1_…`) — bugün Selene'nin kullandığı yol.
 *   2. Orbit ID token'ı — insanın kendisi yayımlarsa.
 *   3. Orbit EYLEM BELGESİ — ajan, insanın adına. `orbit-eylem.ts`.
 *
 * Üçüncüsü 23 Ağustos 2026'da eklendi ve anahtar yolunun gerekçesini
 * geçersiz kıldı: o tarihe kadar Orbit'te bir ajanın alabileceği kimlik
 * yoktu, artık var. Ajan Haber'e doğrudan konuşmuyor — Orbit konuşuyor, 60
 * saniyelik imzalı bir belgeyle. Ajanın elinde saklanan hiçbir sır yok,
 * dolayısıyla iptal tek yerde: insan Orbit panelinden kapatır, kapanır.
 *
 * Anahtar yolu kendiliğinden kapanmıyor ve kapanmamalı: geçiş sırasında
 * ikisinin birden çalışması gerekiyor, yoksa açıldığı an Selene yayımlayamaz
 * hale gelir. Kapatmak `publishers.key_digest` sütununu boşaltmakla olur —
 * açık ve geri alınabilir bir işlem.
 * ———————————————————————————————————————————————————————————————— */

export interface Identity {
  /** Orbit ID token'ındaki `sub`. Handle değil — handle geri alınabiliyor. */
  subject: string;
  /** Yayın imzası. Token'dan değil, `publishers` tablosundan gelir. */
  author: string;
  mayWriteBrief: boolean;
  mayPublish: boolean;
  /** Kimliğin nasıl kanıtlandığı. Denetim ve hata mesajları için. */
  via: "orbit" | "orbit-action" | "publisher-key" | "shared-secret";
  /** İşi fiilen yapan ajan (`agent:<id>`), varsa. İş `subject`in adına. */
  actor?: string;
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

/* Orbit'in imzaladığı bir token'ın ORTAK doğrulaması: imza, `iss`, `aud`,
 * `exp`, `iat`, `sub`. Buradan sonrası token'ın türüne göre değişiyor ve o
 * fark bilerek dışarıda tutuldu — ID token ile eylem belgesi aynı anahtarla
 * imzalanıyor, ayrılan tek şey taşıdıkları iddialar. İki kopya doğrulama
 * tutmak, birinde yapılan düzeltmenin diğerine geçmemesi demekti. */
async function verifySignedOrbitToken(
  token: string,
  issuer: string,
  audience: string,
): Promise<{ claims: any } | AuthFailure> {
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

  return { claims };
}

/** Orbit ID token'ını doğrular ve `sub`'u döner. Yetki kararı vermez. */
export async function verifyOrbitToken(
  token: string,
  issuer: string,
  audience: string,
): Promise<{ subject: string } | AuthFailure> {
  const verified = await verifySignedOrbitToken(token, issuer, audience);
  if ("error" in verified) return verified;

  /* Eylem belgesi ID token yerine geçemez. İkisi de Orbit'in aynı site
   * anahtarıyla imzalanıyor ve `aud` ikisinde de bu site; ayıran şey `scope`.
   * Kontrol olmasaydı, bir işlem için alınmış 60 saniyelik belge doğrudan
   * `/api/publish`e sunulabilirdi — üstelik `act` iddiası okunmadan, yani
   * kimin yaptığı kaydedilmeden. */
  if (verified.claims.scope === SITE_ACTION_SCOPE) {
    return { status: 401, error: "eylem belgesi kimlik token'ı yerine kullanılamaz" };
  }

  return { subject: verified.claims.sub };
}

/** Orbit'in eylem belgesindeki `scope`. Kontrat: `orbit-project/docs/baglisite-ajan-eylemleri.md`. */
export const SITE_ACTION_SCOPE = "site.actions";

export interface OrbitAction {
  /** İnsanın pairwise `sub`'u — giriş sırasında tanıdığımız kimliğin aynısı. */
  subject: string;
  /** Aktör: `agent:<orbit ajan kimliği>` (RFC 8693 `act`). */
  actorSubject: string;
  actorHandle: string | null;
  /** Belgeye gömülü işlem. Gövdedeki `operationId` ile eşleşmek zorunda. */
  operation: string;
}

/** Orbit'in ajan eylem belgesini doğrular. Yetki kararı vermez. */
export async function verifyOrbitActionToken(
  token: string,
  issuer: string,
  audience: string,
): Promise<OrbitAction | AuthFailure> {
  const verified = await verifySignedOrbitToken(token, issuer, audience);
  if ("error" in verified) return verified;
  const claims = verified.claims;

  if (claims.scope !== SITE_ACTION_SCOPE) {
    return { status: 401, error: "token eylem belgesi değil" };
  }
  if (typeof claims.operation !== "string" || claims.operation.length === 0) {
    return { status: 401, error: "belge işlem taşımıyor" };
  }

  /* `act` olmadan belge kabul edilmiyor. Aktörsüz bir eylem belgesi, işi
   * insanın kendisinin yaptığı anlamına gelirdi ve denetim izinde ajan
   * görünmezdi; ayrıca yayın imzasını çözecek satırı bulamazdık. */
  const actor = claims.act;
  if (!actor || typeof actor !== "object" || typeof actor.sub !== "string" || actor.sub.length === 0) {
    return { status: 401, error: "belge aktör (act) taşımıyor" };
  }

  return {
    subject: claims.sub,
    actorSubject: actor.sub,
    actorHandle: typeof actor.handle === "string" ? actor.handle : null,
    operation: claims.operation,
  };
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

/** Eylem belgesindeki aktörü `publishers` satırına bağlar.
 *
 * İki koşul birlikte aranıyor: satırın `subject`i aktörün kimliği OLMALI ve
 * `acts_for`u belgedeki insan OLMALI. Tek başına aktör aransaydı satır
 * "Selene yayımlayabilir" derdi; iki koşulla "Selene, Samet'in adına
 * yayımlayabilir" diyor. Fark bugün görünmüyor çünkü tek insan var, ama
 * ikinci insan Haber'e girip ajan erişimini açtığı gün görünür hale gelir.
 *
 * Yayın imzası `author` sütunundan geliyor, belgedeki `act.handle`tan değil.
 * Handle Orbit'te geri alınabiliyor ve devredilebiliyor; imzayı ona bağlamak
 * ilk devir tesliminde arşivdeki yazarı değiştirirdi. */
export async function authorizeAction(
  action: OrbitAction,
  env: AuthEnv,
): Promise<AuthResult> {
  const row = await env.DB.prepare(
    `SELECT subject, author, may_write_brief, may_publish, disabled_at
       FROM publishers WHERE subject = ? AND acts_for = ?`,
  ).bind(action.actorSubject, action.subject).first<any>();

  // Kimliği kanıtlanmış ama listede olmayan aktör: 403, 401 değil. Orbit
  // erişimi açmış olabilir — o "bu ajan Haber'e gelebilir" demek; "bu ajan
  // yayımlayabilir" demek değil ve o kararı Haber veriyor.
  if (!row) return { ok: false, status: 403, error: "bu ajan yayıncı listesinde değil" };
  if (row.disabled_at) return { ok: false, status: 403, error: "bu ajanın erişimi kapatılmış" };

  return {
    ok: true,
    identity: {
      subject: action.subject,
      author: row.author,
      mayWriteBrief: row.may_write_brief === 1,
      mayPublish: row.may_publish === 1,
      via: "orbit-action",
      actor: action.actorSubject,
    },
  };
}
