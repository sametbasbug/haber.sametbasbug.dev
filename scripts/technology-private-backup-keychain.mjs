/**
 * Owner-controlled backup key retrieval.
 *
 * This module ONLY reads an already existing macOS Keychain item.
 * It never creates, modifies, outputs or transfers a credential.
 * The recovery key must also be independently escrowed by the owner.
 */
import {execFileSync} from 'node:child_process';

export const BACKUP_KEYCHAIN_SERVICE='equinox-haber-production-d1-backup-aes256gcm-v1';
export const BACKUP_KEYCHAIN_ACCOUNT='equinox-haber';

export function readOperatorBackupKey(){
  let secret;
  try{
    secret=execFileSync('/usr/bin/security',[
      'find-generic-password','-s',BACKUP_KEYCHAIN_SERVICE,
      '-a',BACKUP_KEYCHAIN_ACCOUNT,'-w',
    ],{timeout:15_000,maxBuffer:1024,stdio:['pipe','pipe','pipe']});
  }catch{
    throw new Error('operator_keychain_recovery_key_unavailable');
  }
  try{
    const text=secret.toString('utf8').trim();
    if(!/^[a-f0-9]{64}$/u.test(text))throw new Error('operator_backup_key_invalid');
    return Buffer.from(text,'hex');
  }finally{
    secret.fill(0);
  }
}
