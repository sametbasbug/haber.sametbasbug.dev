/**
 * Exact historical URL preservation gate for Haber 2.0.
 *
 * The existing D1 row-count gate can pass if one historical URL disappears
 * and another article replaces it. This generates a single READ-ONLY SQL
 * SELECT using the 580 PUBLIC source-controlled Markdown slugs, returning
 * aggregate counts only. No article rows or private identifiers are read.
 *
 * Usage:
 *   node scripts/technology-legacy-permalinks.mjs --sql=historical > /tmp/pre.sql
 *   node scripts/technology-legacy-permalinks.mjs --sql=technology > /tmp/post.sql
 *   node scripts/technology-legacy-permalinks.mjs --check < wrangler-result.json
 */
import {readdirSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const EXPECTED_ARCHIVE_COUNT=580;
const SLUG_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function canonicalLegacySlugs() {
  const files=readdirSync(new URL('../src/content/equinoxHaber/',import.meta.url))
    .filter(name=>name.endsWith('.md')
      && !/^techCategory:/mu.test(readFileSync(
        new URL('../src/content/equinoxHaber/'+name,import.meta.url),'utf8'
      )));
  const slugs=files.map(file=>file.slice(0,-3)).sort();
  if(slugs.length!==EXPECTED_ARCHIVE_COUNT
    || slugs.some(slug=>!SLUG_RE.test(slug))
    || new Set(slugs).size!==EXPECTED_ARCHIVE_COUNT){
    throw new Error('The canonical 580-slug historical manifest changed');
  }
  return slugs;
}

export function buildLegacyPermalinkQuery(slugs, era) {
  if(era!=='historical' && era!=='technology'){
    throw new Error('Unknown D1 schema era');
  }
  if(!Array.isArray(slugs) || slugs.length!==EXPECTED_ARCHIVE_COUNT
    || slugs.some(slug=>typeof slug!=='string' || !SLUG_RE.test(slug))
    || new Set(slugs).size!==EXPECTED_ARCHIVE_COUNT){
    throw new Error('Invalid canonical permalink manifest');
  }

  // Values are limited to the verified public ASCII slugs above. No string
  // originating in an API request, DB row or user-submitted field is used.
  const values=slugs.map(slug=>"('"+slug+"')").join(',\n  ');
  const eraCheck=era==='technology' ? " AND a.publication_era='legacy'" : '';
  return `-- Generated from the 580 tracked public Markdown slugs.
-- Read-only, aggregate-only release acceptance; never outputs article data.
WITH canonical(slug) AS (
  VALUES ${values}
)
SELECT
  (SELECT COUNT(*) FROM canonical) AS expected_permalinks,
  (
    SELECT COUNT(*) FROM canonical AS c
    JOIN articles AS a ON a.slug=c.slug
    WHERE a.is_draft=0${eraCheck}
  ) AS published_permalinks,
  (
    SELECT COUNT(*) FROM canonical AS c
    JOIN articles AS a ON a.slug=c.slug
    WHERE a.is_draft=0${eraCheck}
      AND EXISTS (
        SELECT 1 FROM article_sources AS src WHERE src.slug=c.slug
      )
  ) AS sourced_permalinks;
`;
}

export function verifyLegacyPermalinkCounts(value){
  const entries=Array.isArray(value)?value:[value];
  if(entries.length!==1 || entries[0]?.success!==true
    || !Array.isArray(entries[0]?.results)
    || entries[0].results.length!==1){
    throw new Error('D1 canonical URL count query failed');
  }
  const counts=entries[0].results[0];
  if(!counts || typeof counts!=='object'){
    throw new Error('D1 canonical URL count result is invalid');
  }
  for(const name of ['expected_permalinks','published_permalinks','sourced_permalinks']){
    if(counts[name]!==EXPECTED_ARCHIVE_COUNT){
      throw new Error('D1 canonical historical URL safety gate failed: '+name);
    }
  }
  return {matched:EXPECTED_ARCHIVE_COUNT};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const mode=process.argv[2];
    if(process.argv.length!==3 || !['--sql=historical','--sql=technology','--check'].includes(mode)){
      throw new Error('Unknown verification mode');
    }
    if(mode==='--check'){
      let body='';
      for await(const part of process.stdin){
        body+=part;
        if(body.length>16000)throw new Error('Unexpectedly large D1 aggregate response');
      }
      const result=verifyLegacyPermalinkCounts(JSON.parse(body));
      console.log('Haber canonical archive READY: '+result.matched+' published sourced permalinks');
    }else{
      process.stdout.write(buildLegacyPermalinkQuery(
        canonicalLegacySlugs(),mode.slice('--sql='.length),
      ));
    }
  }catch(error){
    // Never print SQL/JSON response bodies or database rows on failure.
    console.error('Haber canonical archive BLOCKED:',error instanceof Error?error.message:'unknown');
    process.exitCode=1;
  }
}
