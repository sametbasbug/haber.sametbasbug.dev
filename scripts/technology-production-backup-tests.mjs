import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
const file='scripts/technology-production-backup.mjs';
const code=readFileSync(file,'utf8');
test('fixed production D1 identity, dedicated encrypted-only R2, and no remote D1 mutation',()=>{
  assert.match(code,/const DB_ID='e2ebdbbc-9fcc-4f73-b7f2-215b87307bab'/u);
  assert.match(code,/const DB_NAME='haber'/u);
  assert.match(code,/const BACKUP_BUCKET='haber-d1-private-backups'/u);
  assert.match(code,/config.name!=='haber-site'/u);
  assert.match(code,/verifySqlExportFile\(raw\)/u);
  assert.match(code,/verifySqlExportFile\(restored\)/u);
  assert.match(code,/--output',raw,'--skip-confirmation'/u);
  assert.doesNotMatch(code,/'d1','execute'|'d1','migrations'|'d1','import'/u);
});
test('CLI rejects all extra arguments before remote operations',()=>{
  for(const args of [[],['--remote'],['--config=wrangler.staging.jsonc'],
    ['--confirm-readonly-production-export','--unexpected']]){
    const r=spawnSync(process.execPath,[file,...args],{encoding:'utf8',timeout:5000});
    assert.equal(r.status,1);
    assert.equal(r.stdout,'');
    assert.match(r.stderr,/refused or aborted/u);
  }
});
test('private Keychain, 0700 scratch, best-effort exit cleanup, no release attestation',()=>{
  assert.match(code,/KEYCHAIN_SERVICE='equinox-haber-production-d1-backup-aes256gcm-v1'/u);
  assert.ok(code.indexOf('key=keychainSecret()')<code.indexOf('runBinary(process.execPath,['),
    'operator Keychain availability MUST be required BEFORE live D1 export');
  assert.ok(!code.includes('add-generic-password'),
    'agent must never silently create or replace the operator encryption key');

  assert.match(code,/process.umask\(0o077\)/u);
  assert.match(code,/await rm\(dir,\{recursive:true,force:true\}\)/u);
  assert.match(code,/sql.fill\(0\)/u);
  assert.match(code,/plaintext.fill\(0\)/u);
  assert.match(code,/key\?\.fill\(0\)/u);
  assert.ok(!code.includes('HABER_D1_BACKUP_VERIFIED_RELEASE_SHA'));
});
