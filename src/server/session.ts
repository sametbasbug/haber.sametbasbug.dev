/* Okuyucu oturumları.
 *
 * Çerezdeki değer `<selector>.<secret>`. Arama indeksli `selector` üzerinden,
 * doğrulama `secret`in özetiyle yapılıyor. `secret` hiçbir yerde saklanmıyor.
 *
 * Neden Orbit'in ID token'ını çerezde taşımıyoruz: o token kısa ömürlü ve
 * yenilemesi Orbit'e gitmeyi gerektirir, yani her sayfa Orbit'e bağımlı hale
 * gelirdi. Orbit girişte "bu kim?" sorusunu cevaplıyor; oturumu haber
 * kendisi tutuyor. Orbit bir saat kapalı kalsa giriş yapmış kullanıcılar
 * etkilenmez.
 */

const COOKIE_NAME = 'haber_oturum';
const GIRIS_COOKIE_NAME = 'haber_giris';

/* Otuz gün, yenilemesiz. Yenileme eklemek oturumu fiilen ölümsüz yapardı ve
 * kendiliğinden sönmeyen bir oturum bir gün sönmez. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/* Giriş akışının kendisi on dakikada bitmeli. Daha uzun bir pencere, yarım
 * kalmış bir akışın çerezinin tarayıcıda beklemesi demek. */
const GIRIS_TTL_MS = 10 * 60 * 1000;

export interface Reader {
  id: string;
  orbitSubject: string;
  displayName: string | null;
  pictureUrl: string | null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function rastgele(byteLength = 24): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function ozet(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(bytes));
}

/* Sabit süreli karşılaştırma. Özetler zaten gizli değil ama eşitlik araması
 * erken çıkarsa, doğru öneki tahmin eden bir saldırgan bunu ölçebilir. */
function esitMi(a: string, b: string): boolean {
  const sol = new TextEncoder().encode(a);
  const sag = new TextEncoder().encode(b);
  if (sol.length !== sag.length) return false;
  let fark = 0;
  for (let i = 0; i < sol.length; i += 1) fark |= sol[i] ^ sag[i];
  return fark === 0;
}

export function cerezOku(request: Request, ad: string): string | null {
  const başlık = request.headers.get('cookie');
  if (!başlık) return null;
  for (const parça of başlık.split(';')) {
    const ayırıcı = parça.indexOf('=');
    if (ayırıcı < 0) continue;
    if (parça.slice(0, ayırıcı).trim() === ad) {
      return decodeURIComponent(parça.slice(ayırıcı + 1).trim());
    }
  }
  return null;
}

/** Çerez başlığı üretir.
 *
 * `SameSite=Lax` zorunlu: `Strict` olsaydı Orbit'ten dönen yönlendirmede
 * çerez gönderilmez ve giriş akışı kendi çerezini bulamazdı. `HttpOnly`
 * betiğin okumasını, `Secure` düz http'de gitmesini engelliyor —
 * `localhost` istisnası tarayıcının kendi kuralı. */
