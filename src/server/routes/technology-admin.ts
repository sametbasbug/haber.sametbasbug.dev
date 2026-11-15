/**
 * Human administration of Haber 2.0.
 *
 * This is NOT an agent API. An active HttpOnly first-party browser session,
 * verified Orbit pairwise subject in newsroom_administrators and a same-origin
 * JSON POST are all required. The user cannot publish as an AI agent.
 */
import type { APIRoute } from 'astro';
import { getDatabase, getWorkerEnv } from '#runtime-env';
import { oturumOku } from '../session';
import { editTechnologyAs, setTechnologyPublicationState, replayTechnologyAdminRequest } from '../../../worker/src/technology-publication';
import type { Identity } from '../../../worker/src/identity';

export const prerender = false;

function deny(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin
    || request.headers.get('sec-fetch-site') === 'cross-site') {
    return deny(403, 'cross-site administration is forbidden');
  }
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') ?? '')) {
    return deny(415, 'JSON required');
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isSafeInteger(length) || length < 0 || length > 60_000) return deny(413, 'request too large');

  const db = getDatabase();
  if (!db) return deny(503, 'database unavailable');
  const reader = await oturumOku(db, request, Date.now());
  if (!reader) return deny(401, 'Orbit browser session required');

  const admin = await db.prepare(
    'SELECT orbit_subject FROM newsroom_administrators WHERE orbit_subject=? AND disabled_at IS NULL',
  ).bind(reader.orbitSubject).first<{ orbit_subject: string }>();
  if (!admin) return deny(403, 'newsroom administrator permission required');

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 60_000) return deny(413, 'request too large');
    body = JSON.parse(raw);
  } catch {
    return deny(400, 'invalid JSON body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return deny(400, 'invalid input');
  const { action, input, ...extra } = body as Record<string, unknown>;
  if (Object.keys(extra).length || typeof action !== 'string'
    || !input || typeof input !== 'object' || Array.isArray(input)) {
    return deny(400, 'invalid administration fields');
  }

  const requestKey = request.headers.get('idempotency-key');
  if (!requestKey || !/^[a-zA-Z0-9_-]{8,128}$/u.test(requestKey)) {
    return deny(428, 'Idempotency-Key gerekli (8-128 karakter)');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    JSON.stringify({ action, input }),
  ));
  const fingerprint = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');

  const identity: Identity = {
    subject: reader.orbitSubject,
    actor: `admin:${reader.orbitSubject}`,
    author: 'Haber yöneticisi',
    mayWriteBrief: false,
    mayPublish: false,
    via: 'orbit-session',
    isNewsroomAdministrator: true,
    adminRequest: { key: requestKey, fingerprint },
  };
  const replay = await replayTechnologyAdminRequest(identity, db);
  if (replay) {
    const headers = new Headers(replay.headers);
    headers.set('cache-control', 'private, no-store');
    headers.set('x-robots-tag', 'noindex');
    return new Response(replay.body, { status: replay.status, headers });
  }
  const env = { ...getWorkerEnv(), DB: db };
  let result: Response;
  if (action === 'edit') result = await editTechnologyAs(identity, input as Record<string, unknown>, env);
  else if (action === 'withdraw' || action === 'restore') {
    result = await setTechnologyPublicationState(identity, input as Record<string, unknown>, env, action);
  } else return deny(400, 'unknown administration action');

  const headers = new Headers(result.headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-robots-tag', 'noindex');
  return new Response(result.body, { status: result.status, headers });
};
