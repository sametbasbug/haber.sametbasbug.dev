import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {test} from 'node:test';
import {encryptPrivateSqlBackup} from './technology-private-backup-crypto.mjs';
import {fakeCanonicalSql} from './technology-backup-r2-smoke.mjs';
import {verifyEncryptedSqlBackupOffline} from './technology-private-backup-recovery.mjs';
import {canonicalLegacySlugs} from './technology-legacy-permalinks.mjs';

const KEY=randomBytes(32);
const fixture=()=>fakeCanonicalSql();
const leftovers=()=>readdirSync(tmpdir()).filter(name=>name.startsWith('haber-private-offline-recovery-'));

test('fully offline separate process path recovers 580 public original slugs and 590 SYNTHETIC sources', async()=>{
  const sql=fixture();
  const cipher=encryptPrivateSqlBackup(sql,KEY);
  const originalHash=createHash('sha256').update(sql).digest('hex');
  const before=leftovers();
  const result=await verifyEncryptedSqlBackupOffline(cipher,KEY);
  assert.equal(result.published,580);
  assert.equal(result.sourceCount,590);
  assert.equal(result.migrationLevel,'historical-era');
  assert.equal(result.schema,'historical');
  assert.equal(result.sqlSha256,originalHash);
  assert.deepEqual(leftovers(),before,'plaintext temporary restore must not remain');
});

test('authenticated ciphertext containing wrong 0011 migration is rejected and cleaned',async()=>{
  const sql=fixture().toString('utf8');
  const previous=sql.match(/0011_[a-z0-9_]+\.sql/u)?.[0];
  assert.ok(previous,'fixture must contain 0011 migration');
  const modified=Buffer.from(sql.replace(previous,'0011_wrong_synthetic_migration.sql'));
  const before=leftovers();
  await assert.rejects(
    verifyEncryptedSqlBackupOffline(encryptPrivateSqlBackup(modified,KEY),KEY),
  );
  assert.deepEqual(leftovers(),before);
});

test('authenticated ciphertext with missing published source is rejected and cleaned',async()=>{
  const sql=fixture().toString('utf8');
  const target=canonicalLegacySlugs()[100];
  const source="INSERT INTO article_sources VALUES('"+target+"',0,'https://synthetic.invalid/source');";
  assert.ok(sql.includes(source));
  const modified=Buffer.from(sql.replace(source,'-- SYNTHETIC SOURCE REMOVED'));
  const before=leftovers();
  await assert.rejects(
    verifyEncryptedSqlBackupOffline(encryptPrivateSqlBackup(modified,KEY),KEY),
  );
  assert.deepEqual(leftovers(),before);
});

test('wrong key, edited tag, truncated payload fail before SQL touches disk',async()=>{
  const cipher=encryptPrivateSqlBackup(fixture(),KEY);
  const tampered=Buffer.from(cipher);
  tampered[tampered.length-1]^=1;
  const before=leftovers();
  await assert.rejects(verifyEncryptedSqlBackupOffline(cipher,randomBytes(32)));
  await assert.rejects(verifyEncryptedSqlBackupOffline(tampered,KEY));
  await assert.rejects(verifyEncryptedSqlBackupOffline(cipher.subarray(0,80),KEY));
  assert.deepEqual(leftovers(),before);
});
