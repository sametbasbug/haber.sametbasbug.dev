import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {test} from 'node:test';
const read=path=>readFileSync(path,'utf8');
test('retired articles cannot reappear after restored D1',()=>{
  assert.match(read('worker/migrations/0017_retire_legacy_news.sql'),/DELETE FROM articles WHERE publication_era='legacy';/u);
});
test('reader surfaces exclude retired news',()=>{
  assert.ok(!read('src/components/news/TechnologyHome.astro').includes("publicationEra: 'legacy'"));
  assert.ok(!read('src/layouts/TechnologyLayout.astro').includes('data-topic-link="arsiv"'));
  assert.ok(read('src/pages/[...slug].astro').includes("publicationEra: 'technology'"));
  assert.ok(read('src/pages/arsiv/index.astro').includes('status: 410'));
  assert.ok(read('src/pages/yeni/arsiv/index.astro').includes('status: 410'));
});
test('580 original source files remain available offline',()=>{
  const files=readdirSync('src/content/equinoxHaber').filter(x=>x.endsWith('.md'));
  const historical=files.filter(x=>!/^techCategory:/mu.test(read('src/content/equinoxHaber/'+x)));
  assert.equal(historical.length,580);
  assert.equal(files.length-historical.length,3);
});

test('static emergency renderer excludes the old 580 stories',()=>{
  const code=read('src/data/newsSource.ts');
  assert.match(code,/publicationEra === "legacy"/u);
  assert.match(code,/entry\.data\.techCategory/u);
});
