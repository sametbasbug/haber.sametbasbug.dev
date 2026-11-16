import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {test} from 'node:test';
import {canonicalLegacySlugs} from './technology-legacy-permalinks.mjs';
import {verifyStagingRestoredArchive} from './technology-staging-restore-integrity.mjs';

const canonical = canonicalLegacySlugs();
const migrationNames = readdirSync(new URL('../worker/migrations/',import.meta.url))
  .filter(name=>/^\d{4}_.+\.sql$/u.test(name));

function valid() {
  return {
    restoredLegacySlugs: [...canonical],
    canonicalLegacySlugs: [...canonical],
    restoredMigrationNames: [...migrationNames],
    expectedMigrationNames: [...migrationNames],
    missingPublishedSources:0,
    orphanSources:0,
  };
}

test('all 580 exact public slugs, 16 migration names, and sources survive offline restore',()=>{
  assert.equal(canonical.length,580);
  assert.equal(migrationNames.length,16);
  assert.equal(verifyStagingRestoredArchive(valid()),true);
  assert.equal(verifyStagingRestoredArchive({
    ...valid(),
    restoredLegacySlugs:[...canonical].reverse(),
    restoredMigrationNames:[...migrationNames].reverse(),
  }),true,'record ordering must not change exact identity verification');
});

test('a replaced permalink is rejected even if both counts still equal 580',()=>{
  const bad=valid();
  bad.restoredLegacySlugs[0]='synthetic-url-substitution';
  assert.throws(()=>verifyStagingRestoredArchive(bad),
    /missing_original_permalinks/u);
});

test('missing, duplicate and incorrect migration names fail despite 16 rows',()=>{
  const changed=valid();
  changed.restoredMigrationNames[15]='0016_synthetic_wrong.sql';
  assert.throws(()=>verifyStagingRestoredArchive(changed),
    /migration_history_is_incorrect/u);
  const duplicate=valid();
  duplicate.restoredMigrationNames[15]=duplicate.restoredMigrationNames[0];
  assert.throws(()=>verifyStagingRestoredArchive(duplicate));
  const missing=valid();
  missing.restoredMigrationNames.pop();
  assert.throws(()=>verifyStagingRestoredArchive(missing));
});

test('orphan sources and published articles without a source block restore',()=>{
  assert.throws(()=>verifyStagingRestoredArchive({...valid(),orphanSources:1}),
    /missing_or_orphan_sources/u);
  assert.throws(()=>verifyStagingRestoredArchive({...valid(),missingPublishedSources:1}),
    /missing_or_orphan_sources/u);
  const lost=valid();
  lost.restoredLegacySlugs.pop();
  assert.throws(()=>verifyStagingRestoredArchive(lost));
  const duplicate=valid();
  duplicate.restoredLegacySlugs[0]=duplicate.restoredLegacySlugs[1];
  assert.throws(()=>verifyStagingRestoredArchive(duplicate));
});
