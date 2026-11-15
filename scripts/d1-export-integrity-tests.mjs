import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdtempSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifySqlExportFile } from './d1-export-integrity.mjs';
import { verifyExportedNewsDatabase } from './d1-export-integrity.mjs';

function fakeDb({articles=580,sources=580,orphan=false,integrity='ok',migrations=11,technology=false}={}) {
  const db=new DatabaseSync(':memory:');
  const migrationFiles=readdirSync(new URL('../worker/migrations/',import.meta.url))
    .filter(file=>/^\d{4}_.+\.sql$/u.test(file)).sort();
  db.exec('CREATE TABLE articles(slug TEXT PRIMARY KEY,title TEXT,is_draft INTEGER DEFAULT 0'+
    (technology?",publication_era TEXT DEFAULT 'legacy'":'')+');');
  db.exec('CREATE TABLE article_sources(slug TEXT,position INTEGER,url TEXT);');
  db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT);');
  const insert=db.prepare("INSERT INTO articles(slug,title) VALUES(?,?)");
  const source=db.prepare("INSERT INTO article_sources(slug,position,url) VALUES(?,0,?)");
  for(let i=0;i<articles;i++)insert.run('fake-'+i,'Local test '+i);
  for(let i=0;i<sources;i++)source.run('fake-'+(i%Math.max(1,articles)),'https://test.example');
  for(let i=0;i<migrations;i++)
    db.prepare('INSERT INTO d1_migrations(id,name) VALUES(?,?)').run(i+1,
      migrationFiles[i]??'unexpected-'+i+'.sql');
  if(orphan)source.run('missing-article','https://test.example');
  if(technology){
    for(const table of [
      'article_revisions','newsroom_administrators',
      'newsroom_admin_requests','technology_agent_requests',
    ])db.exec('CREATE TABLE '+table+'(id INTEGER);');
  }
  return db;
}
function outcome(input,expected) {
  const db=fakeDb(input);
  try {
    if(expected){assert.deepEqual(verifyExportedNewsDatabase(db),expected);}
    else assert.throws(()=>verifyExportedNewsDatabase(db));
  }finally{db.close();}
}
outcome({}, {published:580,sourceCount:580,migrationLevel:'historical-era',schema:'historical'});
outcome({articles:600,sources:620,migrations:16,technology:true},
  {published:600,sourceCount:620,migrationLevel:'technology-era',schema:'technology-capable'});

{
  const expectedMigrations=readdirSync(new URL('../worker/migrations/',import.meta.url))
    .filter(file=>/^\d{4}_.+\.sql$/u.test(file)).sort();
  const db=fakeDb({migrations:16,technology:true});
  try{
    assert.equal(verifyExportedNewsDatabase(db,{expectedMigrations}).schema,'technology-capable');
    db.prepare('UPDATE d1_migrations SET name=? WHERE id=11')
      .run('0011_incorrect_migration_name.sql');
    assert.throws(()=>verifyExportedNewsDatabase(db,{expectedMigrations}),
      /migration history is incomplete/u);
    db.prepare('UPDATE d1_migrations SET name=? WHERE id=11')
      .run(expectedMigrations[10]);
    db.exec('DROP TABLE technology_agent_requests');
    assert.throws(()=>verifyExportedNewsDatabase(db,{expectedMigrations}),
      /missing required schema objects/u);
  }finally{db.close();}
}
{
  const db=fakeDb();
  try {
    const matches=Array.from({length:580},(_,i)=>'fake-'+i);
    assert.equal(verifyExportedNewsDatabase(db,{expectedLegacySlugs:matches}).published,580);
    matches[140]='a-real-archive-slug-missing-from-this-backup';
    assert.throws(()=>verifyExportedNewsDatabase(db,{expectedLegacySlugs:matches}),
      /canonical historical permalinks/u);
  } finally {db.close();}
}
outcome({articles:579});
outcome({sources:579});
outcome({orphan:true});
outcome({migrations:10});
outcome({articles:0,sources:0});
const temp=mkdtempSync(join(tmpdir(),'haber-export-safety-'));
try{
  const sql=join(temp,'hostile.sql');
  const sideEffect=join(temp,'would-be-created.db');
  writeFileSync(sql,`ATTACH DATABASE '${sideEffect}' AS external; CREATE TABLE external.unsafe(v INTEGER);`);
  assert.throws(()=>verifySqlExportFile(sql));
  assert.equal(existsSync(sideEffect),false,'SQL export verification must not write external disk files');
} finally {rmSync(temp,{recursive:true,force:true});}
assert.throws(()=>verifyExportedNewsDatabase(fakeDb(),{minimumPublished:0}));
console.log('D1 export integrity unit tests: 14 historical, corruption, migration, permalink and filesystem safety scenarios passed');
