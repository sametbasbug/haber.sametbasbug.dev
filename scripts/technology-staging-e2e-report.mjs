/**
 * Local, human-controlled checklist for a completed LIVE staging acceptance.
 *
 * Never performs OAuth, signs tokens, accesses credentials, reads D1 or runs
 * HTTP requests. It only validates a deliberately REDACTED, boolean-only
 * local report and prints its SHA-256 as an operator attestation checksum.
 * A green report is a human claim, NOT cryptographic proof of the live tests.
 *
 * Invoke with a private JSON report on stdin and keep that report outside
 * Git, CI, chat logs and tool calls. Do not run until acceptance is REAL.
 */
import {createHash} from 'node:crypto';
import {parseTree} from 'jsonc-parser';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const MAX_BYTES = 8192;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA40 = /^[0-9a-f]{40}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
export const REQUIRED_STAGING_CHECKS = Object.freeze([
  'ownerConsentRecorded',
  'oauthCodeExchangedForTokens',
  'pairwiseHaberSessionVerified',
  'ownerAgentAccessExplicitlyEnabled',
  'realOrbitSignedGuestReadSucceeded',
  'unsignedReadRejected',
  'wrongAudienceRejected',
  'unapprovedWriteRejected',
  'fourPublishersStageAuthorizationsVerified',
  'administratorStageAuthorizationVerified',
  'stagingNoindexVerified',
  'noProductionWrites',
]);

function exactFields(value,expected) {
  if(!value || typeof value!=='object' || Array.isArray(value)) return false;
  const names=Object.keys(value).sort();
  return names.length===expected.length
    && names.every((name,i)=>name===expected[i]);
}
const rootFields=['checks','haberWorkerVersion','orbitWorkerVersion','releaseSha','schema','verifiedAt'];
const checkFields=[...REQUIRED_STAGING_CHECKS].sort();

export function parseStagingOperatorReport(input) {
  // JSON.parse silently accepts duplicate object keys. An operator could
  // unknowingly review an earlier false checkbox while a later duplicate
  // true checkbox wins. Reject ALL duplicates before doing any evaluation.
  const errors=[];
  const tree=parseTree(input,errors,{allowTrailingComma:false,disallowComments:true});
  if(errors.length || !tree)throw new Error('staging_e2e_report_invalid_json');
  function visit(node) {
    if(node.type==='object') {
      const seen=new Set();
      for(const property of node.children??[]) {
        const [key,value]=property.children??[];
        if(!key || !value || typeof key.value!=='string'
          || seen.has(key.value)) {
          throw new Error('staging_e2e_report_duplicate_or_invalid_key');
        }
        seen.add(key.value);
        visit(value);
      }
    }else if(node.type==='array') {
      for(const child of node.children??[])visit(child);
    }
  }
  visit(tree);
  return JSON.parse(input);
}

export function verifyStagingE2eOperatorReport(report) {
  if(!exactFields(report,rootFields)
    || report.schema!=='haber-staging-e2e-v1'
    || !SHA40.test(report.releaseSha)
    || !UUID.test(report.haberWorkerVersion)
    || !UUID.test(report.orbitWorkerVersion)
    || !UTC.test(report.verifiedAt)
    || !Number.isFinite(Date.parse(report.verifiedAt))
    || new Date(report.verifiedAt).toISOString().replace('.000Z','Z')!==report.verifiedAt
    || !exactFields(report.checks,checkFields)) {
    throw new Error('invalid_or_unredacted_staging_e2e_operator_report');
  }
  if(REQUIRED_STAGING_CHECKS.some(check=>report.checks[check]!==true)) {
    throw new Error('staging_e2e_acceptance_incomplete');
  }
  // Fixed field ordering yields a stable checksum regardless of the private
  // operator report's JSON key order or whitespace.
  const normalized={
    schema:report.schema,
    releaseSha:report.releaseSha,
    haberWorkerVersion:report.haberWorkerVersion,
    orbitWorkerVersion:report.orbitWorkerVersion,
    verifiedAt:report.verifiedAt,
    checks:Object.fromEntries(REQUIRED_STAGING_CHECKS.map(check=>[check,true])),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  (async()=>{
    if(process.argv.length!==2)throw new Error('no_flags_or_alternate_report_paths');
    let input='',bytes=0;
    for await(const chunk of process.stdin) {
      bytes+=Buffer.byteLength(chunk);
      if(bytes>MAX_BYTES)throw new Error('oversized_operator_report');
      input+=chunk;
    }
    const digest=verifyStagingE2eOperatorReport(parseStagingOperatorReport(input));
    process.stdout.write('HABER_STAGING_E2E_REPORT_SHA256='+digest+'\n');
  })().catch(()=>{
    // Do NOT print any report field, JSON parse error, identity or secret.
    console.error('Staging E2E: report missing, incomplete or unredacted; do not attest.');
    process.exitCode=1;
  });
}
