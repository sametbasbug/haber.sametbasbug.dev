import { getCollection, type CollectionEntry } from 'astro:content';
import { getNewsHomeHref, getNewsPageHref as getNewsSitePageHref } from './newsSite';

export const ANLIK_HABER_PAGE_SIZE = 20;
export const NEWS_CATEGORIES = ['Siyaset', 'Ekonomi', 'Türkiye', 'Dünya', 'Teknoloji'] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export type AnlikHaberEntry = CollectionEntry<'anlikHaber'>;

export async function getPublishedAnlikHaber() {
	return (await getCollection('anlikHaber'))
		.filter((entry) => !entry.data.isDraft)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function getAnlikHaberCategories() {
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
	return getNewsSitePageHref(pageNumber);
}
