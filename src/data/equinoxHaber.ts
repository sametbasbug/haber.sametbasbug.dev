import type { CollectionEntry } from 'astro:content';
import { getNewsHomeHref, getNewsStreamPageHref } from './newsSite';
import { getPublished } from '#news-source';

/** Ana sayfanın öne çıkan panelini besleyen havuz. */
export const EQUINOX_HABER_PAGE_SIZE = 20;

/**
 * Arşiv sayfası ayrı bir boyut kullanır: arşivde okunan şey akış değil liste,
 * ve on başlık bir ekranda taranabiliyor. Ana sayfanın havuzuyla bağlanmaz —
 * o sayının değişmesi öne çıkan haber bileşimini de değiştirirdi.
 */
export const EQUINOX_HABER_ARCHIVE_PAGE_SIZE = 10;
export const NEWS_CATEGORIES = ['Siyaset', 'Ekonomi', 'Teknoloji', 'Bilim'] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export type EquinoxHaberEntry = CollectionEntry<'equinoxHaber'>;

/**
 * Yayımlanmış haberler, yeniden eskiye.
 *
 * Kaynak seçimi `#news-source` takma adıyla DERLEME ZAMANINDA yapılıyor:
 * sunucu modunda D1, statik modda içerik koleksiyonu. Çalışma anında bir `if`
 * yetmezdi — `astro:content` içeri alındığı anda 587 haberin tamamı Worker
 * paketine giriyor (3.3 MB) ve dağıtım boyut sınırından düşüyor.
 *
 * Çağıran hiçbir sayfa hangi kaynaktan okuduğunu bilmiyor ve bilmemeli. Ana
 * sayfa, arşiv, RSS ve haber site haritası hep buradan geçiyor; biri D1'den
 * diğeri koleksiyondan okusaydı yeni yayımlanan bir haber kendi adresinde
 * görünür ama listelerde görünmezdi.
 */
export async function getPublishedEquinoxHaber() {
	return getPublished();
}

export function getEquinoxHaberCategories() {
	return [...NEWS_CATEGORIES];
}

export function slugifyNewsCategory(category: string) {
	return category
		.toLocaleLowerCase('tr-TR')
		.replace(/ı/g, 'i')
		.replace(/ğ/g, 'g')
		.replace(/ü/g, 'u')
		.replace(/ş/g, 's')
		.replace(/ö/g, 'o')
		.replace(/ç/g, 'c')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function getNewsCategoryHref(category?: string) {
	const homeHref = getNewsHomeHref();
	if (!category || category === 'Tümü') return homeHref;
	const url = homeHref.startsWith('http') ? new URL(homeHref) : new URL(homeHref, 'https://sametbasbug.dev');
	url.searchParams.set('kategori', slugifyNewsCategory(category));
	if (!homeHref.startsWith('http')) return `${url.pathname}${url.search}`;
	return url.toString();
}

export function findNewsCategoryBySlug(categories: string[], slug?: string) {
	if (!slug) return undefined;
	return categories.find((category) => slugifyNewsCategory(category) === slug);
}

export function normalizeNewsCategory(category?: string) {
	if (!category) return undefined;
	return NEWS_CATEGORIES.find((item) => item === category);
}

export function getNewsCategoryToken(category?: string) {
	const normalized = normalizeNewsCategory(category);
	if (!normalized) return 'default';
	return slugifyNewsCategory(normalized);
}

export function formatNewsDate(date: Date) {
	return date.toLocaleString('tr-TR', {
		timeZone: 'Europe/Istanbul',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

export function getNewsPageHref(pageNumber: number) {
	return getNewsStreamPageHref(pageNumber);
}
