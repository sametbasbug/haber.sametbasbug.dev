/**
 * Read-only safety gate for a future, explicitly approved Haber staging Worker.
 *
 * This script NEVER provisions, deploys or migrates D1. It merely blocks a
 * staging config that could alias the live Worker, domain, D1, R2 or Orbit
 * issuer. The production config is loaded from the actual repository file,
 * not from a duplicated environment-specific UUID constant.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsoncParser from 'jsonc-parser';

const { parse } = jsoncParser;
const PROD_CONFIG = new URL('../wrangler.ssr.jsonc', import.meta.url);
const STAGING_NAME = 'haber-site-staging';
const STAGING_ORBIT_ISSUER = 'https://orbit-v6-staging.samett33710.workers.dev';
const STAGING_CLIENT_ID = 'orbit-haber-staging';
const STAGING_R2_BUCKET = 'haber-gorseller-staging';

function reject(reason) {
  throw new Error('unsafe_haber_staging_config: ' + reason);
}

export function parseWranglerJsonc(contents) {
  if (typeof contents !== 'string') reject('non_string_config');
  const errors = [];
  const value = parse(contents, errors, { allowTrailingComma: true });
  if (errors.length || !value || typeof value !== 'object'
    || Array.isArray(value)) reject('invalid_jsonc');
  return value;
}

export function validateHaberStagingConfig(staging, production) {
  if (!staging || typeof staging !== 'object' || Array.isArray(staging)
    || !production || typeof production !== 'object' || Array.isArray(production)) {
    reject('invalid_config_shape');
  }
  if (staging.name !== STAGING_NAME || staging.name === production.name) {
    reject('wrong_staging_worker_name');
  }
  if (staging.main !== 'dist-ssr/server/entry.mjs'
    || staging.main !== production.main
    || staging.compatibility_date !== production.compatibility_date
    || !Array.isArray(staging.compatibility_flags)
    || !staging.compatibility_flags.includes('nodejs_compat')) {
    reject('worker_runtime_mismatch');
  }
  if (staging.workers_dev !== true || staging.preview_urls !== false
    || Object.hasOwn(staging, 'routes') || Object.hasOwn(staging, 'route')
    || Object.hasOwn(staging, 'custom_domains') || Object.hasOwn(staging, 'zone_id')
    || Object.hasOwn(staging, 'zone_name') || Object.hasOwn(staging, 'triggers')
    || Object.hasOwn(staging, 'env')) {
    reject('stage_must_not_claim_custom_domains_or_triggers');
  }
  if (staging.assets?.binding !== 'ASSETS'
    || staging.assets?.directory !== 'dist-ssr/client') {
    reject('wrong_ssr_assets');
  }
  const databases = staging.d1_databases;
  const liveIds = new Set((production.d1_databases ?? []).map(row => row.database_id));
  const liveNames = new Set((production.d1_databases ?? []).map(row => row.database_name));
  if (!Array.isArray(databases) || databases.length !== 1) reject('one_isolated_d1_required');
  const [db] = databases;
  if (!db || db.binding !== 'DB' || db.database_name !== STAGING_NAME
    || liveNames.has(db.database_name)
    || typeof db.database_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(db.database_id)
    || /^0{8}-0{4}-0{4}-0{4}-0{12}$/u.test(db.database_id)
    || liveIds.has(db.database_id)
    || db.migrations_dir !== 'worker/migrations') {
    reject('unverified_or_live_d1_binding');
  }
  // Historical article images still have a legacy read route. Stage with a
  // *separate* bucket; never use the production HERO bucket as a shortcut.
  const buckets = staging.r2_buckets;
  const liveBuckets = new Set((production.r2_buckets ?? []).map(row => row.bucket_name));
  if (!Array.isArray(buckets) || buckets.length !== 1
    || buckets[0]?.binding !== 'HERO'
    || buckets[0]?.bucket_name !== STAGING_R2_BUCKET
    || liveBuckets.has(buckets[0].bucket_name)) {
    reject('isolated_legacy_hero_bucket_required');
  }
  const vars = staging.vars;
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)
    || vars.ORBIT_ISSUER !== STAGING_ORBIT_ISSUER
    || vars.ORBIT_AUDIENCE !== STAGING_CLIENT_ID
    || vars.ORBIT_CLIENT_ID !== STAGING_CLIENT_ID
    || Object.keys(vars).some(name => ![
      'ORBIT_ISSUER', 'ORBIT_AUDIENCE', 'ORBIT_CLIENT_ID',
    ].includes(name))) {
    reject('staging_orbit_identity_mismatch_or_inline_secret');
  }
  if (Object.hasOwn(staging, 'unsafe')
    || Object.hasOwn(staging, 'varsOverride')) {
    reject('unexpected_risky_top_level_config');
  }
  return {
    worker: STAGING_NAME,
    siteOrigin: 'https://' + STAGING_NAME + '.samett33710.workers.dev',
    clientId: STAGING_CLIENT_ID,
  };
}

export function readHaberProductionConfig() {
  return parseWranglerJsonc(readFileSync(PROD_CONFIG, 'utf8'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !process.argv[2].startsWith('--config=')) {
      reject('explicit_staging_config_path_required');
    }
    const path = resolve(process.argv[2].slice('--config='.length));
    if (path === fileURLToPath(PROD_CONFIG)) reject('production_config_file_prohibited');
    const candidate = parseWranglerJsonc(readFileSync(path, 'utf8'));
    validateHaberStagingConfig(candidate, readHaberProductionConfig());
    console.log('Haber staging config passes isolation checks (read-only; no resources changed).');
  } catch {
    console.error('Haber staging config BLOCKED: invalid, incomplete or live-resource binding.');
    process.exitCode = 1;
  }
}
