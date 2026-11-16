import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  LOGIN_ERRORS, loginErrorKind, loginErrorRedirect,
} from '../src/server/orbit-login-error.ts';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('all login error redirects remove one-use authorization code and clear PKCE state',()=>{
  const clearCookie='haber_giris=; Max-Age=0; Path=/; SameSite=Lax; HttpOnly; Secure';
  for(const kind of Object.keys(LOGIN_ERRORS)){
    const redirect=loginErrorRedirect(kind,clearCookie);
    assert.equal(redirect.status,303);
    assert.equal(redirect.headers.get('location'),'/giris/hata/?tur='+kind);
    assert.ok(!redirect.headers.get('location').includes('code='));
    assert.ok(!redirect.headers.get('location').includes('state='));
    assert.equal(redirect.headers.get('cache-control'),'private, no-store');
    assert.equal(redirect.headers.get('referrer-policy'),'no-referrer');
    assert.equal(redirect.headers.get('x-robots-tag'),'noindex, nofollow');
    assert.equal(redirect.headers.get('set-cookie'),clearCookie);
  }
});
test('error kind cannot inject arbitrary HTML, URL or prototype metadata',()=>{
  for(const invalid of ['__proto__','constructor','http://evil.example','token?code=stolen','<img src=x>','',null]){
    assert.equal(loginErrorKind(invalid),'params');
  }
  assert.equal(loginErrorKind('token'),'token');
  assert.equal(LOGIN_ERRORS.token.status,502);
});
test('OAuth callback never renders code-bearing error page or upstream error body',()=>{
  const callback=read('src/server/routes/giris-donus.ts');
  const astroConfig=read('astro.config.ssr.mjs');
  const errorRoute=read('src/server/routes/giris-hata.astro');
  assert.ok(callback.includes("loginErrorRedirect('token', temizle)"));
  assert.ok(callback.includes("loginErrorRedirect('expired', temizle)"));
  assert.ok(!callback.includes('String(sebep)'),'no logging of upstream error bodies');
  assert.ok(astroConfig.includes("injectRoute({ pattern: '/giris/hata'"));
  assert.ok(errorRoute.includes('Astro.response.status = reason.status'));
  assert.ok(errorRoute.includes("'referrer-policy', 'no-referrer'"));
  assert.ok(errorRoute.includes("'cache-control', 'private, no-store'"));
  assert.ok(errorRoute.includes('noindex={true}'));
  assert.ok(errorRoute.includes('TechnologyLayout'));
  assert.ok(!errorRoute.includes('set:html'));
});
