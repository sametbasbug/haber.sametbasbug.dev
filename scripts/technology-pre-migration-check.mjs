/**
 * Read-only production pre-migration readiness validator.
 *
 * Fails before forward-only D1 migrations if the EXISTING authorized
 * publisher anchors have drifted. Caller must not dump the D1 result: it
 * includes only counts and a public migration filename, never secrets.
 */
import { pathToFileURL } from 'node:url';

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

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    let body='';
    for await(const chunk of process.stdin){
      body+=chunk;
      if(body.length>128_000)throw new Error('D1 preflight JSON exceeded expected size');
    }
    const outcome=checkTechnologyPreMigrationReadiness(JSON.parse(body));
    console.log('Haber pre-migration READY: '+outcome.publisherAnchors+
      ' authorized publisher anchors, '+outcome.historicalArticles+
      ' historical articles, no active legacy publisher keys; '+outcome.era);
  }catch(error){
    // Do not echo any SQL data, pairwise subject, export SQL or private rows.
    console.error('Haber pre-migration BLOCKED:',error.message);
    process.exitCode=1;
  }
}
