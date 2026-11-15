import assert from 'node:assert/strict';
import {
  validateOrbitTechnologyContract,
  verifyOrbitNewsRelease,
} from './orbit-technology-release-check.mjs';

const categories=[
  'yapay-zeka','yazilim','donanim','siber-guvenlik','dijital-dunya','teknoloji-sektoru',
];
const makeContract=()=>({
  openapi:'3.2.0',paths:{
    '/me/technology-news':{get:{
      operationId:'listTechnologyNews',security:[{agentCredential:[]}],
      parameters:[{name:'kategori',schema:{enum:categories}}],
    }},
    '/me/technology-news/{slug}':{get:{
      operationId:'getTechnologyNewsArticle',security:[{agentCredential:[]}],
    }},
  },
});
const good=makeContract();
assert.deepEqual(validateOrbitTechnologyContract(good),{
  operations:2,credentialRequired:true,categories:6,
});
for(const mutate of [
  (d)=>{d.paths['/me/technology-news'].get.security=[]},
  (d)=>{d.paths['/me/technology-news/{slug}'].get.security=[]},
  (d)=>{d.paths['/me/technology-news'].get.operationId='unrelated'},
  (d)=>{d.paths['/me/technology-news'].get.parameters[0].schema.enum=['Siyaset']},
  (d)=>{delete d.paths['/me/technology-news/{slug}']},
]) {
  const bad=makeContract();
  mutate(bad);
  assert.throws(()=>validateOrbitTechnologyContract(bad),/Orbit/);
}
let calls=0;
const fakeFetch=async (resource,options)=>{
  calls++;
  const url=String(resource);
  assert.ok(url.startsWith('https://orbit.sametbasbug.dev/v1/'));
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  assert.ok(options.signal instanceof AbortSignal);
  assert.ok(!('authorization' in options.headers));
  return url.includes('openapi.json')
    ? Response.json(makeContract())
    : new Response(JSON.stringify({error:{code:'agent_authentication_required'}}),
      {status:401,headers:{'content-type':'application/json'}});
};
assert.equal((await verifyOrbitNewsRelease(fakeFetch)).operations,2);
assert.equal(calls,2);
await assert.rejects(verifyOrbitNewsRelease(async (resource,options)=>{
  const result=await fakeFetch(resource,options);
  return String(resource).includes('technology-news')
    ? Response.json({haberler:[]}) : result;
}),/anonymous access with 401/);
await assert.rejects(verifyOrbitNewsRelease(async (resource,options)=>{
  if(String(resource).includes('openapi.json')){
    return new Response(new Uint8Array(1024*1024+1),
      {headers:{'content-type':'application/json'}});
  }
  return fakeFetch(resource,options);
}),/allowed size/u);
await assert.rejects(verifyOrbitNewsRelease(async (resource,options)=>{
  if(String(resource).includes('openapi.json')){
    return new Response('SECRET-DO-NOT-ECHO',
      {headers:{'content-type':'application/json'}});
  }
  return fakeFetch(resource,options);
}),/invalid UTF-8 or JSON/u);
console.log('Coordinated Orbit release contract: 10 positive/negative checks including bounds passed');
