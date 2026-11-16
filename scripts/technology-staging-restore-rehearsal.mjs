/**
 * Safe, repeatable D1 export and offline restore rehearsal for the ISOLATED
 * Haber staging database. Never binds to production, never uploads restored
 * data, and leaves no SQL or local DB files on the Mac.
 *
 * Deliberately NOT part of npm run quality: this command accesses remote D1.
 * The production backup gate is separate and requires encrypted offsite
 * storage, an independent restore and SHA-bound human attestation.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseWranglerJsonc,
  readHaberProductionConfig,
  validateHaberStagingConfig,
} from './technology-staging-config-check.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONFIG = './wrangler.staging.jsonc';
const DB = 'DB';
const WRANGLER = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');
const EXPECTED_LEGACY = 580;
const EXPECTED_SOURCES = 590;
const EXPECTED_MIGRATIONS = 16;

function run(args) {
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, CI: 'true', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseQuery(output) {
  const rows = JSON.parse(output);
  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!Array.isArray(result?.results)) throw new Error('unexpected_local_d1_response');
  return result.results;
}

function query(localDir, sql) {
  return parseQuery(run([
    'd1', 'execute', DB, '--local', '--config', CONFIG,
    '--persist-to', localDir, '--command', sql, '--json',
  ]));
}

async function main() {
  if (process.argv.length !== 2) throw new Error('no_dynamic_options_allowed');
  // Resource identity, assets, environment and binding isolation are checked
  // against the real production config before ANY Cloudflare request.
  validateHaberStagingConfig(
    parseWranglerJsonc(readFileSync(resolve(ROOT, CONFIG), 'utf8')),
    readHaberProductionConfig(),
  );

  const scratch = await mkdtemp(join(tmpdir(), 'haber-stage-restore-'));
  let phase = 'export';
  try {
    const exportPath = join(scratch, 'staging.sql');
    const localDir = join(scratch, 'local-d1');
    // The ONLY remote command is a full export from the allowlisted stage DB.
    run(['d1', 'export', DB, '--remote', '--config', CONFIG,
      '--output', exportPath, '--skip-confirmation']);

    const bytes = await readFile(exportPath);
    if (bytes.byteLength < 100_000) throw new Error('suspiciously_small_export');
    const digest = createHash('sha256').update(bytes).digest('hex');

    phase = 'isolated_local_restore';
    // --local is unconditional: this command cannot overwrite stage or prod.
    run(['d1', 'execute', DB, '--local', '--config', CONFIG,
      '--persist-to', localDir, '--file', exportPath, '--yes']);

    phase = 'offline_integrity';
    const counts = query(localDir, `
      SELECT
        (SELECT COUNT(*) FROM articles
           WHERE publication_era = 'legacy' AND is_draft = 0) AS historical,
        (SELECT COUNT(*) FROM article_sources) AS sources,
        (SELECT COUNT(*) FROM d1_migrations) AS migrations,
        (SELECT COUNT(*) FROM publishers WHERE may_publish = 1) AS permitted_writers,
        (SELECT COUNT(*) FROM newsroom_administrators) AS administrators
    `)[0];
    const integrity = query(localDir, 'PRAGMA quick_check');
    const invalidForeignKeys = query(localDir, 'PRAGMA foreign_key_check');
    if (counts.historical !== EXPECTED_LEGACY
      || counts.sources < EXPECTED_SOURCES
      || counts.migrations < EXPECTED_MIGRATIONS
      || counts.permitted_writers < 4
      || counts.administrators < 1
      || integrity.length !== 1 || integrity[0].quick_check !== 'ok'
      || invalidForeignKeys.length !== 0) {
      throw new Error('staging_d1_restore_integrity_failed');
    }

    // These are aggregate public archive counts, not SQL data or private
    // identities. Never expose the temporary export URL, path or contents.
    console.log(JSON.stringify({
      stage: 'haber-site-staging',
      backupBytes: bytes.byteLength,
      sha256: digest,
      historicalPublished: counts.historical,
      sourceRows: counts.sources,
      recordedMigrations: counts.migrations,
      stagingWriterRows: counts.permitted_writers,
      stagingAdminRows: counts.administrators,
      integrity: 'ok',
      foreignKeyViolations: 0,
      restore: 'isolated_local_d1_only',
    }));
  } catch {
    // Raw Wrangler stderr could contain infrastructure details. Stay terse
    // and let the independent stage config and remote service be inspected.
    console.error('Staging-only D1 restore rehearsal failed at: ' + phase);
    process.exitCode = 1;
  } finally {
    // Delete all SQL and local DB bytes even after failed export/restore.
    await rm(scratch, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error('Staging-only D1 restore rehearsal aborted before completion.');
  process.exitCode = 1;
});
