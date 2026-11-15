import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateNewsroomCatalog, checkNewsroomCatalog } from './newsroom-action-catalog.mjs';
import { readReleaseJson } from './release-bounded-json.mjs';
const correct = JSON.parse(readFileSync(new URL('../public/orbit-actions.json',import.meta.url),'utf8'));
assert.deepEqual(validateNewsroomCatalog(correct),{ operations:6, publisherFields:3 });
const copy = () => structuredClone(correct);
let bad=copy();bad.operations[0].operationId='haber.panoYaz';
assert.throws(()=>validateNewsroomCatalog(bad),/altı kanonik/u);
bad=copy();bad.operations[0].input.required=['briefId','selections'];
assert.throws(()=>validateNewsroomCatalog(bad),/yalnız metin/u);
bad=copy();bad.version=2;
assert.throws(()=>validateNewsroomCatalog(bad),/sürüm 1/u);
bad=copy();bad.operations[2].input.additionalProperties=true;
assert.throws(()=>validateNewsroomCatalog(bad),/kapalı/u);
bad=copy();bad.operations[0].input.properties.kategori.enum[0]='Siyaset';
assert.throws(()=>validateNewsroomCatalog(bad),/altı teknoloji kategorisi/u);
bad=copy();bad.operations.push(bad.operations[0]);
assert.throws(()=>validateNewsroomCatalog(bad),/altı kanonik/u);
const fakeFetch=async ()=>{
  return new Response(JSON.stringify(correct), { status:200,headers:{'content-type':'application/json'} });
};
assert.deepEqual(await checkNewsroomCatalog('http://127.0.0.1:8791', fakeFetch),
  {operations:6,publisherFields:3});
await assert.rejects(checkNewsroomCatalog('https://haber.sametbasbug.dev',async ()=>new Response('redirect',{status:302})),/HTTPS 200/u);
await assert.rejects(checkNewsroomCatalog('https://example.com',async ()=>new Response('no',{status:200})),/application\/json/u);
await assert.rejects(checkNewsroomCatalog('http://evil.example',fakeFetch),/HTTPS site/u);
assert.deepEqual(await readReleaseJson(Response.json({ok:true}),128),{ok:true});
await assert.rejects(readReleaseJson(Response.json({ok:true}),0),/budget/u);
await assert.rejects(readReleaseJson(new Response('{}',{
  headers:{'content-length':'999999'},
}),128),/allowed size/u);
// A declared small response length does not override actual streaming bytes.
const overflow=()=>new Response(new ReadableStream({
  start(controller){
    controller.enqueue(new Uint8Array(128));
    controller.enqueue(new Uint8Array([123]));
    controller.close();
  },
}));
await assert.rejects(readReleaseJson(overflow(),128),/allowed size/u);
await assert.rejects(readReleaseJson(new Response(new Uint8Array([0xff,0xfe])),128),
  /invalid UTF-8 or JSON/u);
await assert.rejects(readReleaseJson(new Response('malformed SECRET-SHOULD-NOT-LOG'),128),
  /invalid UTF-8 or JSON/u);
await assert.rejects(checkNewsroomCatalog('https://haber.sametbasbug.dev',async ()=>
  new Response('x'.repeat(129*1024),{headers:{'content-type':'application/json'}})),
  /allowed size/u);
console.log('Haber 2.0 catalog acceptance: 18 checks including streaming bounds passed');
