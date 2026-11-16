/**
 * Local-only rehearsal of a migration-aware recovery boundary.
 *
 * The production recovery mechanism is Cloudflare Time Travel, which is
 * remote and destructive and MUST NOT run in this test. This test uses
 * Node SQLite's native in-memory serialize/deserialize to prove that the
 * complete historical dataset can survive a restore of its pre-0012
 * schema after applying all new technology migrations.
 *
 * Real article Markdown -> SQL fixture conversion uses the repository's
 * historical migration code. All temporary SQL files are deleted.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const files = readdirSync(new URL('../migrations/',import.meta.url))
  .filter(name=>/^\d{4}_.+\.sql$/u.test(name)).sort();
const before=files.filter(name=>Number(name.slice(0,4))<=11);
const after=files.filter(name=>Number(name.slice(0,4))>=12);
assert.ok(before.length>=11 && after.length===6,'expected old and future migration sets');

const tmp=mkdtempSync(join(tmpdir(),'haber-recovery-test-'));
const fixture=join(tmp,'historical-archive.sql');
const db=new DatabaseSync(':memory:');
let restored;
let partial;
try {
  execFileSync(process.execPath,[
    new URL('./migrate-archive.mjs',import.meta.url).pathname,fixture,
  ],{stdio:'pipe',timeout:45000});
  for(const migration of before) {
    db.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
  }
  db.exec(readFileSync(fixture,'utf8'));
  const rows=db.prepare('SELECT slug,title,category,author,body_md,pub_date,updated_date FROM articles ORDER BY slug').all();
  const published=db.prepare('SELECT COUNT(*) AS n FROM articles WHERE is_draft=0').get().n;
  assert.equal(published,580,'all 580 published historical records must be in recovery fixture');
  const sources=db.prepare('SELECT COUNT(*) AS n FROM article_sources').get().n;
  const tags=db.prepare('SELECT COUNT(*) AS n FROM article_tags').get().n;
  assert.ok(sources>0 && tags>0);
  const hash=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const state=db.prepare('SELECT content_version FROM site_state WHERE id=1').get();

  // A pre-migration backup exists IN MEMORY. Never create a production backup
  // or use Cloudflare's destructive restore API from a CI test.
  const checkpoint=db.serialize();
  assert.ok(checkpoint.byteLength>0);

  // Partial migration failure is as important as a broken full release.
  // Simulate stopping immediately after adding the new-era articles schema.
  partial=new DatabaseSync(':memory:');
  partial.deserialize(checkpoint);
  partial.exec(readFileSync(new URL('../migrations/'+after[0],import.meta.url),'utf8'));
  assert.ok(partial.prepare('PRAGMA table_info(articles)').all().some(row=>row.name==='publication_era'));
  partial.deserialize(checkpoint); // local-only recovery from incomplete migration
  assert.ok(!partial.prepare('PRAGMA table_info(articles)').all().some(row=>row.name==='publication_era'));
  assert.equal(partial.prepare('SELECT COUNT(*) AS n FROM articles WHERE is_draft=0').get().n,580);
  assert.equal(partial.prepare('PRAGMA integrity_check').get().integrity_check,'ok');

  for(const migration of after) {
    db.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='newsroom_administrators'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM articles WHERE publication_era='legacy'").get().n,0,
    'retired archive must not be resurrected on the live site');
  assert.ok(db.prepare("PRAGMA table_info(articles)").all().some(row=>row.name==='publication_era'));

  db.exec(`INSERT INTO articles
    (slug,title,description,category,author,body_md,body_html,render_version,
      pub_date,updated_date,is_draft,breaking,editor_pick,created_at,updated_at,
      publication_era,tech_category,orbit_actor_subject)
    VALUES
    ('recovery-synthetic-tech-story','Temporary local story','Local only','Teknoloji',
      'Selene AI','## Test','<p>Test</p>',1,
      '2026-11-15T00:00:00Z','2026-11-15T00:00:00Z',0,0,0,
      '2026-11-15T00:00:00Z','2026-11-15T00:00:00Z',
      'technology','yazilim','agent:synthetic-recovery-only');`);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM articles WHERE publication_era='technology'").get().n,1);

  restored=new DatabaseSync(':memory:');
  restored.deserialize(checkpoint);
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM articles WHERE is_draft=0').get().n,580);
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM article_sources').get().n,sources);
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM article_tags').get().n,tags);
  assert.equal(restored.prepare('SELECT content_version FROM site_state WHERE id=1').get().content_version,state.content_version);
  const restoredRows=restored.prepare('SELECT slug,title,category,author,body_md,pub_date,updated_date FROM articles ORDER BY slug').all();
  assert.equal(createHash('sha256').update(JSON.stringify(restoredRows)).digest('hex'),hash,
    'historical article data must match the exact pre-migration snapshot');
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM articles WHERE slug=?').get('recovery-synthetic-tech-story').n,0);
  assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='newsroom_administrators'").get().n,0);
  assert.ok(!restored.prepare('PRAGMA table_info(articles)').all().some(row=>row.name==='publication_era'));
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('Local D1 recovery rehearsal PASS: 580 historical published articles, sources/tags preserved,');
  console.log('pre-0012 schema restored after partial or full 0012-0017; synthetic new-era story absent.');
  console.log('This does NOT perform or prove Cloudflare production Time Travel restoration.');
} finally {
  restored?.close();
  partial?.close();
  db.close();
  rmSync(tmp,{recursive:true,force:true});
}
