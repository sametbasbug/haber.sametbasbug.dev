/* Orbit'ten dönüş: kodu takas eder, kimliği doğrular, oturumu açar.
 *
 * Doğrulama sırası önemli ve her adım ayrı bir saldırıyı kesiyor:
 *
 *   1. `state` çerezdekiyle aynı mı  → başkasının başlattığı akışın kodunun
 *      bu tarayıcıya iliştirilmesini (giriş CSRF'i) engeller
 *   2. Kod PKCE doğrulayıcısıyla takas ediliyor → araya giren bir tarafın
 *      çaldığı kodu kullanmasını engeller
 *   3. ID token imzası, `iss`, `aud`, `exp` → `verifyOrbitToken`
 *   4. `nonce` çerezdekiyle aynı mı → başka bir oturum için verilmiş bir
 *      token'ın burada tekrar kullanılmasını engeller
 *
 * Üçüncü adım yeniden yazılmadı: `worker/src/identity.ts` içindeki
 * `verifyOrbitToken` bu işi zaten yapıyor ve sınanmış durumda.
 */
import type { APIRoute } from 'astro';
import { getDatabase, getWorkerEnv } from '#runtime-env';
import { verifyOrbitToken } from '../../../worker/src/identity';
import { claimsOku, exchangeCode, orbitHttpForEnvironment } from '../orbit';
import { loginErrorRedirect } from '../orbit-login-error';
import { girisCereziSil, girisDurumuOku, okuyucuYazVeAl, oturumAc } from '../session';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const env = getWorkerEnv();
  const db = getDatabase();
  const temizle = girisCereziSil(request);
  if (!env.ORBIT_ISSUER || !env.ORBIT_CLIENT_ID || !env.ORBIT_CLIENT_SECRET || !db) {
    return loginErrorRedirect('config', temizle);
  }

  const url = new URL(request.url);
  const durum = girisDurumuOku(request);

  /* Orbit hata döndüyse kod hiç gelmiyor. Kullanıcı onay ekranında
   * "reddet" demiş olabilir; bu bir arıza değil. */
  const orbitHatasi = url.searchParams.get('error');
  if (orbitHatasi) {
    return new Response(null, {
      status: 303,
      headers: { location: '/', 'set-cookie': temizle, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return loginErrorRedirect('params', temizle);
  if (!durum) return loginErrorRedirect('expired', temizle);

  /* Sabit süreli değil çünkü `state` gizli bir anahtar değil, tek kullanımlık
   * bir eşleşme etiketi; sızıntı riski taşıdığı bir alan yok. */
  if (state !== durum.state) return loginErrorRedirect('state', temizle);

  const config = {
    issuer: env.ORBIT_ISSUER,
    clientId: env.ORBIT_CLIENT_ID,
    clientSecret: env.ORBIT_CLIENT_SECRET,
  };

  let idToken: string;
  try {
    const tokens = await exchangeCode({
      config,
      code,
      verifier: durum.verifier,
      redirectUri: `${url.origin}/giris/orbit/donus`,
      transport: orbitHttpForEnvironment(env as typeof env & {
        ORBIT_STAGING?: { fetch: (request: Request) => Promise<Response> };
      }),
    });
    idToken = tokens.id_token;
  } catch (sebep) {
    console.error('Orbit token takası başarısız:', sebep instanceof Error ? sebep.name : 'unknown_error');
    return loginErrorRedirect('token', temizle);
  }

  let verifierTransport: ReturnType<typeof orbitHttpForEnvironment>;
  try {
    verifierTransport = orbitHttpForEnvironment(env);
  } catch {
    return loginErrorRedirect('identityUnavailable', temizle);
  }
  const dogrulama = await verifyOrbitToken(
    idToken, config.issuer, config.clientId, verifierTransport,
  );
  if ('error' in dogrulama) {
    console.error('Orbit ID token reddedildi:', dogrulama.error);
    return loginErrorRedirect(dogrulama.status === 503 ? 'identityUnavailable' : 'verification', temizle);
  }

  /* `nonce` kontrolü `verifyOrbitToken`ın kapsamında değil: o fonksiyon
   * yayın ucu için yazıldı ve orada tarayıcı akışı yok. Burada gerekiyor. */
  const iddialar = claimsOku(idToken);
  if (!iddialar) return loginErrorRedirect('verification', temizle);
  if (iddialar.nonce !== durum.nonce) return loginErrorRedirect('verification', temizle);

  const simdi = Date.now();
  const okuyucu = await okuyucuYazVeAl(
    db,
    dogrulama.subject,
    {
      displayName: typeof iddialar.name === 'string' ? iddialar.name : null,
      pictureUrl: typeof iddialar.picture === 'string' ? iddialar.picture : null,
    },
    simdi,
  );

  const oturumCerezi = await oturumAc(db, okuyucu.id, request, simdi);

  const headers = new Headers({ location: durum.donus, 'cache-control': 'no-store' });
  headers.append('set-cookie', temizle);
  headers.append('set-cookie', oturumCerezi);
  return new Response(null, { status: 303, headers });
};
