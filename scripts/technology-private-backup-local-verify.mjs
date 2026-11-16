/**
 * Human-opt-in OFFLINE restore validation for an existing encrypted HAB1 file.
 *
 * Never accesses production D1, R2, Orbit or OAuth credentials. Does not
 * decrypt to an owner-visible file: a private ephemeral SQL file is checked
 * and deleted. Requires an existing operator-owned macOS Keychain key.
 * Run from a trusted terminal, with a backup copied outside the repository.
 */
import {lstat,readFile} from 'node:fs/promises';
import {isAbsolute,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MAX_CIPHERTEXT_BYTES} from './technology-private-backup-crypto.mjs';
import {readOperatorBackupKey} from './technology-private-backup-keychain.mjs';
import {verifyEncryptedSqlBackupOffline} from './technology-private-backup-recovery.mjs';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));

export function validatePrivateOfflineBackupPath(path,attributes){
  if(typeof path!=='string'||!isAbsolute(path)
    ||extname(path)!=='.hab1'
    ||resolve(path)===ROOT||resolve(path).startsWith(ROOT+'/')
    ||!attributes.isFile()||attributes.isSymbolicLink()
    ||attributes.size<=100_000||attributes.size>MAX_CIPHERTEXT_BYTES){
    throw new Error('invalid_private_backup_input_file');
  }
  return true;
}

async function main(){
  if(process.argv.length!==4 || process.argv[2]!=='--verify-hab1'){
    throw new Error('explicit_offline_backup_path_required');
  }
  const path=process.argv[3];
  const info=await lstat(path);
  validatePrivateOfflineBackupPath(path,info);
  let key;
  try{
    key=readOperatorBackupKey();
    const encrypted=await readFile(path);
    const restored=await verifyEncryptedSqlBackupOffline(encrypted,key);
    console.log(JSON.stringify({
      status:'independent_offline_backup_verified',
      sqlSha256:restored.sqlSha256,
      historicalArticles:restored.published,
      sourceRows:restored.sourceCount,
      migrationLevel:restored.migrationLevel,
      encryptedInputUnmodified:true,
      noProductionDbAccess:true,
    }));
  }finally{
    key?.fill(0);
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{
    console.error('Offline encrypted backup restore FAILED or key unavailable. Never attest release.');
    process.exitCode=1;
  });
}
