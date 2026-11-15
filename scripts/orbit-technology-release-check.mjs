/**
 * Coordinated Haber/Orbit release acceptance without any credentials.
 *
 * Orbit must expose two *agent-authenticated* technology-news operations
 * before Haber 2.0 is considered ready. This probes only public GETs, never
 * connects a site, publishes test content, or calls the private D1 database.
 */
import { pathToFileURL } from 'node:url';

const ORBIT_ORIGIN='https://orbit.sametbasbug.dev';

export function validateOrbitTechnologyContract(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)
    || typeof doc.openapi !== 'string'
    || !doc.paths || typeof doc.paths !== 'object') {
    throw new Error('Orbit OpenAPI contract missing or malformed');
  }
  const expected=[
    ['/me/technology-news','listTechnologyNews'],
    ['/me/technology-news/{slug}','getTechnologyNewsArticle'],
  ];
  for(const [path,operationId] of expected) {
    const operation=doc.paths[path]?.get;
    if(!operation || operation.operationId !== operationId
      || !Array.isArray(operation.security)
      || !operation.security.some((item)=>Array.isArray(item?.agentCredential))) {
      throw new Error('Orbit technology news must require an agent credential at '+path);
    }
  }
  const parameters=doc.paths['/me/technology-news']?.get?.parameters;
  const category=parameters?.find?.((param)=>param.name==='kategori')?.schema?.enum;
  if(!Array.isArray(category) || category.slice().sort().join('|') !== [
    'yapay-zeka','yazilim','donanim','siber-guvenlik',
    'dijital-dunya','teknoloji-sektoru',
  ].sort().join('|')) {
    throw new Error('Orbit category filter must match the six Haber categories');
  }
  return { operations:2, credentialRequired:true, categories:category.length };
}

export async function verifyOrbitNewsRelease(fetchImpl=fetch) {
  const base=new URL(ORBIT_ORIGIN);
  const openapi=new URL('/v1/openapi.json',base);
  openapi.searchParams.set('release-check',String(Date.now()));
  const res=await fetchImpl(openapi,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{ accept:'application/json','cache-control':'no-cache' },
  });
  if(res.status!==200 || !(res.headers.get('content-type')??'').includes('application/json')) {
    throw new Error('Orbit OpenAPI GET must return JSON 200 without redirects');
  }
  if(Number(res.headers.get('content-length')??0)>1024*1024) {
    throw new Error('Orbit OpenAPI response exceeded expected size');
  }
  const contract=validateOrbitTechnologyContract(await res.json());
  // No Authorization header is intentionally supplied. It must be impossible
  // to read even a zero-item agent feed without registering on Orbit.
  const anonymous=await fetchImpl(new URL('/v1/me/technology-news?limit=1',base),{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{ accept:'application/json','cache-control':'no-cache' },
  });
  if(anonymous.status!==401) {
    throw new Error('Orbit technology-news endpoint did not reject anonymous access with 401');
  }
  await anonymous.body?.cancel().catch(()=>undefined);
  return contract;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const result=await verifyOrbitNewsRelease();
    console.log('Orbit technology news release contract READY:',result.operations+
      ' secured GET operations,',result.categories,'categories, anonymous HTTP 401');
  } catch(error) {
    console.error('Orbit technology news release contract BLOCKED:',error.message);
    process.exitCode=1;
  }
}