function cerezYaz(ad: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  const parçalar = [
    `${ad}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parçalar.push('Secure');
  return parçalar.join('; ');
}

function guvenliMi(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

/* ————————————————— giriş akışının geçici durumu ————————————————— */

export interface GirisDurumu {
  state: string;
  nonce: string;
  verifier: string;
  /* Girişten sonra dönülecek yer. Yalnız site içi yollar kabul ediliyor;
   * dışarıdan gelen tam bir adres burada açık yönlendirici olurdu. */
  donus: string;
}

export function girisCerezi(durum: GirisDurumu, request: Request): string {
  return cerezYaz(GIRIS_COOKIE_NAME, JSON.stringify(durum), GIRIS_TTL_MS / 1000, guvenliMi(request));
}

export function girisDurumuOku(request: Request): GirisDurumu | null {
  const ham = cerezOku(request, GIRIS_COOKIE_NAME);
  if (!ham) return null;
  try {
    const durum = JSON.parse(ham) as GirisDurumu;
    if (typeof durum.state !== 'string' || typeof durum.verifier !== 'string') return null;
    if (typeof durum.nonce !== 'string' || typeof durum.donus !== 'string') return null;
    return durum;
  } catch {
    return null;
  }
}

export function girisCereziSil(request: Request): string {
  return cerezYaz(GIRIS_COOKIE_NAME, '', 0, guvenliMi(request));
}

/** Girişten sonra dönülecek yolu güvene alır.
 *
 * Yalnız tek eğik çizgiyle başlayan site içi yollar geçiyor. `//baska.site`
 * tarayıcıda protokol-göreli bir ADRES olarak çözülür, yani tek eğik çizgi
 * kontrolü yetmez. */
export function donusYolunuTemizle(aday: string | null): string {
  if (!aday || !aday.startsWith('/') || aday.startsWith('//')) return '/';
  return aday;
}

/* ————————————————————— okuyucu ve oturum ————————————————————— */

export async function okuyucuYazVeAl(
  db: D1Database,
  subject: string,
  profil: { displayName?: string | null; pictureUrl?: string | null },
  simdi: number,
): Promise<Reader> {
  const mevcut = await db
    .prepare('SELECT id, orbit_subject, display_name, picture_url FROM readers WHERE orbit_subject = ?')
    .bind(subject)
    .first<{ id: string; orbit_subject: string; display_name: string | null; picture_url: string | null }>();

  if (mevcut) {
    /* Profil her girişte tazeleniyor: kullanıcı Orbit'te adını değiştirdiğinde
     * haberdeki kopya bir sonraki girişte doğruya dönüyor. */
    await db
      .prepare('UPDATE readers SET display_name = ?, picture_url = ?, last_seen_at = ? WHERE id = ?')
      .bind(profil.displayName ?? null, profil.pictureUrl ?? null, simdi, mevcut.id)
      .run();
    return {
      id: mevcut.id,
      orbitSubject: mevcut.orbit_subject,
      displayName: profil.displayName ?? null,
      pictureUrl: profil.pictureUrl ?? null,
    };
  }

  const id = rastgele(16);
  await db
    .prepare(
      `INSERT INTO readers (id, orbit_subject, display_name, picture_url, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, subject, profil.displayName ?? null, profil.pictureUrl ?? null, simdi, simdi)
    .run();

  return {
    id,
    orbitSubject: subject,
    displayName: profil.displayName ?? null,
    pictureUrl: profil.pictureUrl ?? null,
  };
}

export async function oturumAc(
  db: D1Database,
  readerId: string,
  request: Request,
  simdi: number,
): Promise<string> {
  const selector = rastgele(12);
  const secret = rastgele(24);
  await db
    .prepare(
      `INSERT INTO reader_sessions (selector, secret_digest, reader_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(selector, await ozet(secret), readerId, simdi, simdi + SESSION_TTL_MS)
    .run();

  return cerezYaz(COOKIE_NAME, `${selector}.${secret}`, SESSION_TTL_MS / 1000, guvenliMi(request));
}

export function oturumCereziVarMi(request: Request): boolean {
  return cerezOku(request, COOKIE_NAME) !== null;
}

export async function oturumOku(
  db: D1Database,
  request: Request,
  simdi: number,
): Promise<Reader | null> {
  const ham = cerezOku(request, COOKIE_NAME);
  if (!ham) return null;
  const ayirici = ham.indexOf('.');
  if (ayirici <= 0) return null;

  const selector = ham.slice(0, ayirici);
  const secret = ham.slice(ayirici + 1);

  const satir = await db
    .prepare(
      `SELECT s.secret_digest, s.expires_at, s.revoked_at,
              r.id, r.orbit_subject, r.display_name, r.picture_url
         FROM reader_sessions s
         JOIN readers r ON r.id = s.reader_id
        WHERE s.selector = ?`,
    )
    .bind(selector)
    .first<any>();

  if (!satir) return null;
  if (!esitMi(await ozet(secret), satir.secret_digest)) return null;
  if (satir.revoked_at !== null || satir.expires_at <= simdi) return null;

  return {
    id: satir.id,
    orbitSubject: satir.orbit_subject,
    displayName: satir.display_name,
    pictureUrl: satir.picture_url,
  };
}

export async function oturumKapat(db: D1Database, request: Request, simdi: number): Promise<string> {
  const ham = cerezOku(request, COOKIE_NAME);
  if (ham) {
    const ayirici = ham.indexOf('.');
    if (ayirici > 0) {
      /* Satır silinmiyor, iptal ediliyor: "bu oturum ne zaman kapandı"
       * sorusunun cevabı bir gün gerekebilir ve silinen satır cevap vermez. */
      await db
        .prepare('UPDATE reader_sessions SET revoked_at = ? WHERE selector = ? AND revoked_at IS NULL')
        .bind(simdi, ham.slice(0, ayirici))
        .run();
    }
  }
  return cerezYaz(COOKIE_NAME, '', 0, guvenliMi(request));
}
