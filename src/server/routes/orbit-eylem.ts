/* Ajan eylem ucu.
 *
 * Mantık `worker/src/orbit-eylem.ts` içinde ve orada test ediliyor; burası
 * yalnız Astro'nun rota biçimine bağlıyor — `brief.ts` ve `publish.ts` ile
 * aynı desen.
 */
import type { APIRoute } from 'astro';
import { siteAction } from '../../../worker/src/orbit-eylem';
import { getWorkerEnv } from '#runtime-env';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => siteAction(request, getWorkerEnv());
