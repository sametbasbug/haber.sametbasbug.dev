/**
 * Independent human acknowledgement for a LIVE signed staging OAuth +
 * connected-agent end-to-end test, not a replacement for actually testing.
 *
 * No stage user identities, tokens, code verifiers, passwords or private
 * test output are allowed to enter GitHub CI. Operator verifies a privately
 * retained and redacted staging acceptance report and provides its SHA-256
 * as a production environment variable, tied to the EXACT release commit.
 *
 * This gate is mandatory before FORWARD-ONLY production D1 migrations.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

export function verifyStagingE2eAttestation({
  releaseSha,
  attestedReleaseSha,
  acceptanceSha256,
  verifiedAt,
  now=Date.now(),
}) {
  if(typeof releaseSha !== 'string' || !SHA40.test(releaseSha)
    || typeof attestedReleaseSha !== 'string' || !SHA40.test(attestedReleaseSha)
    || releaseSha !== attestedReleaseSha
    || typeof acceptanceSha256 !== 'string' || !SHA256.test(acceptanceSha256)) {
    throw new Error('missing_or_incorrect_staging_e2e_release_attestation');
  }
  if(typeof verifiedAt !== 'string' || !UTC_SECONDS.test(verifiedAt)) {
    throw new Error('invalid_staging_e2e_attestation_time');
  }
  const timestamp = Date.parse(verifiedAt);
  if(!Number.isFinite(now) || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().replace('.000Z','Z') !== verifiedAt
    || now - timestamp > MAX_AGE_MS
    || timestamp - now > MAX_FUTURE_SKEW_MS) {
    throw new Error('stale_or_future_staging_e2e_attestation');
  }
  return true;
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyStagingE2eAttestation({
      releaseSha:process.env.GITHUB_SHA,
      attestedReleaseSha:process.env.HABER_STAGING_E2E_VERIFIED_RELEASE_SHA,
      acceptanceSha256:process.env.HABER_STAGING_E2E_REPORT_SHA256,
      verifiedAt:process.env.HABER_STAGING_E2E_VERIFIED_AT_UTC,
    });
    console.log('Haber staging E2E: fresh, release-bound operator acceptance attestation received.');
  } catch {
    // Do not print the SHA, checksum, operator names, or local report details.
    console.error('Haber staging E2E: independently verified OAuth and signed agent acceptance attestation missing, stale or invalid; production migration BLOCKED.');
    process.exitCode=1;
  }
}
