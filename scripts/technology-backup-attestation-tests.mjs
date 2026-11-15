import assert from 'node:assert/strict';
import {verifyBackupAttestation} from './technology-backup-attestation.mjs';
import {requiresBackupForMigrations} from './technology-pre-migration-check.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const releaseSha='a'.repeat(40);
const backupHash='b'.repeat(64);
const now=Date.parse('2026-11-16T03:00:00.000Z');
const valid={
  releaseSha,
  attestedSha:releaseSha,
  backupSha256:backupHash,
  verifiedAt:'2026-11-16T02:40:00Z',
  now,
};
let cases=0;
function accept(mod={},message='valid isolated release attestation'){
  assert.equal(verifyBackupAttestation({...valid,...mod}),true,message);cases++;
}
function reject(mod={},message='invalid attestation must be rejected'){
  assert.throws(()=>verifyBackupAttestation({...valid,...mod}),Error,message);cases++;
}
accept();
accept({verifiedAt:'2026-11-16T00:00:00Z'},'exact three-hour boundary accepted');
reject({verifiedAt:'2026-11-15T23:59:59Z'},'stale backup sign-off rejected');
reject({verifiedAt:'2026-11-16T03:01:01Z'},'future approval rejected');
accept({verifiedAt:'2026-11-16T03:01:00Z'},'at most 60s clock lead');
reject({verifiedAt:'2026-11-16T03:00:00+00:00'},'UTC canonical timestamp required');
reject({verifiedAt:'2026-11-16 02:40:00Z'},'ISO timestamp required');
reject({verifiedAt:'2026-02-30T02:40:00Z'},'calendar invalid');
reject({verifiedAt:'2026-11-16T02:40:00.100Z'},'use canonical full seconds');
reject({attestedSha:'c'.repeat(40)},'different release must not inherit backup sign-off');
reject({releaseSha:'abc'},'release must be a full Git commit SHA');
reject({attestedSha:''},'empty approval must fail closed');
reject({attestedSha:'a'.repeat(39)},'truncated approval cannot match');
reject({attestedSha:'A'.repeat(40)},'full lowercase commit sha required');
reject({backupSha256:''},'backup checksum cannot be omitted');
reject({backupSha256:'1234'},'backup checksum must be full SHA-256');
reject({backupSha256:'z'.repeat(64)},'backup checksum must be hexadecimal');
reject({now:NaN},'invalid server time must fail closed');
reject({verifiedAt:undefined},'unconfigured environment fails closed');
reject({backupSha256:undefined},'unconfigured checksum fails closed');
reject({releaseSha:undefined},'unconfigured release hash fails closed');
const m=Array.from({length:16},(_,i)=>String(i+1).padStart(4,'0')+'_synthetic.sql');
assert.equal(requiresBackupForMigrations('historical-0011',m),true);cases++;
assert.equal(requiresBackupForMigrations('technology-0016',m),false);cases++;
assert.equal(requiresBackupForMigrations('technology-0016',[...m,'0017_synthetic.sql']),true);cases++;
assert.throws(()=>requiresBackupForMigrations('technology-0016',m.slice(0,15)));cases++;
assert.throws(()=>requiresBackupForMigrations('technology-0016',[...m,m[15]]));cases++;
assert.throws(()=>requiresBackupForMigrations('unknown-era',m));cases++;

const old={
  valid_publisher_anchors:2,authorized_publishers:2,seeded_new_agent_rows:0,
  technology_schema_tables:0,active_legacy_keys:0,applied_migrations:11,
  latest_migration:'0011_article_withdrawals.sql',historical_published:580,
  orphan_sources:0,
};
const modern={...old,authorized_publishers:4,seeded_new_agent_rows:2,
  technology_schema_tables:4,applied_migrations:16,
  latest_migration:'0016_technology_agent_action_idempotency.sql'};
const tmp=mkdtempSync(join(tmpdir(),'haber-backup-github-output-'));
try {
  const output=join(tmp,'action-output');
  for(const [row,status,expected] of [
    [old,0,'backup_required=true\n'],
    [modern,0,'backup_required=false\n'],
    [{...old,applied_migrations:15},1,''],
  ]){
    writeFileSync(output,'');
    const run=spawnSync(process.execPath,['scripts/technology-pre-migration-check.mjs'],{
      env:{...process.env,GITHUB_OUTPUT:output},
      input:JSON.stringify([{success:true,results:[row]}]),encoding:'utf8',
    });
    assert.equal(run.status,status,'D1 preflight command must not incorrectly mark migrations ready');
    assert.equal(readFileSync(output,'utf8'),expected,
      'GitHub Output must fail closed and differ for 0011 vs 0016');
    cases++;
  }
}finally{rmSync(tmp,{recursive:true,force:true});}
const freshUtc=new Date(Date.now()-10_000).toISOString().replace(/\.\d{3}Z$/u,'Z');
const cli=spawnSync(process.execPath,['scripts/technology-backup-attestation.mjs'],{
  env:{...process.env,GITHUB_SHA:releaseSha,
    HABER_D1_BACKUP_VERIFIED_RELEASE_SHA:releaseSha,
    HABER_D1_BACKUP_SQL_SHA256:backupHash,
    HABER_D1_BACKUP_VERIFIED_AT_UTC:freshUtc,
  },encoding:'utf8',
});
assert.equal(cli.status,0,'fresh commit-bound attestation should pass in actual CLI');cases++;
assert.doesNotMatch(cli.stdout,/(?:a{10}|b{10})/u,'never print SQL or commit fingerprint');

console.log('Haber independent D1 backup attestation:',cases,'positive/negative cases passed');
