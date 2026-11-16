/*
 * Same-zone workers.dev subrequests require a pinned Service Binding.
 * Keep external issuer URLs in claims and redirects unchanged.
 */
export type OrbitHttp = (url: string, init?: RequestInit) => Promise<Response>;
const STAGING_ISSUER = 'https://orbit-v6-staging.samett33710.workers.dev';
const STAGING_CLIENT = 'orbit-haber-staging';
export function orbitHttpForEnvironment(env: {
  ORBIT_ISSUER?: string;
  ORBIT_CLIENT_ID?: string;
  ORBIT_AUDIENCE?: string;
  ORBIT_STAGING?: { fetch: (request: Request) => Promise<Response> };
}): OrbitHttp {
  if (env.ORBIT_ISSUER !== STAGING_ISSUER) {
    return (url, init) => fetch(url, init);
  }
  if ((env.ORBIT_CLIENT_ID ?? env.ORBIT_AUDIENCE) !== STAGING_CLIENT
    || (env.ORBIT_CLIENT_ID !== undefined && env.ORBIT_CLIENT_ID !== STAGING_CLIENT)
    || (env.ORBIT_AUDIENCE !== undefined && env.ORBIT_AUDIENCE !== STAGING_CLIENT)
    || !env.ORBIT_STAGING?.fetch) {
    throw new Error('staging_orbit_service_binding_missing');
  }
  return (url, init) => {
    if (new URL(url).origin !== STAGING_ISSUER) {
      throw new Error('staging_oidc_target_origin_mismatch');
    }
    return env.ORBIT_STAGING!.fetch(new Request(url, init));
  };
}
