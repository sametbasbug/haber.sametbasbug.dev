import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {test} from 'node:test';
import {
  encryptPrivateSqlBackup, decryptPrivateSqlBackup,
} from './technology-private-backup-crypto.mjs';

const SYNTHETIC_SQL=Buffer.from('-- Synthetic SQLite backup test only\\n'+
  'CREATE TABLE example(id INTEGER PRIMARY KEY);\\n'.repeat(4000));
const KEY=randomBytes(32);

test('authenticated envelope roundtrips a synthetic SQL dump',()=>{
  const ciphertext=encryptPrivateSqlBackup(SYNTHETIC_SQL,KEY);
  assert.equal(ciphertext.subarray(0,4).toString('ascii'),'HAB1');
  assert.ok(!ciphertext.includes(Buffer.from('CREATE TABLE example')));
  assert.deepEqual(decryptPrivateSqlBackup(ciphertext,KEY),SYNTHETIC_SQL);
  assert.notDeepEqual(encryptPrivateSqlBackup(SYNTHETIC_SQL,KEY),ciphertext,
    'each encryption MUST have a fresh nonce');
});

test('wrong key, modified ciphertext, nonce or auth tag cannot restore',()=>{
  const valid=encryptPrivateSqlBackup(SYNTHETIC_SQL,KEY);
  const candidates=[randomBytes(32)];
  for(const index of [0,4,8,25,valid.length-1]){
    const tampered=Buffer.from(valid);
    tampered[index]^=1;
    candidates.push(tampered);
  }
  assert.throws(()=>decryptPrivateSqlBackup(valid,candidates[0]));
  for(const modified of candidates.slice(1)){
    assert.throws(()=>decryptPrivateSqlBackup(modified,KEY));
  }
});

test('empty, truncated, huge and malformed exports refuse encryption or decryption',()=>{
  assert.throws(()=>encryptPrivateSqlBackup(Buffer.alloc(1024),KEY));
  assert.throws(()=>encryptPrivateSqlBackup(SYNTHETIC_SQL,Buffer.alloc(31)));
  assert.throws(()=>encryptPrivateSqlBackup(SYNTHETIC_SQL,KEY,Buffer.alloc(8)));
  assert.throws(()=>decryptPrivateSqlBackup(Buffer.from('HAB1'),KEY));
  assert.throws(()=>decryptPrivateSqlBackup(Buffer.alloc(1024),KEY));
});
