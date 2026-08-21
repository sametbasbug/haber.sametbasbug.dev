/* Yayın ucu. Gerekçe ve mantık için bkz. `brief.ts` ve `worker/src/index.ts`. */
import type { APIRoute } from 'astro';
import { publish } from '../../../worker/src/index';
import { getWorkerEnv } from '#runtime-env';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => publish(request, getWorkerEnv());
