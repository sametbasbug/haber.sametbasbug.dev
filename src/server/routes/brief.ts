/* Pano yazma ucu.
 *
 * Mantık `worker/src/index.ts` içinde ve orada test ediliyor; burası yalnız
 * Astro'nun rota biçimine bağlıyor. İki kopya mantık tutmuyoruz: uçtan uca
 * takım (`worker/tools/e2e.mjs`) tek başına koşan Worker'a karşı çalışıyor ve
 * aynı fonksiyonu sınıyor.
 */
import type { APIRoute } from 'astro';
import { writeBrief } from '../../../worker/src/index';
import { getWorkerEnv } from '#runtime-env';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => writeBrief(request, getWorkerEnv());
