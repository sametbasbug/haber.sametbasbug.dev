import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,symlinkSync,rmSync,statSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {test} from 'node:test';
import {validatePrivateOfflineBackupPath} from './technology-private-backup-local-verify.mjs';

const tool='scripts/technology-private-backup-local-verify.mjs';
const source=readFileSync(tool,'utf8');

test('local recovery CLI does not access Cloudflare, production D1 or external network',()=>{
  assert.match(source,/readOperatorBackupKey\(\)/u);
  assert.match(source,/verifyEncryptedSqlBackupOffline\(encrypted,key\)/u);
  assert.doesNotMatch(source,/wrangler|Cloudflare|cloudflare\.request|execFileSync|spawnSync|fetch\(/iu);
  assert.doesNotMatch(source,/writeFile|writeFileSync|delete.*production/iu);
  assert.match(source,/key\?\.fill\(0\)/u);
});

test('only absolute, existing regular ciphertext outside repo is a valid local input',()=>{
  const dir=mkdtempSync(join(tmpdir(),'haber-recovery-path-test-'));
  try{
    const good=join(dir,'test.hab1');
    writeFileSync(good,Buffer.alloc(150_000,0),{mode:0o600});
    const stats=lstatSync(good);
    assert.equal(validatePrivateOfflineBackupPath(good,stats),true);
    for(const bad of [
      'relative-backup.hab1',
      join(dir,'test.sql'),
      join(dir,'fake.hab1/..'),
      resolve('scripts/synthetic.hab1'),
      '/',
    ]){
      assert.throws(()=>validatePrivateOfflineBackupPath(bad,stats));
    }
    const link=join(dir,'symlink.hab1');
    symlinkSync(good,link);
    assert.throws(()=>validatePrivateOfflineBackupPath(link,lstatSync(link)));
    assert.throws(()=>validatePrivateOfflineBackupPath(dir,lstatSync(dir)));
    assert.throws(()=>validatePrivateOfflineBackupPath(good,{
      isFile:()=>true,isSymbolicLink:()=>false,size:0,
    }));
    assert.throws(()=>validatePrivateOfflineBackupPath(good,{
      isFile:()=>true,isSymbolicLink:()=>false,size:300*1024*1024,
    }));
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

test('command denies missing flag and arbitrary extra flags before reaching Keychain',()=>{
  for(const args of [
    [],['--verify-hab1'],['--verify-hab1','relative.hab1'],
    ['--verify-hab1','not-a-real-file.hab1','--extra'],
  ]){
    const result=spawnSync(process.execPath,[tool,...args],
      {encoding:'utf8',timeout:5000});
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.match(result.stderr,/Offline encrypted backup restore FAILED/u);
  }
});

test('owner key missing blocks an offline synthetic ciphertext without leaking filename or SQL',()=>{
  const dir=mkdtempSync(join(tmpdir(),'haber-recovery-no-key-'));
  try{
    const path=join(dir,'private-synthetic.hab1');
    writeFileSync(path,Buffer.alloc(150_000,0),{mode:0o600});
    const result=spawnSync(process.execPath,[tool,'--verify-hab1',path],
      {encoding:'utf8',timeout:5000});
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.ok(!result.stderr.includes(path));
    assert.match(result.stderr,/key unavailable/u);
    assert.equal(statSync(path).size,150_000,'input backup must remain intact');
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
