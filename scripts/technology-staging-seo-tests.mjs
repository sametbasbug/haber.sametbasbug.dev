import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
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
  // A substituted symlink must never redirect the staging static-policy write.
  const victim=join(dir,'unrelated-production-policy.txt');
  writeFileSync(victim,'DO NOT MODIFY');
  rmSync(robots);
  symlinkSync(victim,robots);
  assert.throws(()=>finalizeStagingAssets(dir,STAGE));cases++;
  assert.equal(readFileSync(victim,'utf8'),'DO NOT MODIFY');cases++;
  rmSync(robots);
  writeFileSync(robots,'User-agent: *\\nAllow: /\\n');
  rmSync(headers);
  symlinkSync(victim,headers);
  assert.throws(()=>finalizeStagingAssets(dir,STAGE));cases++;
  assert.equal(readFileSync(victim,'utf8'),'DO NOT MODIFY');cases++;
  rmSync(headers);
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
  const astroSSR=readFileSync(new URL('../astro.config.ssr.mjs',import.meta.url),'utf8');
  assert.match(astroSSR,/outDir: stagingBuild \? '.\/dist-ssr-staging' : '.\/dist-ssr'/u);cases++;
  const middleware=readFileSync(new URL('../src/middleware.ts',import.meta.url),'utf8');
  assert.match(middleware,/PUBLIC_HABER_STAGING === 'true'/u);cases++;
  assert.match(middleware,/x-robots-tag', 'noindex, nofollow'/u);cases++;
  assert.match(middleware,/env.ORBIT_AUDIENCE === 'orbit-haber-staging'/u);cases++;
  assert.match(middleware,/env.ORBIT_ISSUER === STAGING_ORBIT_ISSUER/u);cases++;

  // The last staging SEO release failure mode: a shell/CI variable can
  // accidentally set PUBLIC_HABER_STAGING=true while the Worker is built
  // for the LIVE production site. Reject crossed site/news/build roles in
  // the real Astro configuration imports, not only in a test-side parser.
  const prodOrigin='https://haber.sametbasbug.dev';
  const configs=[
    {name:'astro.config.ssr.mjs', stage:'true', site:STAGE,news:STAGE,allowed:true},
    {name:'astro.config.ssr.mjs', stage:'false',site:prodOrigin,news:prodOrigin,allowed:true},
    {name:'astro.config.mjs',stage:'false',site:prodOrigin,news:prodOrigin,allowed:true},
    {name:'astro.config.ssr.mjs',stage:'true',site:prodOrigin,news:prodOrigin,allowed:false},
    {name:'astro.config.mjs',stage:'true',site:prodOrigin,news:prodOrigin,allowed:false},
    {name:'astro.config.ssr.mjs',stage:'false',site:STAGE,news:STAGE,allowed:false},
    {name:'astro.config.ssr.mjs',stage:'true',site:STAGE,news:prodOrigin,allowed:false},
    {name:'astro.config.ssr.mjs',stage:'false',site:prodOrigin,news:STAGE,allowed:false},
    {name:'astro.config.mjs',stage:'false',site:STAGE,news:STAGE,allowed:false},
  ];
  for(const entry of configs){
    const expectedOutDir=entry.name==='astro.config.ssr.mjs'
      ? (entry.stage==='true' ? './dist-ssr-staging' : './dist-ssr')
      : undefined;
    // Execute the actual Astro configuration, not just a source regex:
    // a staging build may never emit to production's Wrangler entrypoint.
    const verifyImport="import config from './"+entry.name+"';"
      +(expectedOutDir ? 'if(config.outDir!=='+JSON.stringify(expectedOutDir)+') process.exit(42);' : '');
    const validation=spawnSync(process.execPath,[
      '--input-type=module','-e',verifyImport,
    ],{encoding:'utf8',timeout:10_000,env:{
      ...process.env,PUBLIC_HABER_STAGING:entry.stage,
      PUBLIC_SITE_URL:entry.site,PUBLIC_NEWS_SITE_URL:entry.news,
    }});
    if(entry.allowed) {
      assert.equal(validation.status,0,'Expected valid build environment '+JSON.stringify(entry));
    }else {
      assert.notEqual(validation.status,0,'Unsafe build environment must fail closed '+JSON.stringify(entry));
    }
    cases++;
  }

  const denied=spawnSync(process.execPath,
    ['scripts/technology-staging-build.mjs'],{encoding:'utf8'});
  assert.notEqual(denied.status,0,'staging build without approved config must be blocked');cases++;
  const prod=spawnSync(process.execPath,
    ['scripts/technology-staging-build.mjs','--config=wrangler.ssr.jsonc'],{encoding:'utf8'});
  assert.notEqual(prod.status,0,'production config must never be used for staging build');cases++;
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('Haber staging canonical/noindex protection:',cases,'cases passed');
