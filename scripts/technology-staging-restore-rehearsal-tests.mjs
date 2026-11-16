import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SCRIPT = 'scripts/technology-staging-restore-rehearsal.mjs';
const SOURCE = readFileSync(SCRIPT, 'utf8');

test('staging restore tool rejects any arbitrary argument before remote access', () => {
  for (const argument of [
    '--config=./wrangler.ssr.jsonc',
    '--remote',
    '--database=haber',
  ]) {
    const result = spawnSync(process.execPath, [SCRIPT, argument], {
      encoding: 'utf8', timeout: 6000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /aborted before completion/u);
  }
});

test('rehearsal cannot send SQL restore to a remote D1 or alias production', () => {
  assert.match(SOURCE, /const CONFIG = '\.\/wrangler\.staging\.jsonc';/u);
  assert.match(SOURCE, /validateHaberStagingConfig\(/u);
  assert.match(SOURCE, /readHaberProductionConfig\(/u);
  assert.match(SOURCE, /'d1', 'export', DB, '--remote', '--config', CONFIG/u);
  assert.match(SOURCE, /'d1', 'execute', DB, '--local', '--config', CONFIG/u);
  assert.doesNotMatch(SOURCE, /'d1', 'execute', DB, '--remote'/u);
  assert.match(SOURCE, /await rm\(scratch, \{ recursive: true, force: true \}\)/u);
  assert.match(SOURCE, /verifyStagingRestoredArchive\(/u);
  assert.match(SOURCE, /canonicalLegacySlugs\(\)/u);
  assert.match(SOURCE, /expectedMigrationNames:/u);
  assert.match(SOURCE, /missingPublishedSources:/u);
  assert.match(SOURCE, /orphanSources:/u);
});

test('production backup attestation is never claimed by stage-only restore', () => {
  assert.match(SOURCE, /production backup gate is separate/u);
  assert.doesNotMatch(SOURCE, /HABER_D1_BACKUP_VERIFIED_RELEASE_SHA/u);
});
