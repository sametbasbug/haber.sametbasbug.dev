/**
 * Independent local restore verifier for a HAB1 encrypted backup.
 *
 * This module does NOT access Cloudflare, production D1, Keychain or any
 * actual account; the caller supplies already-held encrypted bytes and
 * 32-byte key. The SQL exists only in a private temporary file while the
 * existing strict archive and migration integrity checker runs.
 */
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decryptPrivateSqlBackup} from './technology-private-backup-crypto.mjs';
import {verifySqlExportFile} from './d1-export-integrity.mjs';

export async function verifyEncryptedSqlBackupOffline(ciphertext, key) {
  const plaintext=decryptPrivateSqlBackup(ciphertext,key);
  let dir;
  try{
    const sqlSha256=createHash('sha256').update(plaintext).digest('hex');
    dir=await mkdtemp(join(tmpdir(),'haber-private-offline-recovery-'));
    const path=join(dir,'verified-only.sql');
    await writeFile(path,plaintext,{mode:0o600,flag:'wx'});
    const result=verifySqlExportFile(path);
    if(result.published<580 || result.sourceCount<590
      || !['historical-era','technology-era'].includes(result.migrationLevel)) {
      throw new Error('offline_sql_backup_invalid_baseline');
    }
    return {sqlSha256,published:result.published,
      sourceCount:result.sourceCount,
      migrationLevel:result.migrationLevel,schema:result.schema};
  }finally{
    plaintext.fill(0);
    if(dir)await rm(dir,{recursive:true,force:true});
  }
}
