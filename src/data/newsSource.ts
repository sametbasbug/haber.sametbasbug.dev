/* Haber kaynağı — STATİK derleme sürümü (içerik koleksiyonu).
 *
 * SSR derlemesinde `newsSource.workers.ts` ile değiştiriliyor
 * (`astro.config.ssr.mjs`, `#news-source` takma adı).
 *
 * Ayrımın DERLEME ZAMANINDA olması şart, çalışma anında bir `if` yetmez:
 * `astro:content` içeri alındığı anda Astro 587 haberin tamamını veri
 * katmanı olarak paketliyor (ölçüldü: 3.3 MB tek parça). Worker'ın ücretsiz
 * plan sınırı 3 MB; çalışma anında hiç kullanılmayan bir veri yüzünden
 * dağıtım düşüyordu.
 */
import { getCollection, render, type CollectionEntry } from 'astro:content';

export type NewsEntry = CollectionEntry<'equinoxHaber'>;

export interface PublishedOptions {
	limit?: number;
	offset?: number;
	category?: string;
	since?: Date | string;
	includeTags?: boolean;
	includeSources?: boolean;
}

export async function getPublished(options: PublishedOptions = {}): Promise<any[]> {
	let entries = (await getCollection('equinoxHaber'))
		.filter((entry) => !entry.data.isDraft)
		.sort((a, b) => {
			const dateOrder = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
			return dateOrder || a.id.localeCompare(b.id);
		});

	if (options.category) {
		entries = entries.filter((entry) => entry.data.category === options.category);
	}
	if (options.since) {
		const since = options.since instanceof Date ? options.since : new Date(options.since);
		entries = entries.filter((entry) => entry.data.pubDate.valueOf() >= since.valueOf());
	}

	const offset = Math.max(0, Math.trunc(options.offset ?? 0));
	const limit = options.limit && options.limit > 0 ? Math.trunc(options.limit) : undefined;
	return limit === undefined ? entries.slice(offset) : entries.slice(offset, offset + limit);
}

export async function getPublishedCount(): Promise<number> {
	return (await getPublished()).length;
}

/** Statik derlemede D1 maliyeti yok; aynı sayfa verisini koleksiyon üzerinden
 * kurup sunucu sürümüyle aynı şekli döndürür. */
export async function getArticlePage(slug: string) {
	const entries = await getPublished();
	const currentIndex = entries.findIndex((entry) => entry.id === slug);
	if (currentIndex < 0) return null;

	const entry = entries[currentIndex]!;
	const currentTags = new Set(entry.data.tags ?? []);
	const relatedEntries = entries
		.filter((item) => item.id !== entry.id)
		.map((item, index) => {
			const sharedTags = (item.data.tags ?? []).filter((tag: string) => currentTags.has(tag)).length;
			const sameCategory = item.data.category === entry.data.category;
			return {
				entry: item,
				score: (sameCategory ? 6 : 0) + sharedTags * 3 - index * 0.001,
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 3)
		.map((item) => item.entry);

	return {
		entry,
		body: entry.body ?? '',
		bodyHtml: null,
		nextEntry: entries[currentIndex - 1],
		prevEntry: entries[currentIndex + 1],
		relatedEntries,
	};
}

/** Gövdeyi render eden Astro bileşeni. D1 tarafında karşılığı yok: orada
 *  HTML yazma anında üretilip saklanıyor. */
export async function renderEntry(entry: any) {
	return (await render(entry)).Content;
}

/** RSS gövdeleri. Koleksiyon girdileri gövdeyi zaten taşıyor. */
export async function getPublishedWithBody(limit: number): Promise<any[]> {
	return getPublished({ limit });
}

/** Haber sayfasının gövdesi. Statik modda gövde girdinin içinde geliyor ve
 *  render `renderEntry` ile yapılıyor, o yüzden burada iş yok. */
export async function getArticleBody(_slug: string): Promise<null> {
	return null;
}
