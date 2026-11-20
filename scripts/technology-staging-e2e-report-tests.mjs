import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {parseStagingOperatorReport,verifyStagingE2eOperatorReport,REQUIRED_STAGING_CHECKS} from './technology-staging-e2e-report.mjs';

const report={
  schema:'haber-staging-e2e-v1',
  releaseSha:'1'.repeat(40),
  haberWorkerVersion:'11111111-1111-4111-8111-111111111111',
  orbitWorkerVersion:'22222222-2222-4222-8222-222222222222',
  verifiedAt:'2026-11-16T13:00:00Z',
  checks:Object.fromEntries(REQUIRED_STAGING_CHECKS.map(check=>[check,true])),
};

test('fixed-field complete human operator checklist produces a stable digest',()=>{
  const digest=verifyStagingE2eOperatorReport(report);
  assert.match(digest,/^[a-f0-9]{64}$/u);
  const reordered={
    checks:Object.fromEntries([...REQUIRED_STAGING_CHECKS].reverse().map(check=>[check,true])),
    verifiedAt:report.verifiedAt,
    orbitWorkerVersion:report.orbitWorkerVersion,
    haberWorkerVersion:report.haberWorkerVersion,
    releaseSha:report.releaseSha,
    schema:report.schema,
  };
  assert.equal(verifyStagingE2eOperatorReport(reordered),digest);
  assert.notEqual(verifyStagingE2eOperatorReport({...report,verifiedAt:'2026-11-16T13:01:00Z'}),digest);
});

test('incomplete, wrong-origin, unredacted or malformed operator reports are refused',()=>{
  const unsafe=[
    {...report,checks:{...report.checks,oauthCodeExchangedForTokens:false}},
    {...report,checks:{...report.checks,realOrbitSignedGuestReadSucceeded:null}},
    {...report,checks:{...report.checks,token:'very-private-value'}},
    {...report,checks:Object.fromEntries(REQUIRED_STAGING_CHECKS.slice(1).map(check=>[check,true]))},
    {...report,bearer:'do-not-print'},
    {...report,releaseSha:'ABC'},
    {...report,haberWorkerVersion:'missing'},
    {...report,orbitWorkerVersion:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'},
    {...report,verifiedAt:'2026-11-16T13:00:00.000Z'},
    {...report,schema:'haber-production-e2e-v1'},
    {...report,verifiedAt:'2026-02-30T13:00:00Z'},
    null,
  ];
  for(const item of unsafe)assert.throws(()=>verifyStagingE2eOperatorReport(item));
});

test('CLI fails closed and never prints a rejected report or private content',()=>{
  const secret='synthetic-private-value-never-a-real-credential';
  const run=spawnSync(process.execPath,['scripts/technology-staging-e2e-report.mjs'],{
    input:JSON.stringify({...report,secret}),encoding:'utf8',
  });
  assert.equal(run.status,1);
  assert.equal(run.stdout,'');
  assert.ok(!run.stderr.includes(secret));
  const ok=spawnSync(process.execPath,['scripts/technology-staging-e2e-report.mjs'],{
    input:JSON.stringify(report),encoding:'utf8',
  });
  assert.equal(ok.status,0);
  assert.equal(ok.stdout.trim(),
    'HABER_STAGING_E2E_REPORT_SHA256='+verifyStagingE2eOperatorReport(report));
});


test('duplicate JSON fields and comment syntax cannot override a failed human checkbox',()=>{
  const source=JSON.stringify(report);
  const duplicate=source.replaceAll('"oauthCodeExchangedForTokens":true',
    '"oauthCodeExchangedForTokens":false,"oauthCodeExchangedForTokens":true');
  assert.throws(()=>parseStagingOperatorReport(duplicate),/duplicate_or_invalid_key/u);
  assert.throws(()=>parseStagingOperatorReport(
    source.replaceAll('"schema":"haber-staging-e2e-v1"',
      '"schema":"incorrect","schema":"haber-staging-e2e-v1"'),
  ),/duplicate_or_invalid_key/u);
  assert.throws(()=>parseStagingOperatorReport(source.replace('{','{/*comment*/')),
    /invalid_json/u);
  assert.equal(parseStagingOperatorReport(source).schema,'haber-staging-e2e-v1');
});
