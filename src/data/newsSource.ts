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

export async function getPublished(): Promise<any[]> {
	return (await getCollection('equinoxHaber'))
		.filter((entry) => !entry.data.isDraft)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Gövdeyi render eden Astro bileşeni. D1 tarafında karşılığı yok: orada
 *  HTML yazma anında üretilip saklanıyor. */
export async function renderEntry(entry: any) {
	return (await render(entry)).Content;
}

/** RSS gövdeleri. Koleksiyon girdileri gövdeyi zaten taşıyor. */
export async function getPublishedWithBody(limit: number): Promise<any[]> {
	return (await getPublished()).slice(0, limit);
}

/** Haber sayfasının gövdesi. Statik modda gövde girdinin içinde geliyor ve
 *  render `renderEntry` ile yapılıyor, o yüzden burada iş yok. */
export async function getArticleBody(_slug: string): Promise<null> {
	return null;
}
