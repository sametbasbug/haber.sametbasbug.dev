import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {
  buildLegacyPermalinkQuery, canonicalLegacySlugs, verifyLegacyPermalinkCounts,
} from './technology-legacy-permalinks.mjs';

const slugs=canonicalLegacySlugs();
assert.equal(slugs.length,580);
assert.equal(new Set(slugs).size,580);
assert.deepEqual(slugs,[...slugs].sort());

let assertions=3;
const historical=buildLegacyPermalinkQuery(slugs,'historical');
const technology=buildLegacyPermalinkQuery(slugs,'technology');
assert.ok(historical.includes('WITH canonical(slug) AS'));assertions++;
assert.ok(!historical.includes('publication_era'));assertions++;
assert.ok(technology.includes("a.publication_era='legacy'"));assertions++;
assert.throws(()=>buildLegacyPermalinkQuery(slugs,'future'));assertions++;
assert.throws(()=>buildLegacyPermalinkQuery([...slugs.slice(1),slugs[1]],'historical'));assertions++;
assert.throws(()=>buildLegacyPermalinkQuery([...slugs.slice(1),'bad\'; DROP TABLE articles; --'],'historical'));assertions++;

const db=new DatabaseSync(':memory:');
try{
  db.exec(`CREATE TABLE articles(
    slug TEXT PRIMARY KEY,is_draft INTEGER NOT NULL DEFAULT 0,
    publication_era TEXT NOT NULL DEFAULT 'legacy'
  ); CREATE TABLE article_sources(slug TEXT NOT NULL);`);
  const article=db.prepare('INSERT INTO articles(slug) VALUES (?)');
  const source=db.prepare('INSERT INTO article_sources(slug) VALUES (?)');
  for(const slug of slugs){article.run(slug);source.run(slug);}
  const get=query=>({...db.prepare(query).get()});

  const ready=get(historical);
  assert.deepEqual(ready,{
    expected_permalinks:580,published_permalinks:580,sourced_permalinks:580,
  });assertions++;
  assert.deepEqual(get(technology),ready);assertions++;

  const fixture={success:true,results:[ready]};
  assert.deepEqual(verifyLegacyPermalinkCounts([fixture]),{matched:580});assertions++;
  assert.deepEqual(verifyLegacyPermalinkCounts(fixture),{matched:580});assertions++;

  // Replacing an old URL with a new row leaves the total unchanged:
  // a COUNT(*)-only gate would pass, but this exact manifest must fail.
  db.prepare('DELETE FROM articles WHERE slug=?').run(slugs[0]);
  article.run('unexpected-replacement-url');
  const replaced=get(historical);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles').get().n,580);assertions++;
  assert.equal(replaced.published_permalinks,579);assertions++;
  assert.throws(()=>verifyLegacyPermalinkCounts({success:true,results:[replaced]}));assertions++;
  article.run(slugs[0]);
  db.prepare('DELETE FROM articles WHERE slug=?').run('unexpected-replacement-url');

  db.prepare('UPDATE articles SET is_draft=1 WHERE slug=?').run(slugs[1]);
  assert.equal(get(historical).published_permalinks,579);assertions++;
  db.prepare('UPDATE articles SET is_draft=0 WHERE slug=?').run(slugs[1]);

  db.prepare('DELETE FROM article_sources WHERE slug=?').run(slugs[2]);
  const missingSource=get(historical);
  assert.equal(missingSource.published_permalinks,580);assertions++;
  assert.equal(missingSource.sourced_permalinks,579);assertions++;
  source.run(slugs[2]);

  db.prepare('UPDATE articles SET publication_era=? WHERE slug=?').run('technology',slugs[3]);
  assert.equal(get(historical).published_permalinks,580);assertions++;
  assert.equal(get(technology).published_permalinks,579);assertions++;
  db.prepare('UPDATE articles SET publication_era=? WHERE slug=?').run('legacy',slugs[3]);

  assert.deepEqual(get(technology),ready);assertions++;
}finally{db.close();}
for(const invalid of [
  null,[],{},[{}],[{success:false,results:[{}]}],
  [{success:true,results:[]}],
  [{success:true,results:[{expected_permalinks:580,published_permalinks:'580',sourced_permalinks:580}]}],
]){
  assert.throws(()=>verifyLegacyPermalinkCounts(invalid));assertions++;
}
// The CLI should not echo a hostile or unexpectedly shaped JSON payload.
const cli=new URL('./technology-legacy-permalinks.mjs',import.meta.url).pathname;
const hostile=spawnSync(process.execPath,[cli,'--check'],{
  input:'{"secret_token":"DO_NOT_ECHO_THIS"}',encoding:'utf8',
});
assert.notEqual(hostile.status,0);assertions++;
assert.ok(!hostile.stdout.includes('DO_NOT_ECHO_THIS'));assertions++;
assert.ok(!hostile.stderr.includes('DO_NOT_ECHO_THIS'));assertions++;
console.log('Haber exact 580 historical URL safety: '+assertions+
  ' SQLite, malformed-response, owner/era, and CLI checks passed');
