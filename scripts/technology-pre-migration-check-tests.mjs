import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { checkTechnologyPreMigrationReadiness } from './technology-pre-migration-check.mjs';

const expectedMigration='0011_article_withdrawals.sql';
const newMigration='0016_technology_agent_action_idempotency.sql';
const query=readFileSync(new URL('../worker/queries/technology-pre-migration-readiness.sql',import.meta.url),'utf8');
const root=new URL('../worker/migrations/',import.meta.url);
const oldMigrations=readdirSync(root).filter(name=>/^\d{4}_.+\.sql$/u.test(name)
  && Number(name.slice(0,4))<=11).sort();
assert.equal(oldMigrations.length,11);

function legacyDb(mode='valid') {
  const db=new DatabaseSync(':memory:');
  for(const file of oldMigrations) db.exec(readFileSync(new URL(file,root),'utf8'));
  db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL);');
  for(let i=0;i<oldMigrations.length;i++)db.prepare(
    'INSERT INTO d1_migrations(id,name) VALUES(?,?)',
  ).run(i+1,oldMigrations[i]);
  const add=db.prepare(`INSERT INTO publishers
    (subject,author,may_write_brief,may_publish,disabled_at,note,created_at,acts_for)
    VALUES (?,?,?,?,?,?,?,?)`);
  if(mode!=='missing-hemera')add.run(
    'agent:019f695c-e7a7-7018-8603-4479c35c6ea9',
    mode==='bad-author'?'Wrong name':'Hemera AI',0,mode==='disabled-publish'?0:1,
    mode==='disabled'?'2026-11-15T01:00:00Z':null,'fixture','2026-11-15T00:00:00Z',
    mode==='missing-sponsor'?null:'synthetic-only-sponsor',
  );
  add.run('agent:019f695c-e7a7-7018-8603-560870985863','Selene AI',0,1,null,
    'fixture','2026-11-15T00:00:00Z',
    mode==='wrong-sponsor'?'other-synthetic-sponsor':'synthetic-only-sponsor');
  for(let i=0;i<580;i++){
    const slug='synthetic-archive-'+i;
    db.prepare(`INSERT INTO articles
      (slug,title,description,category,author,body_md,body_html,render_version,
      pub_date,updated_date,is_draft,breaking,editor_pick,created_at,updated_at)
      VALUES (?,?,?,'Teknoloji','Legacy','Old text','<p>Old text</p>',1,
      '2026-01-01','2026-01-01',0,0,0,'2026-01-01','2026-01-01')`)
      .run(slug,slug,'Old archive');
    db.prepare('INSERT INTO article_sources(slug,position,name,url) VALUES (?,0,?,?)')
      .run(slug,'example.test','https://example.test/'+i);
  }
  return db;
}
function result(db){
  return [{success:true,results:[db.prepare(query).get()]}];
}
let checks=0;
const ok=legacyDb();
try{
  assert.deepEqual(checkTechnologyPreMigrationReadiness(result(ok)),{
    publisherAnchors:2,historicalArticles:580,legacyKeys:0,era:'historical-0011',
  });checks++;
  ok.prepare('UPDATE articles SET is_draft=1 WHERE slug=?').run('synthetic-archive-0');
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(ok)),/historical published/u);checks++;
  ok.prepare('UPDATE articles SET is_draft=0 WHERE slug=?').run('synthetic-archive-0');
  ok.prepare('UPDATE d1_migrations SET name=? WHERE id=11').run('fake.sql');
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(ok)),/migration state/u);checks++;
  ok.prepare('UPDATE d1_migrations SET name=? WHERE id=11').run(expectedMigration);
  ok.exec("INSERT INTO d1_migrations(id,name) VALUES(12,'0012_technology_newsroom.sql')");
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(ok)),/migration state/u);checks++;
  ok.exec('DELETE FROM d1_migrations WHERE id=12');
  ok.prepare('UPDATE publishers SET key_digest=? WHERE author=?').run('synthetic-digest','Selene AI');
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(ok)),/active_legacy_keys/u);checks++;
  ok.prepare('UPDATE publishers SET key_digest=NULL WHERE author=?').run('Selene AI');
  ok.prepare(`INSERT INTO publishers
    (subject,author,may_write_brief,may_publish,disabled_at,note,created_at,acts_for)
    VALUES (?,?,?,?,?,?,?,?)`).run(
      'agent:019f695c-e7a7-7018-8603-3da153c8b118','Nyx AI',0,0,
      '2026-11-15T00:00:00Z','stale-synthetic','2026-11-15','synthetic-only-sponsor');
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(ok)),
    /seeded_new_agent_rows/u);checks++;
  ok.prepare('DELETE FROM publishers WHERE subject=?').run(
    'agent:019f695c-e7a7-7018-8603-3da153c8b118');
  // SQLite normally enforces the reference. Deliberately model a
  // separately imported, corrupted backup with FK checks disabled.
  ok.exec('PRAGMA foreign_keys=OFF');
  ok.prepare('INSERT INTO article_sources(slug,position,name,url) VALUES(?,?,?,?)')
    .run('missing-archive',0,'example.test','https://example.test/orphan');
  ok.exec('PRAGMA foreign_keys=ON');
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(ok)),/orphan_sources/u);checks++;
}finally{ok.close();}
for(const mode of [
  'missing-hemera','bad-author','disabled-publish','disabled','missing-sponsor','wrong-sponsor',
]){
  const db=legacyDb(mode);
  try{
    assert.throws(()=>checkTechnologyPreMigrationReadiness(result(db)),/valid_publisher_anchors/u,mode);
    checks++;
  }finally{db.close();}
}
const good={success:true,results:[{
  valid_publisher_anchors:2,authorized_publishers:2,seeded_new_agent_rows:0,technology_schema_tables:0,
  active_legacy_keys:0,applied_migrations:11,
  latest_migration:expectedMigration,historical_published:580,orphan_sources:0,
}]};
for(const invalid of [null,{},[],[{}],[good,good],{success:false,results:[]},{success:true,results:[]}]) {
  assert.throws(()=>checkTechnologyPreMigrationReadiness(invalid));
  checks++;
}
assert.equal(checkTechnologyPreMigrationReadiness(good).publisherAnchors,2);checks++;

