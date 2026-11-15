/**
 * Haber 2.0: legacy HTTP writer routes are retired by default.
 *
 * The old /api/publish and /api/brief accepted standalone publisher keys
 * and could create non-technology articles without an Orbit agent account.
 * Keeping them open would silently bypass the four-agent policy even if
 * the Orbit action catalogue itself only advertises six new operations.
 *
 * Rollback requires an explicit server-side flag. There is no browser or
 * request parameter that can enable it.
 */
export function retiredWriterResponse(env: {
  ENABLE_LEGACY_NEWS_ACTIONS?: string;
}): Response | null {
  if (env.ENABLE_LEGACY_NEWS_ACTIONS === '1') return null;
  return new Response(JSON.stringify({
    error: 'legacy_newsroom_retired',
    message: 'Bu yayın ucu Haber 2.0 ile kullanımdan kaldırıldı. Orbit kimliği ve yeni haber sözleşmesi gereklidir.',
  }), {
    status: 410,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
