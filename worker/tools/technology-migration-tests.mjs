/**
 * Real production migration SQL against isolated SQLite.
 *
 * No real pairwise sponsor is embedded here. Test only the verified PUBLIC
 * Orbit agent IDs and an explicitly synthetic sponsor. New publisher/admin
 * grants must derive from the existing enabled Hemera anchor, fail closed,
 * and remain stable under a re-run.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { TECHNOLOGY_AGENTS } from '../../src/data/technologyAgents.ts';

const root = new URL('../migrations/', import.meta.url);
const files = readdirSync(root).filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
const targetMigrations = files.filter((file) => Number(file.slice(0, 4)) >= 13);
const initialMigrations = files.filter((file) => Number(file.slice(0, 4)) < 13);
const hemera = TECHNOLOGY_AGENTS.find((agent) => agent.name === 'Hemera');
const nyx = TECHNOLOGY_AGENTS.find((agent) => agent.name === 'Nyx');
const asteria = TECHNOLOGY_AGENTS.find((agent) => agent.name === 'Asteria');
const selene = TECHNOLOGY_AGENTS.find((agent) => agent.name === 'Selene');
assert.ok(hemera && nyx && asteria && selene, 'Orbit actor identity list must remain complete');
const syntheticSponsor = 'pairwise-synthetic-test-sponsor';
let assertions = 0;

function databaseWithHemera(mode) {
  const db = new DatabaseSync(':memory:');
  for (const file of initialMigrations) {
    db.exec(readFileSync(new URL(file, root), 'utf8'));
  }
  // Both existing publishers are present in the real production baseline.
  // Selene remains enabled even when the Hemera sponsor anchor is invalid.
  db.prepare(`INSERT INTO publishers
    (subject,author,may_write_brief,may_publish,disabled_at,note,created_at,acts_for)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    'agent:'+selene.id,selene.author,0,1,null,'Existing synthetic Selene',
    '2026-11-15T09:00:00Z',syntheticSponsor,
  );
  if (mode !== 'missing') {
    db.prepare(`INSERT INTO publishers
      (subject,author,may_write_brief,may_publish,disabled_at,note,created_at,acts_for)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      'agent:'+hemera.id, hemera.author, 0,
      mode === 'cannot-publish' ? 0 : 1,
      mode === 'disabled' ? '2026-11-15T10:00:00Z' : null,
      'Synthetic existing publisher anchor',
      '2026-11-15T09:00:00Z',
      mode === 'no-sponsor' ? null : syntheticSponsor,
    );
  }
  return db;
}

for (const mode of ['valid', 'missing', 'disabled', 'cannot-publish', 'no-sponsor']) {
  const db = databaseWithHemera(mode);
  try {
    for (const file of targetMigrations) {
      db.exec(readFileSync(new URL(file, root), 'utf8'));
    }
    const expected = mode === 'valid' ? 1 : 0;
    for (const agent of [nyx, asteria]) {
      const record = db.prepare(
        'SELECT author,may_write_brief,may_publish,disabled_at,acts_for FROM publishers WHERE subject=?',
      ).get('agent:'+agent.id);
      assert.equal(Boolean(record),Boolean(expected),mode+' '+agent.name);
      assertions++;
      if (record) {
        assert.equal(record.author,agent.author);
        assert.equal(record.may_write_brief,0);
        assert.equal(record.may_publish,1);
        assert.equal(record.disabled_at,null);
        assert.equal(record.acts_for,syntheticSponsor);
        assertions += 5;
      }
    }
    // The exact SELECT used by the remote Wrangler production acceptance
    // must agree with the guarded seed, not just a JS copy of its policy.
    const readiness=db.prepare(
      readFileSync(new URL('../queries/technology-release-readiness.sql', import.meta.url),'utf8'),
    ).get();
    assert.equal(readiness.authorized_publishers,mode === 'valid' ? 4 : 0,mode+' release readiness');
    assert.equal(readiness.authorized_admins,expected,mode+' administrator readiness');
    assert.equal(readiness.agent_receipts_table,1);
    assert.equal(readiness.admin_receipts_table,1);
    assertions+=4;
    if (mode === 'valid') {
      db.prepare('UPDATE publishers SET author=? WHERE subject=?')
        .run('Wrong author AI','agent:'+nyx.id);
      assert.equal(db.prepare(
        readFileSync(new URL('../queries/technology-release-readiness.sql', import.meta.url),'utf8'),
      ).get().authorized_publishers,3,'mismatched publisher names must fail readiness');
      db.prepare('UPDATE publishers SET author=? WHERE subject=?')
        .run(nyx.author,'agent:'+nyx.id);
      assertions++;
    }
    const admins=db.prepare('SELECT orbit_subject,disabled_at FROM newsroom_administrators').all();
    assert.equal(admins.length,expected,mode+' administrator grant');
    assertions++;
    if(expected) {
      assert.equal(admins[0].orbit_subject,syntheticSponsor);
      assert.equal(admins[0].disabled_at,null);
      assertions+=2;
    }
    // Forward-compatible no-op: if a migration is run again, its guarded
    // seeding statements never widen or duplicate any permission.
    for (const file of targetMigrations.filter((file)=>/0013_|0014_/u.test(file))) {
      const sql=readFileSync(new URL(file,root),'utf8');
      // Cloudflare applies a migration only once. Re-run only the guarded
      // seed INSERT here: replaying 0014's CREATE TABLE is not valid SQL.
      const insertSql=file.startsWith('0014_')
        ? sql.slice(sql.indexOf('INSERT INTO newsroom_administrators'))
        : sql;
      assert.ok(insertSql.startsWith('INSERT INTO') || insertSql.includes('INSERT INTO publishers'));
      db.exec(insertSql);
    }
    const after=db.prepare('SELECT COUNT(*) AS n FROM newsroom_administrators').get();
    assert.equal(after.n,expected);
    assertions++;
    const count=db.prepare('SELECT COUNT(*) AS n FROM publishers').get();
    assert.equal(count.n,1 + (mode === 'missing' ? 0 : 1) + 2*expected);
    assertions++;
  } finally {
    db.close();
  }
}
console.log('Haber 2.0 publisher/admin SQL migrations: '+assertions+
  ' checks, five isolated sponsor states, no accidental privilege grants');
