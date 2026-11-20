/**
 * Guard the ACTUAL simplified production deployment contract after retirement
 * of staging and the live 580-article archive.
 * Real release gates still require identity, editorial rules, remote migration,
 * custom SSR deploy and the public/unsigned endpoint HTTP checks.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import YAML from 'yaml';

const doc=YAML.parseDocument(
  readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8'),
  {uniqueKeys:true},
);
assert.deepEqual(doc.errors,[],'Deploy workflow YAML must parse');
const workflow=doc.toJS();
const steps=workflow.jobs.deploy.steps;
const required=[
  'Verify publishing and design',
  'Build production Worker',
  'Apply D1 migrations',
  'Deploy production Worker',
  'Verify live site',
];
const ACCOUNT_VAR='$'+'{{ vars.CLOUDFLARE_ACCOUNT_ID }}';
const TOKEN_SECRET='$'+'{{ secrets.CLOUDFLARE_API_TOKEN }}';

export function verifyNewsroomDeployOrder(allSteps){
  if(!Array.isArray(allSteps))throw Error('Missing production steps');
  const names=allSteps.map(step=>step.name);
  for(const name of required){
    if(names.indexOf(name)<0||names.indexOf(name)!==names.lastIndexOf(name)){
      throw Error('Missing or duplicate production gate: '+name);
    }
  }
  const indexes=required.map(name=>names.indexOf(name));
  if(indexes.some((value,i)=>i>0&&value<=indexes[i-1])){
    throw Error('Unsafe production release ordering');
  }
  const step=name=>allSteps[names.indexOf(name)];
  const preflight=new Set(step('Verify publishing and design').run.split('\n').map(s=>s.trim()));
  for(const command of [
    'npm run test:orbit','npm run test:technology',
    'npm run test:newsroom-catalog','npm run test:editorial-design',
    'npm run test:legacy-retirement','npm run typecheck',
  ]){
    if(!preflight.has(command))throw Error('Missing preflight: '+command);
  }
  const build=step('Build production Worker');
  if(build.run.trim()!=='npm run build:ssr')throw Error('Non-SSR deployment');
  for(const key of ['PUBLIC_SITE_URL','PUBLIC_NEWS_SITE_URL']){
    if(build.env?.[key]!=='https://haber.sametbasbug.dev'){
      throw Error('Production origin mismatched');
    }
  }
  if(build.env?.PUBLIC_HABER_STAGING!=='false')throw Error('Staging noindex in production');
  for(const [name,command] of [
    ['Apply D1 migrations','npx wrangler d1 migrations apply haber --remote --config wrangler.ssr.jsonc'],
    ['Deploy production Worker','npx wrangler deploy --config wrangler.ssr.jsonc'],
  ]){
    const action=step(name);
    if(action.run.trim()!==command||
       action.env?.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT_VAR||
       action.env?.CLOUDFLARE_API_TOKEN!==TOKEN_SECRET){
      throw Error('Unsafe production deploy command or secret binding: '+name);
    }
  }
  const live=step('Verify live site').run;
  for(const requiredFragment of [
    'set -e','/orbit-actions.json','/rss.xml','--max-time 15',
    '/arsiv/','= 410',
    '/microsoft-openai-bagimliligini-azaltmak-icin-kendi-yapay-zeka-modellerini-tanitti/','= 404',
    'https://haber.sametbasbug.dev/api/orbit-eylem','= 401',
  ]){
    if(!live.includes(requiredFragment))throw Error('Missing live HTTP gate: '+requiredFragment);
  }
  if(live.includes('orbit-v6-staging')||live.includes('haber-site-staging')){
    throw Error('Retired staging cannot gate production');
  }
  return true;
}
assert.equal(workflow.jobs.deploy.environment?.name,'production');
assert.equal(workflow.concurrency?.['cancel-in-progress'],false);
assert.equal(verifyNewsroomDeployOrder(steps),true);

let cases=1;
function mutate(change){
  const copy=structuredClone(steps);
  change(copy);
  assert.throws(()=>verifyNewsroomDeployOrder(copy));
  cases++;
}
mutate(s=>s.splice(s.findIndex(x=>x.name==='Verify publishing and design'),1));
mutate(s=>s.find(x=>x.name==='Build production Worker').run='npm run build');
mutate(s=>s.find(x=>x.name==='Build production Worker').env.PUBLIC_HABER_STAGING='true');
mutate(s=>s.find(x=>x.name==='Build production Worker').env.PUBLIC_SITE_URL='https://example.invalid');
mutate(s=>s.find(x=>x.name==='Apply D1 migrations').run='npx wrangler d1 migrations apply haber --local');
mutate(s=>s.find(x=>x.name==='Deploy production Worker').run='npx wrangler deploy');
mutate(s=>s.find(x=>x.name==='Apply D1 migrations').env.CLOUDFLARE_API_TOKEN='untrusted');
mutate(s=>s.find(x=>x.name==='Deploy production Worker').env.CLOUDFLARE_ACCOUNT_ID='untrusted');
mutate(s=>s.find(x=>x.name==='Verify publishing and design').run='echo success');
mutate(s=>s.find(x=>x.name==='Verify publishing and design').run=
  s.find(x=>x.name==='Verify publishing and design').run.replace('npm run test:legacy-retirement','echo skipped'));
mutate(s=>s.find(x=>x.name==='Verify live site').run='echo success');
mutate(s=>s.find(x=>x.name==='Verify live site').run=
  s.find(x=>x.name==='Verify live site').run.replace('= 401','= 200'));
mutate(s=>{
  const index=s.findIndex(x=>x.name==='Deploy production Worker');
  const [value]=s.splice(index,1);
  s.splice(s.findIndex(x=>x.name==='Apply D1 migrations'),0,value);
});
mutate(s=>s.push(structuredClone(s.find(x=>x.name==='Verify live site'))));
console.log('Haber production deployment order: '+cases+' cases passed');
