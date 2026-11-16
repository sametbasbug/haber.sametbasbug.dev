import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  orbitHttpForEnvironment, authorizeUrl, exchangeCode,
} from '../src/server/orbit.ts';

const issuer = 'https://orbit-v6-staging.samett33710.workers.dev';
const clientId = 'orbit-haber-staging';

test('staging OAuth service binding is mandatory and fail closed', () => {
  assert.throws(() => orbitHttpForEnvironment({
    ORBIT_ISSUER: issuer, ORBIT_CLIENT_ID: clientId,
  }), /staging_orbit_service_binding_missing/u);
  assert.throws(() => orbitHttpForEnvironment({
    ORBIT_ISSUER: issuer, ORBIT_CLIENT_ID: 'orbit-haber',
    ORBIT_STAGING: { fetch: async () => new Response(null) },
  }), /staging_orbit_service_binding_missing/u);
});

test('only the pinned staging service can serve discovery and token requests', async () => {
  const observed = [];
  const binding = {
    async fetch(request) {
      observed.push({
        host: new URL(request.url).hostname,
        path: new URL(request.url).pathname,
        method: request.method,
      });
      const path = new URL(request.url).pathname;
      if (path === '/.well-known/openid-configuration') {
        return Response.json({
          issuer,
          authorization_endpoint: issuer + '/v1/oauth/authorize',
          token_endpoint: issuer + '/v1/oauth/token',
        });
      }
      if (path === '/v1/oauth/token') {
        assert.equal(request.method, 'POST');
        assert.match(request.headers.get('authorization') ?? '', /^Basic /u);
        assert.equal((await request.text()).includes('code=local-test-code'), true);
        return Response.json({ id_token: 'synthetic.local.token' });
      }
      return new Response(null, { status: 404 });
    },
  };
  const transport = orbitHttpForEnvironment({
    ORBIT_ISSUER: issuer, ORBIT_CLIENT_ID: clientId, ORBIT_STAGING: binding,
  });
  assert.throws(() => transport('https://haber.sametbasbug.dev/.well-known/openid-configuration'),
    /staging_oidc_target_origin_mismatch/u);
  assert.throws(() => transport('https://orbit.sametbasbug.dev/v1/oauth/token'),
    /staging_oidc_target_origin_mismatch/u);

  const config = { issuer, clientId, clientSecret: 'local-fake-test-only-client-secret' };
  const authorization = await authorizeUrl({
    config, redirectUri:'https://haber-site-staging.samett33710.workers.dev/giris/orbit/donus',
    state:'local-state', nonce:'local-nonce', challenge:'local-challenge',
    scopes:['openid','profile'], transport,
  });
  const url = new URL(authorization);
  assert.equal(url.origin, issuer);
  assert.equal(url.pathname, '/v1/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), clientId);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');

  const exchange = await exchangeCode({
    config, code:'local-test-code', verifier:'test-pkce-verifier',
    redirectUri:'https://haber-site-staging.samett33710.workers.dev/giris/orbit/donus',
    transport,
  });
  assert.equal(exchange.id_token, 'synthetic.local.token');
  assert.deepEqual(observed.map(({path,method})=>[path,method]), [
    ['/.well-known/openid-configuration','GET'],
    ['/v1/oauth/token','POST'],
  ]);
  assert.ok(observed.every(({host})=>host==='orbit-v6-staging.samett33710.workers.dev'));
});

test('production issuer keeps normal public fetch transport, not staging binding', () => {
  const transport=orbitHttpForEnvironment({
    ORBIT_ISSUER:'https://orbit.sametbasbug.dev',ORBIT_CLIENT_ID:'orbit-haber',
  });
  assert.equal(typeof transport,'function');
});
