import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { finalizeStagingAssets } from './technology-staging-build.mjs';

const STAGE='https://haber-site-staging.samett33710.workers.dev';
let cases=0;
const dir=mkdtempSync(join(tmpdir(),'haber-staging-noindex-'));
try {
  const robots=join(dir,'robots.txt');
  const headers=join(dir,'_headers');
  writeFileSync(robots,'User-agent: *\nAllow: /\nSitemap: https://haber.sametbasbug.dev/sitemap-index.xml\n');
  const outcome=finalizeStagingAssets(dir,STAGE);
  assert.equal(outcome.robots,'User-agent: *\nDisallow: /\n');cases++;
  assert.ok(!outcome.robots.includes('haber.sametbasbug.dev'));cases++;
  assert.match(outcome.headers,/\/\*\n  X-Robots-Tag: noindex, nofollow/u);cases++;
  writeFileSync(robots,'User-agent: *\nAllow: /\n');
  writeFileSync(headers,'/_astro/*\n  Cache-Control: public, max-age=31536000\n');
  const added=finalizeStagingAssets(dir,STAGE);
  assert.match(added.headers,/Cache-Control: public/u);cases++;
  assert.match(added.headers,/X-Robots-Tag: noindex, nofollow/u);cases++;
  assert.throws(()=>finalizeStagingAssets(dir,'https://haber.sametbasbug.dev'));cases++;
  assert.throws(()=>finalizeStagingAssets(dir,'https://evil.example'));cases++;
  assert.throws(()=>finalizeStagingAssets(dir,STAGE),
    /requires explicit review/u,'never silently duplicate robots headers');cases++;
  rmSync(robots);
  assert.throws(()=>finalizeStagingAssets(dir,STAGE),/missing source robots/u);cases++;

  // Staging-only robots are emitted in the build directory, never the
  // committed production robots.txt.
  const source=readFileSync(new URL('../public/robots.txt',import.meta.url),'utf8');
  assert.match(source,/Allow: \//u);cases++;
  assert.match(source,/https:\/\/haber.sametbasbug.dev\/sitemap-index.xml/u);cases++;
  assert.ok(!source.includes('Disallow: /'));cases++;

  for (const file of ['TechnologyLayout.astro','BaseLayout.astro']){
    const layout=readFileSync(new URL('../src/layouts/'+file,import.meta.url),'utf8');
    assert.match(layout,/PUBLIC_HABER_STAGING === 'true'/u);cases++;
    assert.match(layout,/noindex \|\| stageBuild/u);cases++;
  }
  const middleware=readFileSync(new URL('../src/middleware.ts',import.meta.url),'utf8');
  assert.match(middleware,/PUBLIC_HABER_STAGING === 'true'/u);cases++;
  assert.match(middleware,/x-robots-tag', 'noindex, nofollow'/u);cases++;
  assert.match(middleware,/env.ORBIT_AUDIENCE === 'orbit-haber-staging'/u);cases++;
  assert.match(middleware,/env.ORBIT_ISSUER === STAGING_ORBIT_ISSUER/u);cases++;

  const denied=spawnSync(process.execPath,
    ['scripts/technology-staging-build.mjs'],{encoding:'utf8'});
  assert.notEqual(denied.status,0,'staging build without approved config must be blocked');cases++;
  const prod=spawnSync(process.execPath,
    ['scripts/technology-staging-build.mjs','--config=wrangler.ssr.jsonc'],{encoding:'utf8'});
  assert.notEqual(prod.status,0,'production config must never be used for staging build');cases++;
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('Haber staging canonical/noindex protection:',cases,'cases passed');
