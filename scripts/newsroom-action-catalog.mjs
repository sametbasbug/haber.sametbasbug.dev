/**
 * Strict, read-only Haber 2.0 action-catalog acceptance.
 *
 * A Worker that builds but still serves the old two-step brief contract
 * cannot be treated as a successfully deployed technology newsroom.
 * Intentionally no credentials, API mutations or D1 access here.
 */
import { pathToFileURL } from 'node:url';

export const EXPECTED_OPERATIONS = Object.freeze([
  'haber.yayinla',
  'haber.haberleriOku',
  'haber.haberOku',
  'haber.duzenle',
  'haber.yayindanKaldir',
  'haber.yayinaAlGeri',
]);
export const EXPECTED_CATEGORIES = Object.freeze([
  'yapay-zeka','yazilim','donanim','siber-guvenlik','dijital-dunya','teknoloji-sektoru',
]);

export function validateNewsroomCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)
    || catalog.version !== 1 || !Array.isArray(catalog.operations)) {
    throw new Error('Orbit bağlı-site katalog biçimi sürüm 1 olmalı');
  }
  const ids = catalog.operations.map(op => op?.operationId);
  if (ids.length !== EXPECTED_OPERATIONS.length
    || new Set(ids).size !== EXPECTED_OPERATIONS.length
    || ids.slice().sort().join('|') !== EXPECTED_OPERATIONS.slice().sort().join('|')) {
    throw new Error('Haber 2.0 kataloğu tam olarak altı kanonik işlem taşımalı');
  }
  for (const operation of catalog.operations) {
    if (operation.idempotent !== true || !operation.input
      || operation.input.type !== 'object'
      || operation.input.additionalProperties !== false) {
      throw new Error(operation.operationId + ': çağrı şeması kapalı ve tekrar güvenli olmalı');
    }
  }
  const publish = catalog.operations.find(op => op.operationId === 'haber.yayinla');
  const mandatory = ['metin','kategori','kaynaklar'];
  if (publish.input.required?.join('|') !== mandatory.join('|')
    || Object.keys(publish.input.properties ?? {}).sort().join('|') !== mandatory.slice().sort().join('|')) {
    throw new Error('Yayın girdisi yalnız metin, kategori ve kaynaklar olmalı');
  }
  const categories = publish.input.properties.kategori.enum;
  if (!Array.isArray(categories)
    || categories.length !== EXPECTED_CATEGORIES.length
    || categories.slice().sort().join('|') !== EXPECTED_CATEGORIES.slice().sort().join('|')
    || publish.input.properties.kaynaklar.type !== 'array') {
    throw new Error('Yalnız doğru altı teknoloji kategorisi ve kaynak listesi sunulmalı');
  }
  return { operations: ids.length, publisherFields: mandatory.length };
}

export async function checkNewsroomCatalog(origin, fetchImpl = fetch) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1' && base.hostname !== 'localhost') {
    throw new Error('Yalnız HTTPS site ve izole localhost kabul edilir');
  }
  const url = new URL('/orbit-actions.json',base);
  // A per-run query key prevents an obsolete edge cache from hiding the new
  // contract during a coordinated rollout.
  url.searchParams.set('deploy-check', String(Date.now()));
  const response = await fetchImpl(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (response.status !== 200
    || !(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error('Haber katalogu HTTPS 200 application/json dönmeli');
  }
  const body = await response.text();
  if (body.length > 90000) throw new Error('Haber katalogu beklenenden büyük');
  return validateNewsroomCatalog(JSON.parse(body));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const address = process.argv[2] ?? 'https://haber.sametbasbug.dev';
  try {
    const result = await checkNewsroomCatalog(address);
    console.log('Haber 2.0 canlı katalog OK:', result.operations, 'işlem ve', result.publisherFields, 'yayın alanı');
  } catch (error) {
    console.error('Haber 2.0 katalog uyuşmazlığı:', error.message);
    process.exitCode = 1;
  }
}
