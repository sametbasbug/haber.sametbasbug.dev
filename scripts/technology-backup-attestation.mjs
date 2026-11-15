/**
 * The production Haber migration runs automatically on main. Do not apply
 * forward-only D1 migrations without a fresh, release-specific human
 * attestation that a separate, verified, offline SQL export exists.
 *
 * IMPORTANT: This checks an operator attestation, NOT the remote SQL copy.
 * Before setting the GitHub production environment variables, an authorized
 * operator must privately export D1, pass d1-export-integrity.mjs, verify
 * restore against an isolated SQLite instance and independently store it.
 *
 * Neither SQL bytes, storage locations, subjects nor secrets enter CI.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const THREE_HOURS_MS=3*60*60*1000;
const CLOCK_LEAD_MS=60*1000;
const HEX40=/^[a-f0-9]{40}$/u;
const HEX64=/^[a-f0-9]{64}$/u;
const ISO_UTC_SECONDS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

export function verifyBackupAttestation({
  releaseSha,attestedSha,backupSha256,verifiedAt,now=Date.now(),
}) {
  // GitHub's automatic merge SHA is not generally known before merging.
  // First main push can intentionally fail closed; operator must verify
  // the actual release SHA and re-run the workflow after attestation.
  if(typeof releaseSha!=='string' || !HEX40.test(releaseSha)
    || typeof attestedSha!=='string' || !HEX40.test(attestedSha)
    || attestedSha!==releaseSha
    || typeof backupSha256!=='string' || !HEX64.test(backupSha256)) {
    throw new Error('invalid_backup_release_attestation');
  }
  if(typeof verifiedAt!=='string' || !ISO_UTC_SECONDS.test(verifiedAt)) {
    throw new Error('invalid_backup_attestation_time');
  }
  const timestamp=Date.parse(verifiedAt);
  if(!Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().replace('.000Z','Z')!==verifiedAt
    || !Number.isFinite(now)
    || now-timestamp>THREE_HOURS_MS
    || now-timestamp< -CLOCK_LEAD_MS) {
    throw new Error('stale_or_future_backup_attestation');
  }
  return true;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    verifyBackupAttestation({
      releaseSha:process.env.GITHUB_SHA,
      attestedSha:process.env.HABER_D1_BACKUP_VERIFIED_RELEASE_SHA,
      backupSha256:process.env.HABER_D1_BACKUP_SQL_SHA256,
      verifiedAt:process.env.HABER_D1_BACKUP_VERIFIED_AT_UTC,
    });
    console.log('Haber D1: fresh commit-bound independent backup attestation accepted.');
  }catch{
    // Do NOT log checksum, SHA or timestamp. This is release operator state.
    console.error('Haber D1: independent backup attestation missing, stale or invalid; migrations BLOCKED.');
    process.exitCode=1;
  }
}
