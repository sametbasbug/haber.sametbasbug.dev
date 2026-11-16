import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fakeCanonicalSql} from './technology-backup-r2-smoke.mjs';
import {canonicalLegacySlugs} from './technology-legacy-permalinks.mjs';

const path='scripts/technology-backup-r2-smoke.mjs';
const source=readFileSync(path,'utf8');

test('synthetic R2 rehearsal never reads production DB or operator credentials',()=>{
  assert.match(source,/const BUCKET='haber-d1-private-backups'/u);
  assert.match(source,/const objectKey='checks\/cp41-synthetic-'/u);
  assert.match(source,/const key=randomBytes\(32\)/u);
  assert.match(source,/verifyEncryptedSqlBackupOffline\(retrieved,key\)/u);
  assert.match(source,/cf\(\['delete',objectKey/u);
  assert.doesNotMatch(source,/['"]d1['"],['"]export|['"]d1['"],['"]execute|readOperatorBackupKey\(/u);
  assert.ok(!source.includes('process.env.ORBIT_CLIENT_SECRET'));
  assert.ok(!source.includes("cf(['put','production-d1/"));
});

test('standalone synthetic SQL fixture uses 580 public slugs and 590 fake-only sources',()=>{
  const sql=fakeCanonicalSql().toString('utf8');
  assert.equal((sql.match(/INSERT INTO articles VALUES/g)||[]).length,580);
  assert.equal((sql.match(/INSERT INTO article_sources VALUES/g)||[]).length,590);
  assert.equal((sql.match(/INSERT INTO d1_migrations VALUES/g)||[]).length,11);
  assert.ok(sql.includes('SYNTHETIC_BACKUP_TEST_'));
  assert.ok(sql.includes('synthetic.invalid'));
  assert.ok(sql.includes(canonicalLegacySlugs()[140]));
  assert.ok(!sql.includes('orbit-agent-id'));
});

test('synthetic remote test never runs from standard quality and requires opt-in',()=>{
  const packageJSON=JSON.parse(readFileSync('package.json','utf8'));
  assert.equal(packageJSON.scripts['preflight:backup-r2-synthetic'],
    'node scripts/technology-backup-r2-smoke.mjs --confirm-synthetic-only');
  assert.ok(!packageJSON.scripts.quality.includes('preflight:backup-r2-synthetic'));
  assert.ok(!readFileSync('.github/workflows/deploy.yml','utf8')
    .includes('npm run preflight:backup-r2-synthetic'));
  for(const args of [[],['--bad-flag'],['--confirm-synthetic-only','extra']]){
    const result=spawnSync(process.execPath,[path,...args],{encoding:'utf8',timeout:5000});
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.match(result.stderr,/explicit --confirm-synthetic-only flag/u);
  }
});

test('production backup reader supports complete bounded R2 binary payloads',()=>{
  const production=readFileSync('scripts/technology-production-backup.mjs','utf8');
  assert.match(production,/maxBuffer:MAX_CIPHERTEXT_BYTES\+1024\*1024/u);
  assert.match(production,/verifyEncryptedSqlBackupOffline\(remote,key\)/u);
});
