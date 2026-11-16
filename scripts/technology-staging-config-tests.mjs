import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseWranglerJsonc, validateHaberStagingConfig, readHaberProductionConfig,
} from './technology-staging-config-check.mjs';

const production = readHaberProductionConfig();
const STAGE = {
  name: 'haber-site-staging',
  main: 'dist-ssr-staging/server/entry.mjs',
  compatibility_date: production.compatibility_date,
  compatibility_flags: ['nodejs_compat'],
  workers_dev: true,
  preview_urls: false,
  assets: { binding: 'ASSETS', directory: 'dist-ssr-staging/client' },
  d1_databases: [{
    binding: 'DB',
    database_name: 'haber-site-staging',
    database_id: 'a03b97fa-b08a-483e-bebf-aa10a0568fcf',
    migrations_dir: 'worker/migrations',
  }],
  services: [{ binding: 'ORBIT_STAGING', service: 'orbit-v6-staging' }],
  r2_buckets: [{
    binding: 'HERO', bucket_name: 'haber-gorseller-staging',
  }],
  vars: {
    ORBIT_ISSUER: 'https://orbit-v6-staging.samett33710.workers.dev',
    ORBIT_AUDIENCE: 'orbit-haber-staging',
    ORBIT_CLIENT_ID: 'orbit-haber-staging',
  },
};
let cases=0;
function accept(stage=STAGE) {
  assert.equal(validateHaberStagingConfig(stage, production).clientId, 'orbit-haber-staging');
  cases++;
}
function block(mutation, label) {
  const stage = structuredClone(STAGE);
  mutation(stage);
  assert.throws(() => validateHaberStagingConfig(stage, production), /unsafe_haber_staging_config/u, label);
  cases++;
}
accept();
const provisioned = parseWranglerJsonc(readFileSync('wrangler.staging.jsonc', 'utf8'));
assert.equal(provisioned.d1_databases[0].database_id, STAGE.d1_databases[0].database_id);
accept(provisioned);
assert.equal(parseWranglerJsonc(readFileSync('wrangler.ssr.jsonc', 'utf8')).name, production.name);cases++;
assert.throws(() => validateHaberStagingConfig(production, production));cases++;
block(s=>{s.name=production.name},'never staging-deploy production Worker');
block(s=>{s.name='haber-api-staging'},'no mismatched staging hostname');
block(s=>{s.main='src/worker/index.ts'},'must use SSR entry');
block(s=>{s.main=production.main},'staging Worker must not read the production bundle');
block(s=>{s.compatibility_date='2000-01-01'},'runtime compatibility date');
block(s=>{s.workers_dev=false},'workers.dev disabled');
block(s=>{s.preview_urls=true},'preview URLs disabled');
block(s=>{s.routes=[{pattern:'haber.sametbasbug.dev',custom_domain:true}]},'never claim production hostname');
block(s=>{s.route='haber.sametbasbug.dev/*'},'no wildcard production route');
block(s=>{s.triggers={crons:['* * * * *']}},'no scheduled stage publishing');
block(s=>{s.assets.directory='dist/client'},'SSR asset parity');
block(s=>{s.assets.directory=production.assets.directory},'stage assets must never share the production output');
block(s=>{s.d1_databases[0].database_id=production.d1_databases[0].database_id},'never reuse production D1 UUID');
block(s=>{s.d1_databases[0].database_name='haber'},'never reuse production D1 name');
block(s=>{s.d1_databases[0].database_id='378e09e4-23e9-4112-abb8-90152a302502'},
  'never bind Orbit staging D1 instead of Haber staging D1');
block(s=>{s.d1_databases[0].database_id='12345678-1234-4234-8234-123456789abc'},
  'require independently provisioned Haber staging D1 identity');
