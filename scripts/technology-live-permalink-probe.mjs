/**
 * Opt-in, READ-ONLY HTTP acceptance of every one of the canonical 580
 * historical URLs against production and the isolated staging Worker.
 *
 * Never mutates a D1 record, triggers a deploy or samples arbitrary hosts.
 * Not part of npm run quality: 1,160 real remote GETs are intentional.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { canonicalLegacySlugs } from './technology-legacy-permalinks.mjs';

export const PRODUCTION = 'https://haber.sametbasbug.dev';
export const STAGING = 'https://haber-site-staging.samett33710.workers.dev';
export const EXPECTED = 580;
const CONCURRENCY = 12;
const MAX_HTML_BYTES = 200 * 1024;

export function assertArchiveHttp(options) {
  const { slug, base, status, contentType, bytes, canonical, xRobots, metaRobots } = options;
  const expected = base + '/' + slug + '/';
  assert.ok(base === PRODUCTION || base === STAGING,'only declared public sites');
  assert.match(slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/u,'canonical public archive slug');
  assert.equal(status,200,'historical article must be publicly readable');
  assert.ok(contentType?.includes('text/html'),'HTML response required');
  assert.ok(bytes>100 && bytes<=MAX_HTML_BYTES,'HTML size is bounded');
  assert.equal(canonical,expected,'published canonical must preserve original slug and environment');
  if(base===STAGING) {
    assert.match(xRobots??'',/noindex/u,'stage must never be indexed');
    assert.match(metaRobots??'',/noindex/u,'stage meta robots must be noindex');
  } else {
    assert.ok(!(xRobots??'').includes('noindex'),'production must remain indexable');
    assert.ok(!(metaRobots??'').includes('noindex'),'production meta must remain indexable');
  }
}

export async function readBoundedHtml(response) {
  const reader=response.body?.getReader();
  if(!reader)throw new Error('html_body_missing');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let html='',bytes=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_HTML_BYTES){
        await reader.cancel().catch(()=>undefined);
        throw new Error('html_over_limit');
      }
      html+=decoder.decode(value,{stream:true});
    }
    html+=decoder.decode();
  }catch(e){
    await reader.cancel().catch(()=>undefined);
    throw e;
  }
  return {html,bytes};
}

async function verifyOne(base,slug) {
  const url=base+'/'+slug+'/';
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  // Safety: do not consume an unexpectedly unbounded HTML body.
  const declared=response.headers.get('content-length');
  if(declared!==null && (Number(declared)>MAX_HTML_BYTES || !/^\d+$/u.test(declared))){
    throw new Error('html_over_limit');
  }
  const { html, bytes }=await readBoundedHtml(response);
  const canonical=html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/iu)?.[1]??null;
  const metaRobots=html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["'][^>]*>/iu)?.[1]??null;
  assertArchiveHttp({
    slug,base,status:response.status,
    contentType:response.headers.get('content-type'),
    bytes,canonical,
    xRobots:response.headers.get('x-robots-tag'),metaRobots,
  });
}

export async function probeAll() {
  const slugs=canonicalLegacySlugs();
  assert.equal(slugs.length,EXPECTED);
  let next=0;
  const totals={production:0,staging:0};
  const failures=[];
  const pairs=slugs.flatMap(slug=>[[PRODUCTION,slug],[STAGING,slug]]);
  async function worker(){
    while(next<pairs.length){
      const [base,slug]=pairs[next++];
      const label=base===PRODUCTION?'production':'staging';
      try{
        await verifyOne(base,slug);
        totals[label]++;
      }catch(e){
        failures.push({
          environment:label,slug,
          check:e instanceof Error?e.message.slice(0,100):'unknown_failure',
        });
      }
    }
  }
  await Promise.all(Array.from({length:CONCURRENCY},()=>worker()));
  if(failures.length>0){
    console.error(JSON.stringify({pass:totals,errors:failures.length,firstFailures:failures.slice(0,8)}));
    throw new Error('historical_url_http_gate_failed');
  }
  return totals;
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.length!==2){
    console.error('Usage: npm run preflight:live-permalinks (no overrides permitted)');
    process.exitCode=1;
  }else{
    probeAll().then(result=>{
      console.log('Historical public HTTP gates: '+JSON.stringify(result)+', expected 580/580 each');
    }).catch(error=>{
      console.error(error instanceof Error?error.message:'probe_failed');
      process.exitCode=1;
    });
  }
}
