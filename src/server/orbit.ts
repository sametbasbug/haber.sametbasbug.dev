/* Orbit ile giriş — istemci tarafı.
 *
 * Haber, Orbit'in doğrudan OIDC istemcisi. Anime'de araya Supabase giriyor
 * (Orbit'teki kayıtlı istemci aslında Supabase; yönlendirme adresi
 * `…supabase.co/auth/v1/callback`), çünkü anime statik bir site ve sunucusu
 * yok. Haber'in kendi Worker'ı ve D1'i var, yani aracıya gerek yok — ve bir
 * aracı daha az bağımlılık, daha az sır, daha az kesinti kaynağı demek.
 *
 * Token'ın DOĞRULANMASI burada değil: `verifyOrbitToken` zaten yazılmış ve
 * sınanmış durumda (`worker/src/identity.ts`). Burada yalnız akışın
 * tarayıcı tarafı var.
 */

const encoder = new TextEncoder();

export interface OrbitConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
}

/* Keşif belgesi önbelleği. Uç adresleri sabit yazmıyoruz — belge sözleşmenin
 * kendisi — ama her girişte çekmek de Orbit'in bir saniyelik kesintisini
 * haberin giriş kesintisi yapardı. */
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
let discoveryCache: { value: Discovery; fetchedAt: number } | null = null;

export async function discover(issuer: string): Promise<Discovery> {
  if (discoveryCache && Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS) {
    return discoveryCache.value;
  }
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error(`Orbit keşif belgesi alınamadı: ${response.status}`);
  const value = (await response.json()) as Discovery;
  if (!value.authorization_endpoint || !value.token_endpoint) {
    throw new Error('Orbit keşif belgesi eksik uç adresi taşıyor');
  }
  discoveryCache = { value, fetchedAt: Date.now() };
  return value;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

/** PKCE doğrulayıcısı ve ondan türeyen meydan okuma.
 *
 * Orbit yalnız `S256` ilan ediyor; düz `plain` yöntemi hiç istenmiyor.
 * Doğrulayıcı 43-128 karakter olmak zorunda (RFC 7636); 32 bayt base64url
 * tam 43 karakter veriyor. */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  return { verifier, challenge: await sha256Base64Url(verifier) };
}

export async function authorizeUrl(options: {
  config: OrbitConfig;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
  scopes: readonly string[];
}): Promise<string> {
  const { authorization_endpoint } = await discover(options.config.issuer);
  const url = new URL(authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', options.config.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('scope', options.scopes.join(' '));
  url.searchParams.set('state', options.state);
  url.searchParams.set('nonce', options.nonce);
  url.searchParams.set('code_challenge', options.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface TokenResponse {
  id_token: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function exchangeCode(options: {
  config: OrbitConfig;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const { token_endpoint } = await discover(options.config.issuer);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    code_verifier: options.verifier,
    redirect_uri: options.redirectUri,
  });

  /* İstemci sırrı Basic başlığında, gövdede değil. İkisi de kabul ediliyor
   * (keşif belgesi ikisini de ilan ediyor) ama başlık yolu, sırrın bir gün
   * bir istek gövdesi günlüğüne düşme ihtimalini azaltıyor. */
  const basic = btoa(
    `${encodeURIComponent(options.config.clientId)}:${encodeURIComponent(options.config.clientSecret)}`,
  );

  const response = await fetch(token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basic}`,
    },
    body,
  });

  if (!response.ok) {
    /* Orbit'in hata gövdesi `error` ve `error_description` taşıyor. Kodu
     * yansıtıyoruz ama açıklamayı kullanıcıya göstermiyoruz: karşı tarafın
     * metnini kendi sayfamıza basmak, oraya yazılan her şeyi bize
     * yazdırmaktır. */
    const detay = await response.text().catch(() => '');
    throw new Error(`Orbit token takası reddetti (${response.status}): ${detay.slice(0, 200)}`);
  }

  const tokens = (await response.json()) as TokenResponse;
  if (typeof tokens.id_token !== 'string' || tokens.id_token.length === 0) {
    throw new Error('Orbit yanıtı id_token taşımıyor');
  }
  return tokens;
}

/** ID token'ın gövdesini okur — DOĞRULAMADAN.
 *
 * İmza kontrolü `verifyOrbitToken`ın işi ve bu fonksiyon onun yerine
 * geçmez. Buradan okunan tek şey imzanın doğrulandığı BİLİNDİKTEN sonra
 * gereken ek alanlar: `nonce`, `name`, `picture`. Sıra bozulursa doğrulanmamış
 * bir gövdeye güvenilmiş olur, o yüzden çağıran taraf önce doğrulamalı.
 */
export function claimsOku(idToken: string): Record<string, unknown> | null {
  const parcalar = idToken.split('.');
  if (parcalar.length !== 3) return null;
  try {
    const base64 = parcalar[1].replaceAll('-', '+').replaceAll('_', '/');
    const dolgulu = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const ikili = atob(dolgulu);
    const baytlar = Uint8Array.from(ikili, (c) => c.charCodeAt(0));
    const cozulmus = JSON.parse(new TextDecoder().decode(baytlar));
    return cozulmus && typeof cozulmus === 'object' ? cozulmus : null;
  } catch {
    return null;
  }
}