block(s=>{s.d1_databases.push({...s.d1_databases[0],binding:'EXTRA'})},'only one D1');
block(s=>{s.d1_databases[0].database_id='00000000-0000-0000-0000-000000000000'},'reject placeholder');
block(s=>{s.d1_databases[0].database_id='not-a-uuid'},'reject malformed UUID');
block(s=>{s.d1_databases[0].migrations_dir='migrations'},'must share real migration schema');
block(s=>{s.r2_buckets[0].bucket_name=production.r2_buckets[0].bucket_name},'never reuse production image bucket');
block(s=>{s.r2_buckets=[]},'missing R2 must not crash legacy image route');
block(s=>{s.vars.ORBIT_ISSUER='https://orbit.sametbasbug.dev'},'never trust production Orbit issuer');
block(s=>{s.vars.ORBIT_AUDIENCE='orbit-haber'},'never accept production audience');
block(s=>{s.vars.ORBIT_CLIENT_ID='orbit-haber'},'never use production auth client');
block(s=>{s.vars.ORBIT_CLIENT_SECRET='example-secret'},'never inline browser client secret');
block(s=>{s.vars.ENABLE_LEGACY_NEWS_ACTIONS='1'},'never enable legacy publisher');
block(s=>{s.vars.ORBIT_SITE_TOKEN_PEPPER_V1='placeholder'},'no inline token key');
block(s=>{s.env={production:{name:'haber-site'}}},'no hidden production environment');
block(s=>{s.custom_domains=true},'no custom domain');
block(s=>{s.zone_id='fake'},'no DNS zone');
block(s=>{s.r2_buckets[0].binding='IMAGE'},'HERO route requires its own R2 binding');
// These were all ACCEPTED by the earlier validator despite creating
// additional Worker access to live data, or changing static asset routing.
block(s=>{s.d1_databases[0].preview_database_id=production.d1_databases[0].database_id},
  'a second D1 preview ID must not silently target live data');
block(s=>{s.r2_buckets[0].preview_bucket_name=production.r2_buckets[0].bucket_name},
  'R2 preview must not reuse live historical media');
block(s=>{s.services=[{binding:'PRODUCTION',service:production.name}]},
  'no production Worker service binding');
block(s=>{s.kv_namespaces=[{binding:'LEAK',id:'fake-kv-namespace'}]},
  'no extra KV namespace');
block(s=>{s.account_id='different-cloudflare-account'},
  'no staging account scope override');
block(s=>{s.assets.run_worker_first=false},
  'no unreviewed static asset routing option');
block(s=>{s.services=[]},'staging OIDC requires one specific service');
block(s=>{s.services[0].service=production.name},
  'staging may never call production Haber as a service');
block(s=>{s.services[0].service='orbit-v6-production'},
  'staging may never call production Orbit as a service');
block(s=>{s.services[0].binding='ORBIT'},'stage service binding identity fixed');
block(s=>{s.services.push({binding:'EXTRA',service:'orbit-v6-production'})},
  'multiple services must not bypass allowlist');
block(s=>{s.assets.not_found_handling='single-page-application'},
  'no static asset SPA fallback masking');
block(s=>{s.d1_databases[0].jurisdiction='eu'},
  'no unexpected D1 binding fields');
block(s=>{s.r2_buckets[0].jurisdiction='eu'},
  'no unexpected R2 binding fields');
block(s=>{s.unsafe={bindings:[{name:'PROD',type:'service'}]}},
  'no raw unsafe bindings');
block(s=>{s.compatibility_flags.push('unsafe_eval')},
  'no additional compatibility flags');
block(s=>{s.compatibility_flags.push('nodejs_compat')},
  'no duplicate compatibility flags');
block(s=>{s.observability={enabled:true}},
  'no unreviewed top-level resource flags');


const dir=mkdtempSync(join(tmpdir(),'haber-staging-config-'));
try {
  const safe=join(dir,'staging.jsonc');
  writeFileSync(safe,JSON.stringify(STAGE));
  let result=spawnSync(process.execPath,['scripts/technology-staging-config-check.mjs',
    '--config='+safe],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/passes isolation checks/u);cases++;
  result=spawnSync(process.execPath,['scripts/technology-staging-config-check.mjs',
    '--config='+resolve('wrangler.ssr.jsonc')],{encoding:'utf8'});
  assert.notEqual(result.status,0);cases++;
  assert.doesNotMatch(result.stderr,new RegExp(production.d1_databases[0].database_id,'u'),
    'Do not echo live D1 identifiers');
  writeFileSync(safe,JSON.stringify({...STAGE,
    d1_databases:[{...STAGE.d1_databases[0],
      database_id:production.d1_databases[0].database_id}]}));
  result=spawnSync(process.execPath,['scripts/technology-staging-config-check.mjs',
    '--config='+safe],{encoding:'utf8'});
  assert.notEqual(result.status,0);cases++;

  // Exercise the actual CLI against an extra production Worker binding.
  // Validation cannot be restricted to the exported helper function only.
  writeFileSync(safe,JSON.stringify({...STAGE,
    services:[{binding:'PRODUCTION',service:production.name}]}));
  result=spawnSync(process.execPath,['scripts/technology-staging-config-check.mjs',
    '--config='+safe],{encoding:'utf8'});
  assert.notEqual(result.status,0,'CLI must reject a production Worker service binding');cases++;
  assert.doesNotMatch(result.stderr,new RegExp(production.d1_databases[0].database_id,'u'),
    'Do not reveal production D1 identities in failure logs');cases++;
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('Haber staging Worker isolation:',cases,'positive/negative cases passed');
