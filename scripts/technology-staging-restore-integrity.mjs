/**
 * Exact, data-free integrity predicates for an already restored ISOLATED
 * staging D1 snapshot. Slugs are public archive identifiers; no article
 * bodies, OAuth identities, secrets or private rows enter these predicates.
 *
 * Aggregate counts alone were unsafe: 580 entirely different article
 * slugs and 16 unrelated migration filenames previously passed the gate.
 */
export function verifyStagingRestoredArchive({
  restoredLegacySlugs,
  canonicalLegacySlugs,
  restoredMigrationNames,
  expectedMigrationNames,
  missingPublishedSources,
  orphanSources,
}) {
  if (!Array.isArray(canonicalLegacySlugs)
    || canonicalLegacySlugs.length !== 580
    || new Set(canonicalLegacySlugs).size !== 580
    || !canonicalLegacySlugs.every(value => typeof value === 'string'
      && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value))) {
    throw new Error('invalid_canonical_legacy_archive_manifest');
  }
  if (!Array.isArray(restoredLegacySlugs)
    || restoredLegacySlugs.length !== 580
    || new Set(restoredLegacySlugs).size !== 580
    || !restoredLegacySlugs.every(value => typeof value === 'string')
    || !Array.isArray(expectedMigrationNames)
    || expectedMigrationNames.length !== 16
    || new Set(expectedMigrationNames).size !== 16
    || !expectedMigrationNames.every(name => /^\d{4}_.+\.sql$/u.test(name))
    || !Array.isArray(restoredMigrationNames)
    || restoredMigrationNames.length !== 16
    || new Set(restoredMigrationNames).size !== 16
    || !restoredMigrationNames.every(name => typeof name === 'string')) {
    throw new Error('invalid_restored_stage_archive_or_schema');
  }
  const expectedSlugs = [...canonicalLegacySlugs].sort();
  const actualSlugs = [...restoredLegacySlugs].sort();
  if (expectedSlugs.some((slug, i) => slug !== actualSlugs[i])) {
    throw new Error('restored_stage_is_missing_original_permalinks');
  }
  const expectedMigrations = [...expectedMigrationNames].sort();
  const actualMigrations = [...restoredMigrationNames].sort();
  if (expectedMigrations.some((name, i) => name !== actualMigrations[i])) {
    throw new Error('restored_stage_migration_history_is_incorrect');
  }
  if (missingPublishedSources !== 0 || orphanSources !== 0) {
    throw new Error('restored_stage_has_missing_or_orphan_sources');
  }
  return true;
}
