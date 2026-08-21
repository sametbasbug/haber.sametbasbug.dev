import type { MiddlewareHandler } from 'astro';

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

	const cached = await cache.match(context.request);
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

	await cache.put(context.request, cacheable.clone());
	return cacheable;
};
