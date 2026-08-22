/* Oturumu kapatır.
 *
 * POST, çünkü çıkış da bir yan etki: GET olsaydı bir `<img src="/cikis">`
 * kullanıcıyı sessizce çıkarabilirdi.
 *
 * Yalnız BU sitedeki oturumu kapatıyor, Orbit oturumunu değil. Kullanıcı
 * "çıkış" derken bu siteden çıkmayı kastediyor; Orbit'ten de atmak, aynı
 * tarayıcıdaki diğer Equinox sitelerini de kapatmak olurdu.
 */
import type { APIRoute } from 'astro';
import { getDatabase } from '#runtime-env';
import { oturumKapat } from '../session';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const db = getDatabase();
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' });
  if (db) headers.set('set-cookie', await oturumKapat(db, request, Date.now()));
  return new Response(null, { status: 303, headers });
};
