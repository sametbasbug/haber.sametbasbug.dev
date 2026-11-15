/**
 * Read-only production pre-migration readiness validator.
 *
 * Fails before forward-only D1 migrations if the EXISTING authorized
 * publisher anchors have drifted. Caller must not dump the D1 result: it
 * includes only counts and a public migration filename, never secrets.
 */
import { pathToFileURL } from 'node:url';
import { appendFileSync, readdirSync } from 'node:fs';

export function checkTechnologyPreMigrationReadiness(value) {
  const entries=Array.isArray(value)?value:[value];
  if(entries.length!==1 || entries[0]?.success!==true
    || !Array.isArray(entries[0]?.results)
    || entries[0].results.length!==1) {
    throw new Error('D1 pre-migration aggregate query failed or returned unexpected rows');
  }
  const row=entries[0].results[0];
  if(!row || typeof row!=='object' || Array.isArray(row)) {
    throw new Error('Invalid D1 pre-migration aggregate result');
  }
  const oldEra=row.applied_migrations===11
    && row.latest_migration==='0011_article_withdrawals.sql';
  const newEra=row.applied_migrations===16
    && row.latest_migration==='0016_technology_agent_action_idempotency.sql';
  if(!oldEra&&!newEra){
    throw new Error('D1 migration state is neither pristine 0011 nor complete 0016');
  }
  for(const [field,expected] of [
    ['valid_publisher_anchors',2],
    ['authorized_publishers',oldEra?2:4],
    // On the first cutover 0013 must be able to seed both new publishers.
    // A stale, disabled preexisting Nyx/Asteria row would make INSERT ...
    // NOT EXISTS silently skip the correct publisher registration.
    ['seeded_new_agent_rows',oldEra?0:2],
    ['technology_schema_tables',oldEra?0:4],
    ['active_legacy_keys',0],
    ['orphan_sources',0],
  ]) {
    if(row[field]!==expected){
      throw new Error('D1 pre-migration safety gate failed: '+field+' is not ready');
    }
  }
  if(!Number.isSafeInteger(row.historical_published)||row.historical_published<580){
    throw new Error('D1 historical published count below the known 580-article baseline');
  }
  return {
    publisherAnchors:2,historicalArticles:row.historical_published,legacyKeys:0,
    era:oldEra?'historical-0011':'technology-0016',
  };
}

/** Future migrations must ALSO require a new independent backup sign-off.
 * A false "no migration pending" decision must never be inferred solely
 * from reaching schema 0016 when a new 0017 file is added later.
 */
export function requiresBackupForMigrations(era,migrationFiles) {
  const applied=era==='historical-0011'?11:era==='technology-0016'?16:null;
  if(applied===null || !Array.isArray(migrationFiles)) {
    throw new Error('Unknown D1 migration era or migration manifest');
  }
  const versions=migrationFiles.map(name=>{
    if(typeof name!=='string' || !/^\d{4}_.+\.sql$/u.test(name)) {
      throw new Error('Unexpected D1 migration file in manifest');
    }
    return Number(name.slice(0,4));
  }).sort((a,b)=>a-b);
  if(versions.length<16)throw new Error('D1 migration manifest is incomplete');
  for(let i=0;i<versions.length;i++){
    if(versions[i]!==i+1) {
      throw new Error('D1 migration numbers are missing or duplicated');
    }
  }
  if(versions.at(-1)<applied) {
    throw new Error('D1 migration files do not cover production schema');
  }
  return versions.at(-1)>applied;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    let body='';
    for await(const chunk of process.stdin){
      body+=chunk;
      if(body.length>128_000)throw new Error('D1 preflight JSON exceeded expected size');
    }
    const outcome=checkTechnologyPreMigrationReadiness(JSON.parse(body));
    // The same read-only D1 preflight decides whether migration is pending.
    // Any pending numbered migration requires a new backup attestation;
    // completed 0016 with no new files does not require a new export.
    // Write a fixed boolean, never private query fields, to GitHub Outputs.
    const migrations=readdirSync(new URL('../worker/migrations/',import.meta.url))
      .filter(name=>/^\d{4}_.+\.sql$/u.test(name));
    const backupRequired=requiresBackupForMigrations(outcome.era,migrations);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT,
        'backup_required='+(backupRequired?'true':'false')+'\n');
    }
    console.log('Haber pre-migration READY: '+outcome.publisherAnchors+
      ' authorized publisher anchors, '+outcome.historicalArticles+
      ' historical articles, no active legacy publisher keys; '+outcome.era);
  }catch(error){
    // Do not echo any SQL data, pairwise subject, export SQL or private rows.
    console.error('Haber pre-migration BLOCKED:',error.message);
    process.exitCode=1;
  }
}
