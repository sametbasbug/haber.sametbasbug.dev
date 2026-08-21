import type { MiddlewareHandler } from 'astro';
import { getDatabase } from '#runtime-env';

/* Kenar önbelleği.
 *
 * Neden gerekli, ölçümle: bir sayfa isteği D1'den **4225 satır** okuyor —
 * 587 haber üstbilgisi, 3041 etiket, 597 kaynak. Liste, ilgili haberler ve
 * önceki/sonraki hesabı bütün koleksiyonu istiyor. Ücretsiz planın günlük
 * sınırı 5 milyon satır okuma, yani önbelleksiz tavan ~1.180 sayfa
 * görüntüleme/gün. Bir haber sitesi için bu az.
 *
 * Süre 60 saniye. Bu bir tercih ve gerekçesi şu: sistemin varlık sebebi
 * yayının ve DÜZELTMENİN hızlı yansıması. Bir dakikalık bayatlık, statik
 * derlemede ödenen dakikalarca gecikmenin yanında önemsiz; ama sonsuz
 * önbellek düzeltme politikasını yalan haline getirirdi.
 *
 * `stale-while-revalidate` ile kenar, süresi dolmuş bir kopyayı arka planda
 * tazelerken sunmaya devam ediyor: D1 bir an cevap veremezse site kararmaz.
 *
 * Önbellek anahtarına içerik sürümü karışıyor (`site_state.content_version`).
 * Yayın ve düzeltme o sayıyı artırıyor, artan sayı bütün eski anahtarları
 * ulaşılamaz kılıyor — yani yeni haber liste sayfalarında ANINDA görünüyor,
 * önbellek süresinin dolmasını beklemiyor. Cache API'sinin `delete()`'i yalnız
 * isteğin düştüğü veri merkezini temizlediği için gerçek bir geçersizleştirme
 * aracı değil; sürüm anahtarı her yerde çalışıyor.
 *
 * Maliyet istek başına bir satır okuma. Önbellek isabetinde sayfa maliyeti
 * 4225 satırdan 1 satıra iniyor.
 *
 * Statik derlemede `caches` yok; ara katman hiçbir şey yapmadan geçiyor.
 */

const TTL_SECONDS = 60;
const STALE_SECONDS = 300;

export const onRequest: MiddlewareHandler = async (context, next) => {
	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;

	/* Yalnız GET önbelleklenir. POST /api/publish önbelleğe girerse yayın
	   isteği ikinci kez gönderildiğinde gerçekte hiç çalışmadan "başarılı"
	   cevabı dönerdi. */
	if (!cache || context.request.method !== 'GET') return next();

	const version = await contentVersion();
	const key = versionedKey(context.request, version);

	const cached = await cache.match(key);
	if (cached) return cached;

	const response = await next();

	/* Yalnız 200 önbelleklenir. 404 ve 500'ü tutmak, bir hatayı bir dakika
	   boyunca herkese servis etmek demek. */
	if (response.status !== 200) return response;

	const cacheable = new Response(response.body, response);
	cacheable.headers.set(
		'cache-control',
		`public, max-age=0, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
	);

	await cache.put(key, cacheable.clone());
	return cacheable;
};

/** İçerik sürümü. Okunamazsa önbellek atlanır: bayat içerik sunmaktansa
 *  her isteği taze üretmek yeğdir. */
async function contentVersion(): Promise<string> {
	const db = getDatabase();
	if (!db) return '0';
	const row = await db
		.prepare('SELECT content_version FROM site_state WHERE id = 1')
		.first<{ content_version: number }>();
	return row ? String(row.content_version) : '0';
}

/** Sürümü önbellek anahtarına katar.
 *
 * Sorgu parametresi olarak ekleniyor çünkü Cache API anahtarı bir `Request`
 * ve adres dışında ayırt edici bir alanı yok. Bu adres hiçbir zaman ağa
 * çıkmıyor; yalnız anahtar olarak kullanılıyor. */
function versionedKey(request: Request, version: string): Request {
	const url = new URL(request.url);
	url.searchParams.set('__v', version);
	return new Request(url.toString(), { method: 'GET', headers: request.headers });
}
