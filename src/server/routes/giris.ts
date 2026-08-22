/* Orbit ile girişi başlatır.
 *
 * Neden GET değil POST: giriş bir yan etki başlatıyor (çerez yazıyor,
 * kullanıcıyı başka siteye gönderiyor). GET olsaydı bir görsel etiketi ya da
 * bir önyükleyici bu akışı kullanıcının haberi olmadan tetikleyebilirdi.
 * Ayrıca kenar önbelleği yalnız GET'i tutuyor; POST hiç uğramıyor.
 */
import type { APIRoute } from 'astro';
import { getWorkerEnv } from '#runtime-env';
import { authorizeUrl, pkce, randomToken } from '../orbit';
import { donusYolunuTemizle, girisCerezi } from '../session';

export const prerender = false;

/* İstenen kapsam `scripts/site-clients/haber.json` ile aynı olmak zorunda:
 * Orbit istemcinin izin verilen üst sınırının dışını reddediyor. `email`
 * istenmiyor — haberin bugün e-postayla yapacağı bir iş yok ve istenmeyen
 * alan, sızdırılamayan alandır. */
const SCOPES = ['openid', 'profile'] as const;

export const POST: APIRoute = async ({ request }) => {
  const env = getWorkerEnv();
  if (!env.ORBIT_ISSUER || !env.ORBIT_CLIENT_ID || !env.ORBIT_CLIENT_SECRET) {
    return new Response('Orbit girişi bu ortamda yapılandırılmamış.', { status: 503 });
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/giris/orbit/donus`;

  const { verifier, challenge } = await pkce();
  const state = randomToken(16);
  const nonce = randomToken(16);

  /* Dönüş yolu form alanından geliyor ve site içi olmaya zorlanıyor. */
  let donus = '/';
  try {
    const form = await request.formData();
    donus = donusYolunuTemizle(String(form.get('donus') ?? '/'));
  } catch {
    donus = '/';
  }

  const hedef = await authorizeUrl({
    config: {
      issuer: env.ORBIT_ISSUER,
      clientId: env.ORBIT_CLIENT_ID,
      clientSecret: env.ORBIT_CLIENT_SECRET,
    },
    redirectUri,
    state,
    nonce,
    challenge,
    scopes: SCOPES,
  });

  return new Response(null, {
    status: 303,
    headers: {
      location: hedef,
      'set-cookie': girisCerezi({ state, nonce, verifier, donus }, request),
      'cache-control': 'no-store',
    },
  });
};
