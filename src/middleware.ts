import type { MiddlewareHandler } from 'astro';
import { getDatabase } from '#runtime-env';
import { oturumCereziVarMi } from './server/session';

/* Kenar önbelleği.
 *
 * İlk D1 sürümü her sayfa isteğinde bütün haber üstbilgilerini, etiketleri ve
 * kaynakları okuyordu; tek istek binlerce satıra çıkıyordu. Haber/listeler artık
 * hedefli ve sayfalı sorgular kullanıyor: tekil haberde yalnız mevcut kayıt,
 * ilişkileri, komşuları ve ilgili adaylar; arşivde yalnız istenen sayfa okunuyor.
 * Kenar önbelleği bu düşük temel maliyeti de tekrar trafikte sıfıra yaklaştırmak
 * ve D1 geçici olarak cevap veremezse son iyi sayfayı sunabilmek için korunuyor.
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
 * Önbellek anahtarını üretmek için istek başına yalnız `site_state` sürüm satırı
 * okunuyor. Önbellek isabetinde sayfanın diğer D1 sorguları hiç çalışmıyor.
 *
 * Statik derlemede `caches` yok; ara katman hiçbir şey yapmadan geçiyor.
 */

/* Birleştirilen tekrar haberler.
 *
 * Arşivde sekiz haber iki kez yayımlanmıştı: aynı kaynak adresi, aynı olay,
 * iki ayrı slug. İkinci kopyalar 22-23 Nisan'da eklenmiş, daha kısa ve
 * görselleri başka haberlerle tekrar ediyordu; her çiftte erken tarihli ve
 * özgün görselli olan tutuldu.
 *
 * Kaldırılan adresler 404 DÖNMÜYOR, kalıcı olarak eşine yönlendiriliyor:
 * bu adresler bir süre yayında kaldı, arama motorlarında ve paylaşımlarda
 * karşılıkları olabilir. Yönlendirme önbellekten önce çalışıyor.
 */
const BIRLESTIRILEN: Record<string, string> = {
	'adobe-firefly-yapay-zeka-asistani-creative-cloud-uygulamalarinda-calisacak':
		'adobe-firefly-ai-assistant-kreatif-cloud-uygulamalarinda-gorev-tamamlayabiliyor',
	'airwallex-is-about-to-take-on-stripe-and-the-rest-of-the-payments-industry-in-the-physical-world':
		'airwallex-stripea-karsi-magaza-ici-odemelere-giriyor',
	'openai-updates-its-agents-sdk-to-help-enterprises-build-safer-more-capable-agents':
		'openai-ajanlar-icin-sdk-sini-guncelleyerek-kurumsal-kullanimi-guclendiriyor',
	'sweden-blames-russian-hackers-for-attempting-destructive-cyberattack-on-thermal-plant':
		'isvec-bir-isi-santraline-donuk-siber-saldiri-girisiminden-rusya-baglantili-hackerlari-sorumlu-tuttu',
	'qualcomm-up-7-on-report-it-s-partnering-with-openai-on-smartphone-ai-chip':
		'qualcomm-jumps-12-on-report-it-s-partnering-with-openai-on-smartphone-ai-chip',
	'agriculture-department-plans-to-use-grok-despite-growing-concerns-over-the-chatbot-exclusive':
		'abd-tarim-bakanligi-groku-kullanmaya-hazirlaniyor',
	"pentagon-says-ukraine-support-can-t-rely-on-american-contributions":
		'pentagon-ukrayna-yardiminda-avrupaya-daha-fazla-yuk-dusmesini-istiyor',
	'google-launches-a-gemini-ai-app-on-mac':
		'google-mac-icin-gemini-uygulamasini-kullanima-acti',
};

/* Giriş akışının adresleri. Önbelleğe hiç girmiyorlar. */
const GIRIS_YOLLARI = ['/giris/', '/cikis'];

const TTL_SECONDS = 60;
const STALE_SECONDS = 300;

export const onRequest: MiddlewareHandler = async (context, next) => {
	/* Yönlendirme önbellekten önce: kaldırılan adresin eski bir kopyası
	   önbellekte kalmış olsa bile eşine gitmeli. */
	const yolAdi = new URL(context.request.url).pathname;
	const yol = yolAdi.replace(/^\/+|\/+$/g, '');
	const hedef = BIRLESTIRILEN[yol];
	if (hedef) return context.redirect(`/${hedef}/`, 301);

	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;

	/* Yalnız GET önbelleklenir. POST /api/publish önbelleğe girerse yayın
	   isteği ikinci kez gönderildiğinde gerçekte hiç çalışmadan "başarılı"
	   cevabı dönerdi. */
	if (!cache || context.request.method !== 'GET') return next();

	/* GİRİŞ YAPMIŞ İSTEK ÖNBELLEĞE HİÇ UĞRAMAZ.
	 *
	 * Önbellek anahtarı adres + içerik sürümünden ibaret; çereze göre
	 * DEĞİŞMİYOR. Kişiye özel bir cevap bir kez oraya girse, aynı adresi
	 * isteyen herkese o cevap dönerdi — bir kullanıcının adı başkasının
	 * ekranında görünürdü.
	 *
	 * "Kişisel sayfaları listeleyip onları atla" diye çözmedim: liste eksik
	 * kaldığı gün sızıntı sessizce başlar. Kural tersine kuruluyor — oturum
	 * çerezi taşıyan HER istek önbelleği baştan sona atlıyor ve cevabı
	 * hiçbir paylaşımlı önbelleğe koydurmuyor.
	 *
	 * Bedeli: giriş yapmış kullanıcı her sayfada D1'e gidiyor. Kabul
	 * edilebilir — giriş yapmış kullanıcı azdır ve doğru cevap ucuz cevaptan
	 * önce gelir. */
	if (oturumCereziVarMi(context.request)) {
		const kisisel = await next();
		kisisel.headers.set('cache-control', 'private, no-store');
		return kisisel;
	}

	/* Giriş akışının adresleri: çerez henüz yokken de önbelleğe girmemeliler.
	   `/giris/orbit/donus` tek kullanımlık bir kod taşıyor. */
	if (GIRIS_YOLLARI.some((yol) => yolAdi.startsWith(yol))) {
		const akis = await next();
		akis.headers.set('cache-control', 'private, no-store');
		return akis;
	}

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
