import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  assertArchiveHttp,readBoundedHtml,shouldContinueProbe,PRODUCTION,STAGING,EXPECTED,
} from './technology-live-permalink-probe.mjs';

const slug='orijinal-haber-baglantisi';
const baseValues={
  slug,base:STAGING,status:200,
  contentType:'text/html; charset=utf-8',bytes:12_000,
  canonical:STAGING+'/'+slug+'/',
  xRobots:'noindex, nofollow',metaRobots:'noindex, nofollow',
};
test('staging requires exact slug, 200, HTML, correct canonical and noindex',()=>{
  assertArchiveHttp(baseValues);
  for(const value of [
    {status:301},{status:404},{canonical:PRODUCTION+'/'+slug+'/'},
    {canonical:STAGING+'/wrong/'},{xRobots:null},{metaRobots:null},
    {bytes:300_000},{contentType:'application/json'},
    {base:'https://other.example'},{slug:'evil?q=x'},
  ]){
    assert.throws(()=>assertArchiveHttp({...baseValues,...value}));
  }
});
test('production must remain indexable and use original production canonical',()=>{
  const prod={...baseValues,base:PRODUCTION,
    canonical:PRODUCTION+'/'+slug+'/',xRobots:null,metaRobots:null};
  assertArchiveHttp(prod);
  assert.throws(()=>assertArchiveHttp({...prod,xRobots:'noindex'}));
  assert.throws(()=>assertArchiveHttp({...prod,metaRobots:'noindex'}));
  assert.throws(()=>assertArchiveHttp({...prod,canonical:STAGING+'/'+slug+'/'}));
  assert.equal(EXPECTED,580);
});
test('CLI must reject caller-supplied alternate origins without reaching the network',()=>{
  const result=spawnSync(process.execPath,['scripts/technology-live-permalink-probe.mjs',
    '--origin=https://other.example'],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.match(result.stderr,/no overrides permitted/u);
});


test('streaming body gate rejects oversized and absent bodies without allocation spikes',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({
    pull(controller){
      controller.enqueue(new Uint8Array(210_000));
    },
    cancel(){
      cancelled=true;
    },
  });
  const response=new Response(stream,{
    headers:{'content-type':'text/html'},
  });
  await assert.rejects(readBoundedHtml(response),/html_over_limit/u);
  assert.equal(cancelled,true,'oversized response stream cancelled promptly');
  await assert.rejects(readBoundedHtml(new Response(null)),/html_body_missing/u);
});


test('live HTTP probe respects global deadline and fails fast on repeated errors',()=>{
  assert.equal(shouldContinueProbe(0,1160,false,0),true);
  assert.equal(shouldContinueProbe(1159,1160,false,7),true);
  assert.equal(shouldContinueProbe(1160,1160,false,0),false);
  assert.equal(shouldContinueProbe(500,1160,true,0),false);
  assert.equal(shouldContinueProbe(500,1160,false,8),false);
});
