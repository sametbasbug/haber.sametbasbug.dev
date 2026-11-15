/**
 * Offline integrity gate for a previously authorized Cloudflare D1 export.
 *
 * This process never fetches a database, never restores a live DB and never
 * prints row values or the archive path. Use an independently secured SQL
 * export outside the repository. All parsing happens in in-memory SQLite.
 *
 * Only counts and PASS/FAIL appear on stdout/stderr. The caller alone owns
 * protecting and deleting the sensitive export.
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { DatabaseSync, constants as SQLite } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export function verifyExportedNewsDatabase(db, options={}) {
  const minimum = options.minimumPublished ?? 580;
  if (!Number.isSafeInteger(minimum) || minimum < 580) {
    throw new Error('Historical archive baseline must be at least 580');
  }
  // Integrity checks are evaluated before any logical tests. A historical
  // snapshot may have additional drafts, revisions, publisher records, etc.
  if (db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') {
    throw new Error('SQLite integrity check failed');
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new Error('D1 backup contains foreign-key violations');
  }

  const legacyColumn=db.prepare('PRAGMA table_info(articles)').all()
    .some(column=>column.name==='publication_era');
  const published = legacyColumn
    ? db.prepare("SELECT COUNT(*) AS n FROM articles WHERE is_draft=0 AND publication_era='legacy'").get()?.n
    : db.prepare('SELECT COUNT(*) AS n FROM articles WHERE is_draft=0').get()?.n;
  if (!Number.isSafeInteger(published) || published < minimum) {
    throw new Error('D1 backup is missing historical published articles');
  }
  const sources=db.prepare('SELECT COUNT(*) AS n FROM article_sources').get()?.n;
  if (!Number.isSafeInteger(sources) || sources<minimum) {
    throw new Error('D1 backup historical source records are missing');
  }
  const orphanSources=db.prepare(
    'SELECT COUNT(*) AS n FROM article_sources s LEFT JOIN articles a ON s.slug=a.slug WHERE a.slug IS NULL',
  ).get()?.n;
  if (orphanSources !== 0) throw new Error('D1 backup contains orphan source records');
  const missingSourcePublished = db.prepare(
    `SELECT COUNT(*) AS n FROM articles a WHERE is_draft=0
      ${legacyColumn?"AND publication_era='legacy'":''}
      AND NOT EXISTS (SELECT 1 FROM article_sources s WHERE s.slug=a.slug)`,
  ).get()?.n;
  if (missingSourcePublished!==0) {
    throw new Error('Published historical articles are missing source records');
  }

  // A wrong/partial backup can contain exactly 580 *other* articles and
  // still satisfy the row count. Verify every tracked historical permalink
  // against the archive manifest, not only the aggregate total.
  if (options.expectedLegacySlugs) {
    if (!Array.isArray(options.expectedLegacySlugs)
      || options.expectedLegacySlugs.length<580
      || new Set(options.expectedLegacySlugs).size!==options.expectedLegacySlugs.length) {
      throw new Error('Canonical historical archive manifest is missing or duplicated');
    }
    const bySlug=db.prepare(
      `SELECT 1 FROM articles WHERE slug=? AND is_draft=0
        ${legacyColumn?"AND publication_era='legacy'":''}`,
    );
    for(const slug of options.expectedLegacySlugs) {
      if (typeof slug!=='string' || !bySlug.get(slug)) {
        throw new Error('Backup is missing canonical historical permalinks');
      }
    }
  }
  const duplicateSlug=db.prepare(
    'SELECT COUNT(*) AS n FROM (SELECT slug FROM articles GROUP BY slug HAVING COUNT(*)>1)',
  ).get()?.n;
  if (duplicateSlug !== 0) throw new Error('D1 backup contains duplicate article slugs');

  const migrationTable=db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='d1_migrations'",
  ).get()?.n;
  if (migrationTable!==1) {
    throw new Error('D1 backup omitted the migration history');
  }
  const migrationCount=db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get()?.n;
  if (!Number.isSafeInteger(migrationCount) || migrationCount<11) {
    throw new Error('D1 backup predates the current live migration baseline');
  }
  let migrationLevel=migrationCount>=16?'technology-era':'historical-era';
  // An export may contain the expected number of migration records but
  // for a different database. Verify each actual filename through its
  // recorded version, not only the aggregate count.
  if (options.expectedMigrations) {
    const applied=new Set(db.prepare('SELECT name FROM d1_migrations').all().map(row=>row.name));
    const latest=options.expectedMigrations
      .filter(name=>applied.has(name))
      .reduce((max,name)=>Math.max(max,Number(name.slice(0,4))),0);
    if (latest<11 || applied.size!==migrationCount) {
      throw new Error('D1 backup migration manifest does not match expected history');
    }
    for(const name of options.expectedMigrations) {
      if(Number(name.slice(0,4))<=latest && !applied.has(name)) {
        throw new Error('D1 backup migration history is incomplete');
      }
    }
    // A complete new-era backup requires the idempotency receipt tables
    // and the revision table; a 16/16 count without them is not restorable.
    if (latest>=16) {
      for(const table of [
        'article_revisions','newsroom_administrators',
        'newsroom_admin_requests','technology_agent_requests',
      ]) {
        const found=db.prepare(
          'SELECT COUNT(*) AS n FROM sqlite_master WHERE type=? AND name=?',
        ).get('table',table)?.n;
        if(found!==1)throw new Error('D1 technology backup is missing required schema objects');
      }
    }
  }


  const postMigrationSchema=db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='newsroom_administrators'",
  ).get()?.n;
  if (legacyColumn && !postMigrationSchema) {
    // 0012 may be applied alone during a partial migration incident.
    migrationLevel='partial-transition';
  }
  return {published,sourceCount:sources,migrationLevel,
    schema:legacyColumn?'technology-capable':'historical'};
}

export function verifySqlExportFile(path) {
  // The export is sensitive and intentionally never printed. Reasonable cap
  // protects the verification process from accidental huge copies.
  const stats=statSync(path);
  if (!stats.isFile() || stats.size===0 || stats.size>128*1024*1024) {
    throw new Error('Backup file size is invalid for this release');
  }
  const db=new DatabaseSync(':memory:');
  // An export is SQL source. Even when fetched from a trusted D1 service,
  // verify it in a sandboxed, in-memory connection and refuse ATTACH/DETACH
  // to avoid creating/modifying files elsewhere on the developer's machine.
  db.setAuthorizer((action,arg1,arg2) => {
    if (action===SQLite.SQLITE_ATTACH || action===SQLite.SQLITE_DETACH
      || (action===SQLite.SQLITE_FUNCTION && (arg1==='load_extension' || arg2==='load_extension'))) {
      return SQLite.SQLITE_DENY;
    }
    return SQLite.SQLITE_OK;
  });
  try {
    db.exec(readFileSync(path,'utf8'));
    const canonicalArchive=new URL('../src/content/equinoxHaber/',import.meta.url);
    const slugs=readdirSync(canonicalArchive)
      .filter(file=>file.endsWith('.md'))
      .map(file=>file.slice(0,-3));
    const expectedMigrations=readdirSync(new URL('../worker/migrations/',import.meta.url))
      .filter(name=>/^\d{4}_.+\.sql$/u.test(name)).sort();
    return verifyExportedNewsDatabase(db,{
      expectedLegacySlugs:slugs,expectedMigrations,
    });
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const path=process.argv[2];
    if (!path || process.argv.length!==3) {
      throw new Error('Usage: node scripts/d1-export-integrity.mjs /secure/path/to/export.sql');
    }
    const verified=verifySqlExportFile(path);
    console.log('D1 offline export VALID: published historical articles '+verified.published+
      ', source rows '+verified.sourceCount+
      ', schema '+verified.schema+', migration level '+verified.migrationLevel);
  } catch {
    // Never emit the SQL parse error: Cloudflare exports can contain quotes,
    // values and other private information in the SQL error context.
    console.error('D1 offline export INVALID: data, SQL, integrity or archive baseline failed');
    process.exitCode=1;
  }
}
