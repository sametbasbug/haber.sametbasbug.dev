/* `sitemap-0.xml`.
 *
 * URL kümesi statik derlemenin ürettiğiyle aynı olmak zorunda: ana sayfa,
 * bilgi sayfaları, bütün arşiv sayfaları ve bütün haberler.
 *
 * Sıra da aynı olmak zorunda ve sıralama ALFABETİK DEĞİL: rakam dizileri
 * sayısal karşılaştırılıyor, yani `/sayfa/2/` `/sayfa/10/`'dan önce geliyor.
 * Bu varsayılmadı — önce alfabetik sıralandı, denklik testi düştü, kural
 * statik çıktının 654 adresinden geri okundu ve doğrulandı.
 */
import type { APIRoute } from 'astro';
import { EQUINOX_HABER_ARCHIVE_PAGE_SIZE } from '../../data/equinoxHaber';
import { getPublished } from '#news-source';

export const prerender = false;

/* Koleksiyondan gelmeyen, dosya olarak var olan sayfalar. Listenin elle
   tutulması gerekiyor çünkü sunucu modunda Astro'nun rota tablosu derleme
   anındaki gibi taranamıyor. `parity-page.mjs` eksik kalanı yakalar. */
const STATIC_PATHS = [
	'/',
	'/duzeltme-politikasi/',
	'/editorial-ilkeler/',
	'/gizlilik-politikasi/',
	'/hakkimizda/',
	'/iletisim/',
	'/yapay-zeka-ve-yayin-sureci/',
	'/yazarlar/',
];

export const GET: APIRoute = async ({ site }) => {
	const base = (site ?? new URL('https://haber.sametbasbug.dev')).toString().replace(/\/$/, '');
	const entries = await getPublished();

	const pageCount = Math.max(1, Math.ceil(entries.length / EQUINOX_HABER_ARCHIVE_PAGE_SIZE));
	const paths = [
		...STATIC_PATHS,
		...Array.from({ length: pageCount }, (_, i) => `/sayfa/${i + 1}/`),
		...entries.map((entry: { id: string }) => `/${entry.id}/`),
	];

	/** Rakam dizilerini sayı olarak karşılaştırır: "sayfa/2" < "sayfa/10". */
	const naturalKey = (value: string) =>
		value.split(/(\d+)/u).map((part) => (/^\d+$/u.test(part) ? part.padStart(12, '0') : part)).join('');

	const locs = [...new Set(paths)]
		.map((path) => `${base}${path}`)
		.sort((a, b) => (naturalKey(a) < naturalKey(b) ? -1 : naturalKey(a) > naturalKey(b) ? 1 : 0))
		.map((url) => `<url><loc>${url}</loc></url>`)
		.join('');

	const body =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
		'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" ' +
		'xmlns:xhtml="http://www.w3.org/1999/xhtml" ' +
		'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" ' +
		'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">' +
		locs +
		'</urlset>';

	return new Response(body, { headers: { 'content-type': 'application/xml' } });
};