// A normal deploy after the first successful migration must NOT be blocked:
// production main releases re-run the same workflow on EVERY code update.
// Apply actual forward migrations in an isolated database and prove the
// preflight recognizes complete 0016, but rejects any partial 0012-0015.
const partial=legacyDb();
try{
  const first='0012_technology_newsroom.sql';
  partial.exec(readFileSync(new URL(first,root),'utf8'));
  partial.prepare('INSERT INTO d1_migrations(id,name) VALUES(?,?)').run(12,first);
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(partial)),
    /migration state is neither pristine 0011 nor complete 0016/u);checks++;
}finally{partial.close();}

const modern=legacyDb();
try{
  const newer=readdirSync(root).filter(name=>/^\d{4}_.+\.sql$/u.test(name)
    && Number(name.slice(0,4))>=12 && Number(name.slice(0,4))<=16).sort();
  assert.equal(newer.length,5);
  for(const name of newer){
    modern.exec(readFileSync(new URL(name,root),'utf8'));
    modern.prepare('INSERT INTO d1_migrations(id,name) VALUES(?,?)')
      .run(Number(name.slice(0,4)),name);
  }
  assert.deepEqual(checkTechnologyPreMigrationReadiness(result(modern)),{
    publisherAnchors:2,historicalArticles:580,legacyKeys:0,era:'technology-0016',
  });checks++;

  modern.prepare('UPDATE publishers SET author=? WHERE subject=?').run(
    'Wrong author','agent:019f695c-e7a7-7018-8603-3da153c8b118');
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(modern)),
    /authorized_publishers/u);checks++;
  modern.prepare('UPDATE publishers SET author=? WHERE subject=?').run(
    'Nyx AI','agent:019f695c-e7a7-7018-8603-3da153c8b118');

  modern.exec('DROP TABLE technology_agent_requests');
  assert.throws(()=>checkTechnologyPreMigrationReadiness(result(modern)),
    /technology_schema_tables/u);checks++;
}finally{modern.close();}

const complete={
  success:true,results:[{
    ...good.results[0],
    authorized_publishers:4,seeded_new_agent_rows:2,technology_schema_tables:4,
    applied_migrations:16,latest_migration:newMigration,
  }],
};
assert.equal(checkTechnologyPreMigrationReadiness(complete).era,'technology-0016');checks++;
const future=structuredClone(complete);
future.results[0].applied_migrations=17;
future.results[0].latest_migration='0017_unreviewed_future_migration.sql';
assert.throws(()=>checkTechnologyPreMigrationReadiness(future),
  /migration state is neither pristine 0011 nor complete 0016/u);checks++;

console.log('Haber real 0011+0016 SQL release preflight: '+checks+
  ' historical, complete-era, partial-transition and parser assertions passed');
