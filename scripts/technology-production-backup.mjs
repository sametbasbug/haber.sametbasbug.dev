/**
 * Opt-in read-only production D1 export and independently encrypted R2 backup.
 * ONLY remote D1 operation is Wrangler export. Plaintext SQL exists only in
 * mode-0700 ephemeral directory; no plaintext/keys enter logs, CI or R2.
 * Requires owner escrow of the macOS Keychain key in an independent vault.
 * DOES NOT automatically attest release or migrate any database.
 */
import {execFileSync} from 'node:child_process';
import {createHash,timingSafeEqual} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encryptPrivateSqlBackup,MAX_CIPHERTEXT_BYTES} from './technology-private-backup-crypto.mjs';
import {readHaberProductionConfig} from './technology-staging-config-check.mjs';
import {verifySqlExportFile} from './d1-export-integrity.mjs';
import {verifyEncryptedSqlBackupOffline} from './technology-private-backup-recovery.mjs';
import {readOperatorBackupKey} from './technology-private-backup-keychain.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const WRANGLER=resolve(ROOT,'node_modules/wrangler/bin/wrangler.js');
const CONFIG='./wrangler.ssr.jsonc';
const DB_ID='e2ebdbbc-9fcc-4f73-b7f2-215b87307bab';
const DB_NAME='haber';
const BACKUP_BUCKET='haber-d1-private-backups';

function runBinary(binary,args,{input,maxBuffer=24*1024*1024}={}){
  return execFileSync(binary,args,{
    cwd:ROOT,env:{...process.env,CI:'true',NO_COLOR:'1'},
    input,maxBuffer,timeout:120_000,stdio:['pipe','pipe','pipe'],
  });
}
function assertFixedProductionTarget(){
  const config=readHaberProductionConfig();
  const dbs=config.d1_databases;
  if(config.name!=='haber-site'
    || !Array.isArray(dbs)||dbs.length!==1
    || dbs[0].binding!=='DB'||dbs[0].database_name!==DB_NAME
    || dbs[0].database_id!==DB_ID
    || dbs[0].migrations_dir!=='worker/migrations'
    || config.r2_buckets?.[0]?.bucket_name!=='haber-gorseller') {
    throw new Error('production_backup_target_not_verified');
  }
}
async function main(){
  if(process.argv.length!==3 || process.argv[2]!=='--confirm-readonly-production-export')
    throw new Error('explicit_readonly_production_export_flag_required');
  assertFixedProductionTarget();
  const previousUmask=process.umask(0o077);
  let phase='operator_keychain_preflight',key=null;
  // BEFORE the first production D1 read, require the operator-owned key.
  // If Keychain is absent/locked there is no SQL export to clean up.
  try {
    key=readOperatorBackupKey();
  } catch {
    process.umask(previousUmask);
    throw new Error('operator_encryption_key_required_before_export');
  }
  let dir;
  try{
    dir=await mkdtemp(join(tmpdir(),'haber-production-d1-private-backup-'));
  }catch{
    key.fill(0);
    process.umask(previousUmask);
    throw new Error('private_backup_scratch_unavailable');
  }
  const removeOnExit=()=>{try{rmSync(dir,{recursive:true,force:true});}catch{}};
  const onSignal=(number)=>{removeOnExit();process.exit(number);};
  const onInterrupt=()=>onSignal(130);
  const onTerminate=()=>onSignal(143);
  process.once('exit',removeOnExit);
  process.once('SIGINT',onInterrupt);
  process.once('SIGTERM',onTerminate);
  try{
    const raw=join(dir,'production.sql');
    const encryptedPath=join(dir,'encrypted.hab1');
    // Read only; SQL bytes, stdout and stderr never exposed.
    runBinary(process.execPath,[
      WRANGLER,'d1','export','DB','--remote','--config',CONFIG,
      '--output',raw,'--skip-confirmation',
    ]);
    phase='verify_original_export';
    const initial=verifySqlExportFile(raw);
    if(initial.published!==580||initial.sourceCount!==590
      ||initial.migrationLevel!=='historical-era'
      ||initial.schema!=='historical') {
      throw new Error('live_database_not_at_verified_0011_baseline');
    }
    const sql=await readFile(raw);
    let sqlSha256,cipher;
    try{
      sqlSha256=createHash('sha256').update(sql).digest('hex');
      phase='encrypt';
      cipher=encryptPrivateSqlBackup(sql,key);
    }finally{
      sql.fill(0);
    }
    await writeFile(encryptedPath,cipher,{mode:0o600,flag:'wx'});
    const encryptedSha256=createHash('sha256').update(cipher).digest('hex');
    const now=new Date().toISOString().replace(/[:.]/gu,'-');
    const objectKey='production-d1/'+now+'-'+encryptedSha256.slice(0,16)+'.hab1';
    phase='upload_encrypted';
    // Cloudflare plugin cannot upload a locally encrypted binary safely.
    // Official authenticated cf CLI streams ciphertext without decryption key.
    runBinary('/opt/homebrew/bin/cf',[
      'r2','objects','put',objectKey,'--bucket-name',BACKUP_BUCKET,
      '--file',encryptedPath,'--content-type','application/octet-stream',
      '--quiet',
    ],{maxBuffer:4096});
    phase='independent_remote_fetch';
    const remote=runBinary('/opt/homebrew/bin/cf',[
      'r2','objects','get',objectKey,'--bucket-name',BACKUP_BUCKET,
      '--quiet',
    ],{maxBuffer:MAX_CIPHERTEXT_BYTES+1024*1024});
    if(!timingSafeEqual(createHash('sha256').update(remote).digest(),
      Buffer.from(encryptedSha256,'hex')))
      throw new Error('r2_ciphertext_roundtrip_digest_mismatch');
    phase='offsite_decrypt_restore';
    const verified=await verifyEncryptedSqlBackupOffline(remote,key);
    if(verified.sqlSha256!==sqlSha256
      ||verified.published!==580 || verified.sourceCount!==590
      ||verified.migrationLevel!=='historical-era') {
      throw new Error('remote_backup_offline_restore_integrity_failed');
    }
    console.log(JSON.stringify({
      status:'encrypted_remote_backup_verified',bucket:BACKUP_BUCKET,
      objectKey,format:'AES-256-GCM/HAB1',
      sqlSha256,ciphertextSha256:encryptedSha256,
      historicalPublished:verified.published,sourceRows:verified.sourceCount,
      migrationLevel:verified.migrationLevel,encryptedBytes:remote.length,
      localOfflineRestore:'verified',
      keyStorage:'macOS Keychain; independent recovery key escrow still required',
      releaseAttestation:'NOT_SET',
    }));
  }catch{
    console.error('Haber production D1 backup failed closed at '+phase+'. Do not attest release.');
    process.exitCode=1;
  }finally{
    key?.fill(0);
    let cleaned=false;
    try{
      await rm(dir,{recursive:true,force:true});
      cleaned=true;
    }finally{
      if(cleaned)process.removeListener('exit',removeOnExit);
      process.removeListener('SIGINT',onInterrupt);
      process.removeListener('SIGTERM',onTerminate);
      process.umask(previousUmask);
    }
  }
}
main().catch(()=>{
  console.error('Haber production backup setup refused or aborted before completion.');
  process.exitCode=1;
});
