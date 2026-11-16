import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {verifyStagingE2eAttestation} from './technology-staging-e2e-attestation.mjs';

const valid = {
  releaseSha:'1'.repeat(40),
  attestedReleaseSha:'1'.repeat(40),
  acceptanceSha256:'2'.repeat(64),
  verifiedAt:'2026-11-16T12:40:00Z',
  now:Date.parse('2026-11-16T13:00:00Z'),
};

test('release-bound, fresh staging acceptance attestation succeeds at 3h and 60s boundaries',()=>{
  assert.equal(verifyStagingE2eAttestation(valid),true);
  assert.equal(verifyStagingE2eAttestation({
    ...valid,verifiedAt:'2026-11-16T10:00:00Z',
  }),true);
  assert.equal(verifyStagingE2eAttestation({
    ...valid,verifiedAt:'2026-11-16T13:01:00Z',
  }),true);
});

test('missing, forged, stale or mismatched staging acceptance fails closed',()=>{
  const changes=[
    {attestedReleaseSha:'3'.repeat(40)},
    {releaseSha:'bad'},
    {attestedReleaseSha:''},
    {attestedReleaseSha:undefined},
    {acceptanceSha256:undefined},
    {acceptanceSha256:''},
    {acceptanceSha256:'3'.repeat(63)},
    {acceptanceSha256:'x'.repeat(64)},
    {verifiedAt:'2026-11-16T09:59:59Z'},
    {verifiedAt:'2026-11-16T13:01:01Z'},
    {verifiedAt:'2026-11-16T12:40:00+00:00'},
    {verifiedAt:'2026-11-16 12:40:00Z'},
    {verifiedAt:'2026-11-16T12:40:00.000Z'},
    {verifiedAt:'2026-11-31T12:40:00Z'},
    {now:NaN},
    {verifiedAt:undefined},
  ];
  for (const change of changes) {
    assert.throws(()=>verifyStagingE2eAttestation({...valid,...change}),
      'invalid staging attestation must block migrations');
  }
});

test('real CLI blocks absent operator state without echoing fingerprints',()=>{
  const run=spawnSync(process.execPath,
    ['scripts/technology-staging-e2e-attestation.mjs'],{
      env:{...process.env,GITHUB_SHA:valid.releaseSha,
        HABER_STAGING_E2E_VERIFIED_RELEASE_SHA:valid.attestedReleaseSha,
        HABER_STAGING_E2E_REPORT_SHA256:'',
        HABER_STAGING_E2E_VERIFIED_AT_UTC:valid.verifiedAt,
      },
      encoding:'utf8',
    });
  assert.equal(run.status,1);
  assert.match(run.stderr,/BLOCKED/u);
  assert.ok(!run.stderr.includes(valid.releaseSha));
  assert.ok(!run.stderr.includes(valid.acceptanceSha256));
});
