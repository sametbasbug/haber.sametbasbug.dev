/**
 * Optional real R2 transport check for the HAB1 encrypted backup format.
 *
 * NEVER accesses production D1, OAuth credentials, Keychain, or real article
 * text. Uses public canonical slugs with synthetic titles and fake sources.
 * Encrypts with a one-use TEST-ONLY ephemeral key, uploads ONLY ciphertext
 * under the checks/ prefix, verifies real download, decrypts/validates
 * OFFLINE and removes both R2 test object and temporary files.
 *
 * This is NOT a real independently recoverable production backup.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  encryptPrivateSqlBackup,MAX_CIPHERTEXT_BYTES,
} from './technology-private-backup-crypto.mjs';
import {canonicalLegacySlugs} from './technology-legacy-permalinks.mjs';
import {verifySqlExportFile} from './d1-export-integrity.mjs';
import {verifyEncryptedSqlBackupOffline} from './technology-private-backup-recovery.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CF='/opt/homebrew/bin/cf';
const BUCKET='haber-d1-private-backups';

function cf(args, maxBuffer=MAX_CIPHERTEXT_BYTES+1024*1024) {
  return execFileSync(CF,['r2','objects',...args],{
    cwd:ROOT,timeout:90_000,maxBuffer,
    stdio:['pipe','pipe','pipe'],
  });
}
export function fakeCanonicalSql(){
  const slugs=canonicalLegacySlugs();
  assert.equal(slugs.length,580);
  const migrations=readdirSync(new URL('../worker/migrations/',import.meta.url))
    .filter(name=>/^\d{4}_.+\.sql$/u.test(name)).sort().slice(0,11);
  assert.equal(migrations.length,11);
  const parts=[
    'BEGIN TRANSACTION;',
    'CREATE TABLE articles(slug TEXT PRIMARY KEY,title TEXT,is_draft INTEGER DEFAULT 0);',
    'CREATE TABLE article_sources(slug TEXT,position INTEGER,url TEXT);',
    'CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT);',
  ];
  for(const [i,slug] of slugs.entries()){
    parts.push("INSERT INTO articles VALUES('"+slug+"','SYNTHETIC_BACKUP_TEST_"+i+"',0);");
    parts.push("INSERT INTO article_sources VALUES('"+slug+"',0,'https://synthetic.invalid/source');");
    if(i<10)parts.push("INSERT INTO article_sources VALUES('"+slug+"',1,'https://synthetic.invalid/extra');");
  }
  migrations.forEach((name,i)=>parts.push(
    "INSERT INTO d1_migrations VALUES("+(i+1)+",'"+name+"');",
  ));
  parts.push('COMMIT;');
  return Buffer.from(parts.join('\n')+'\n','utf8');
}

export async function runSyntheticR2BackupSmoke() {
  const privateMask=process.umask(0o077);
  const dir=await mkdtemp(join(tmpdir(),'haber-r2-synthetic-backup-'));
  const objectKey='checks/cp41-synthetic-'+randomUUID()+'.hab1';
  const removeOnExit=()=>{try{rmSync(dir,{recursive:true,force:true});}catch{}};
  process.once('exit',removeOnExit);
  const key=randomBytes(32);
  let uploaded=false;
  try{
    const sql=fakeCanonicalSql();
    const plaintext=join(dir,'synthetic.sql');
    const ciphertext=join(dir,'synthetic.hab1');
    await writeFile(plaintext,sql,{mode:0o600,flag:'wx'});
    const initial=verifySqlExportFile(plaintext);
    assert.equal(initial.published,580);
    assert.equal(initial.sourceCount,590);
    assert.equal(initial.migrationLevel,'historical-era');
    const content=encryptPrivateSqlBackup(sql,key);
    await writeFile(ciphertext,content,{mode:0o600,flag:'wx'});
    const encryptedHash=createHash('sha256').update(content).digest('hex');
    const sqlHash=createHash('sha256').update(sql).digest('hex');
    sql.fill(0);
    cf(['put',objectKey,'--bucket-name',BUCKET,
      '--file',ciphertext,'--content-type','application/octet-stream','--quiet'],4096);
    uploaded=true;
    const retrieved=cf(['get',objectKey,'--bucket-name',BUCKET,'--quiet']);
    assert.equal(createHash('sha256').update(retrieved).digest('hex'),encryptedHash);
    const result=await verifyEncryptedSqlBackupOffline(retrieved,key);
    assert.equal(result.sqlSha256,sqlHash);
    assert.equal(result.published,580);
    assert.equal(result.sourceCount,590);
    assert.equal(result.migrationLevel,'historical-era');
    return {result:'encrypted_r2_roundtrip_and_offline_restore_pass',
      published:result.published,sourceRows:result.sourceCount, migrationLevel:result.migrationLevel,
      productionDataRead:false, operatorKeyUsed:false};
  } finally{
    key.fill(0);
    try{
      cf(['delete',objectKey,'--bucket-name',BUCKET,'--force','--quiet'],4096);
    }catch{
      if(uploaded)throw new Error('synthetic_R2_object_cleanup_failed');
    }finally{
      await rm(dir,{recursive:true,force:true});
      process.removeListener('exit',removeOnExit);
      process.umask(privateMask);
    }
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3||process.argv[2]!=='--confirm-synthetic-only'){
    console.error('Synthetic R2 smoke requires explicit --confirm-synthetic-only flag.');
    process.exitCode=1;
  }else{
    runSyntheticR2BackupSmoke().then(x=>console.log(JSON.stringify(x)))
      .catch(()=>{console.error('Synthetic R2 encryption/restore/cleanup gate FAILED.');process.exitCode=1;});
  }
}
