/**
 * Prevent changes to GitHub Actions from silently bypassing Haber 2.0's
 * coordinated Orbit-first release and recovery gates.
 *
 * The YAML itself is the tested source of truth. Mutation cases below prove
 * the test fails when someone reorders/removes a critical gate.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import YAML from 'yaml';

const workflow=YAML.parseDocument(readFileSync(
  new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8'),
  {uniqueKeys:true},
);
assert.deepEqual(workflow.errors,[],'GitHub deploy workflow YAML must parse');
const steps=workflow.toJS().jobs.deploy.steps;
const required=[
  'Verify Orbit identity and Haber 2.0 contracts before migration',
  'Verify the editorial pipeline before migration',
  'Build the Worker',
  'Require the new Orbit agent news API before D1 migration',
  'Confirm a D1 Time Travel recovery point before migrations',
  'Apply D1 migrations',
  'Verify production D1 publisher readiness after migrations',
  'Deploy the Worker',
  'Verify the live site',
];
export function verifyNewsroomDeployOrder(allSteps) {
  const names=allSteps.map(step=>step.name);
  for(const name of required){
    if(names.indexOf(name)<0 || names.indexOf(name)!==names.lastIndexOf(name)){
      throw new Error('Missing or duplicated deployment gate: '+name);
    }
  }
  const positions=required.map(name=>names.indexOf(name));
  if(positions.some((position,index)=>index>0 && position<=positions[index-1])) {
    throw new Error('Unsafe order of production deployment safety gates');
  }
  const byName=name=>allSteps[names.indexOf(name)];
  if(!byName('Require the new Orbit agent news API before D1 migration')
    .run.includes('smoke:orbit-release-check')) {
    throw new Error('Pre-migration Orbit readiness probe is missing');
  }
  const recovery=byName('Confirm a D1 Time Travel recovery point before migrations').run;
  if(!recovery.includes('time-travel info DB --json')
    || !recovery.includes('d1-time-travel-check.mjs')
    || /time-travel restore/u.test(recovery)) {
    throw new Error('Pre-migration D1 recovery point must be read-only');
  }
  const migration=byName('Apply D1 migrations').run;
  if(!migration.includes('d1 migrations apply DB --remote')
    || !migration.includes('wrangler.ssr.jsonc')) {
    throw new Error('Production D1 migrations must use the known remote binding');
  }
  const publisher=byName('Verify production D1 publisher readiness after migrations').run;
  if(!publisher.includes('technology-release-readiness.sql')
    || !publisher.includes('technology-release-d1-check.mjs')){
    throw new Error('D1 publisher authority gate is missing');
  }
  const live=byName('Verify the live site').run;
  if(!live.includes('orbit-technology-release-check.mjs')
    || !live.includes('newsroom-action-catalog.mjs')) {
    throw new Error('Post-deployment dual-service acceptance is missing');
  }
  return true;
}

assert.equal(verifyNewsroomDeployOrder(steps),true);
function mutate(fn){
  const clone=structuredClone(steps);
  fn(clone);
  assert.throws(()=>verifyNewsroomDeployOrder(clone));
}
mutate(rows=>rows.splice(rows.findIndex(s=>s.name===required[3]),1));
mutate(rows=>rows.find(s=>s.name===required[3]).run='echo no-op');
mutate(rows=>rows.find(s=>s.name===required[4]).run='echo skipped');
mutate(rows=>rows.find(s=>s.name===required[6]).run='echo skipped');
mutate(rows=>rows.find(s=>s.name===required[8]).run='echo healthy');
mutate(rows=>{
  const from=rows.findIndex(s=>s.name===required[5]);
  const [migration]=rows.splice(from,1);
  rows.splice(rows.findIndex(s=>s.name===required[3]),0,migration);
});
mutate(rows=>{
  const from=rows.findIndex(s=>s.name===required[6]);
  const [publisher]=rows.splice(from,1);
  rows.splice(rows.findIndex(s=>s.name===required[7])+1,0,publisher);
});
console.log('Haber release workflow: 8 positive/negative ordering and gate assertions passed');
