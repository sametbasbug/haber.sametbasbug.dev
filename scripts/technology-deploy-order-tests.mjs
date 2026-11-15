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
  'Verify legacy publisher anchors before D1 migration',
  'Verify exact 580 legacy permalinks before D1 migrations',
  'Require operator attestation of an independent D1 backup',
  'Confirm a D1 Time Travel recovery point before migrations',
  'Apply D1 migrations',
  'Verify production D1 publisher readiness after migrations',
  'Verify exact 580 legacy permalinks after D1 migrations',
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
  const legacy=byName('Verify legacy publisher anchors before D1 migration').run;
  if(!legacy.includes('technology-pre-migration-readiness.sql')
    || !legacy.includes('technology-pre-migration-check.mjs')
    || !legacy.includes('d1 execute DB --remote --json')){
    throw new Error('Read-only existing publisher preflight must precede migrations');
  }
  for(const [name,mode] of [
    ['Verify exact 580 legacy permalinks before D1 migrations','historical'],
    ['Verify exact 580 legacy permalinks after D1 migrations','technology'],
  ]){
    const run=byName(name).run;
    if(!run.includes('technology-legacy-permalinks.mjs --sql='+mode)
      || !run.includes('technology-legacy-permalinks.mjs --check')
      || !run.includes('d1 execute DB --remote --json')
      || !run.includes('trap') || !run.includes('rm -f')){
      throw new Error('Exact 580-URL release safety gate is missing or unsafe: '+name);
    }
  }
  const preflightStep=byName('Verify legacy publisher anchors before D1 migration');
  if(preflightStep.id!=='publisher_preflight'
    || !preflightStep.run.includes('technology-pre-migration-check.mjs')) {
    throw new Error('Read-only D1 preflight must publish migration-pending state');
  }
  const backup=byName('Require operator attestation of an independent D1 backup');
  if(backup.if!=="steps.publisher_preflight.outputs.backup_required != 'false'") {
    throw new Error('Missing preflight output must require backup, not skip the gate');
  }
  if(!backup.run.includes('node scripts/technology-backup-attestation.mjs')) {
    throw new Error('Independent D1 backup attestation must be mandatory before migration');
  }
  for(const name of [
    'HABER_D1_BACKUP_VERIFIED_RELEASE_SHA',
    'HABER_D1_BACKUP_VERIFIED_AT_UTC',
    'HABER_D1_BACKUP_SQL_SHA256',
  ]){
    if(backup.env?.[name]!==('$'+'{{ vars.'+name+' }}')){
      throw new Error('Independent D1 backup release proof must come from GitHub environment variable '+name);
    }
  }
  const preflight=byName('Verify Orbit identity and Haber 2.0 contracts before migration').run;
  if(!preflight.includes('npm run test:backup-attestation')) {
    throw new Error('Backup attestation tests must run before production migration');
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
  const deploy=byName('Deploy the Worker').run;
  if(!deploy.includes('wrangler deploy')
    || !deploy.includes('--config wrangler.ssr.jsonc')
    || !deploy.includes('--message')) {
    throw new Error('The production SSR Worker deploy step is missing or incorrect');
  }
  const live=byName('Verify the live site').run;
  if(!live.includes('orbit-technology-release-check.mjs')
    || !live.includes('newsroom-action-catalog.mjs')) {
    throw new Error('Post-deployment dual-service acceptance is missing');
  }
  if(!live.includes('for legacy_path in /api/brief /api/publish')
    || !live.includes(`"$legacy_code" == '410'`)
    || !live.includes('unknown-article-')
    || !live.includes(`"$unknown_code" == '404'`)
    || !live.includes('--max-time 15')
    || !live.includes('--connect-timeout 5')) {
    throw new Error('Post-deployment legacy writer and 404 checks are incomplete');
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
mutate(rows=>rows.find(s=>s.name==='Verify exact 580 legacy permalinks before D1 migrations').run='echo skipped');
mutate(rows=>rows.find(s=>s.name==='Verify exact 580 legacy permalinks after D1 migrations').run='echo skipped');
mutate(rows=>{
  const pos=rows.findIndex(s=>s.name==='Verify exact 580 legacy permalinks after D1 migrations');
  const [gate]=rows.splice(pos,1);
  rows.splice(rows.findIndex(s=>s.name==='Apply D1 migrations'),0,gate);
});
mutate(rows=>rows.find(s=>s.name==='Confirm a D1 Time Travel recovery point before migrations').run='echo skipped');
mutate(rows=>rows.find(s=>s.name==='Verify production D1 publisher readiness after migrations').run='echo healthy');
mutate(rows=>rows.splice(rows.findIndex(s=>s.name==='Require operator attestation of an independent D1 backup'),1));
mutate(rows=>rows.find(s=>s.name==='Require operator attestation of an independent D1 backup').run='echo approved');
mutate(rows=>rows.find(s=>s.name==='Require operator attestation of an independent D1 backup').if="steps.publisher_preflight.outputs.backup_required == 'true'");
mutate(rows=>rows.find(s=>s.name==='Verify legacy publisher anchors before D1 migration').id='wrong-id');
mutate(rows=>rows.find(s=>s.name==='Require operator attestation of an independent D1 backup').env.HABER_D1_BACKUP_SQL_SHA256='not-a-github-var');
mutate(rows=>rows.find(s=>s.name==='Require operator attestation of an independent D1 backup').env.HABER_D1_BACKUP_VERIFIED_AT_UTC='not-a-github-var');
mutate(rows=>rows.find(s=>s.name==='Require operator attestation of an independent D1 backup').env.HABER_D1_BACKUP_VERIFIED_RELEASE_SHA='not-a-github-var');
mutate(rows=>{
  const from=rows.findIndex(s=>s.name==='Require operator attestation of an independent D1 backup');
  const [backup]=rows.splice(from,1);
  rows.splice(rows.findIndex(s=>s.name==='Apply D1 migrations')+1,0,backup);
});
mutate(rows=>rows.find(s=>s.name==='Verify Orbit identity and Haber 2.0 contracts before migration').run=
  rows.find(s=>s.name==='Verify Orbit identity and Haber 2.0 contracts before migration').run.replace('npm run test:backup-attestation','echo skipped'));

mutate(rows=>rows.find(s=>s.name==='Verify the live site').run=
  rows.find(s=>s.name==='Verify the live site').run.replace(' /api/brief /api/publish',' /api/publish'));
mutate(rows=>rows.find(s=>s.name==='Verify the live site').run=
  rows.find(s=>s.name==='Verify the live site').run.replace('unknown-article-','known-article-'));
mutate(rows=>rows.find(s=>s.name==='Verify the live site').run=
  rows.find(s=>s.name==='Verify the live site').run.replaceAll('--max-time 15',''));
mutate(rows=>{
  const from=rows.findIndex(s=>s.name==='Apply D1 migrations');
  const [migration]=rows.splice(from,1);
  rows.splice(rows.findIndex(s=>s.name==='Require the new Orbit agent news API before D1 migration'),0,migration);
});
mutate(rows=>{
  const from=rows.findIndex(s=>s.name==='Verify production D1 publisher readiness after migrations');
  const [publisher]=rows.splice(from,1);
  rows.splice(rows.findIndex(s=>s.name==='Deploy the Worker')+1,0,publisher);
});
console.log('Haber release workflow: 23 positive/negative ordering and gate assertions passed');
