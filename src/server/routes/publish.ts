/* Yayın ucu. Gerekçe ve mantık için bkz. `brief.ts` ve `worker/src/index.ts`. */
import type { APIRoute } from 'astro';
import { publish } from '../../../worker/src/index';
import { getWorkerEnv } from '#runtime-env';
import { retiredWriterResponse } from './legacy-news-gate';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const env = getWorkerEnv();
  const retired = retiredWriterResponse(env);
  if (retired) return retired;
  return publish(request, env);
};
