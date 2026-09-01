/* Haber kaynağı — SSR (Cloudflare Workers) sürümü (D1).
 *
 * `astro:content` BİLEREK içeri alınmıyor; gerekçesi `newsSource.ts` içinde.
 */
import {
	getArticleFromD1,
	getArticlePageFromD1,
	getPublishedCountFromD1,
	getPublishedFromD1,
	type PublishedD1Options,
} from './equinoxHaberD1';
import { getDatabase } from '#runtime-env';

export async function getPublished(options: PublishedD1Options = {}): Promise<any[]> {
	const db = getDatabase();
	if (!db) throw new Error('D1 binding yok: sunucu modunda haber kaynağı okunamıyor.');
	return getPublishedFromD1(db, options);
}

export async function getPublishedCount(): Promise<number> {
	const db = getDatabase();
	if (!db) throw new Error('D1 binding yok.');
	return getPublishedCountFromD1(db);
}

export async function getArticlePage(slug: string) {
	const db = getDatabase();
	if (!db) throw new Error('D1 binding yok.');
	return getArticlePageFromD1(db, slug);
}

/** Sunucu modunda gövde markdown'dan render EDİLMEZ: `body_html` yazma anında
 *  üretilmiş ve D1'de saklanmıştır (`worker/src/render.ts`). */
export async function renderEntry(): Promise<null> {
	return null;
}

/** RSS gövdeleri. Liste sorgusu gövdeleri taşımıyor; RSS'in ihtiyacı olan
 *  sınırlı sayıda haber için ayrıca isteniyor. */
export async function getPublishedWithBody(limit: number): Promise<any[]> {
	const db = getDatabase();
	if (!db) throw new Error('D1 binding yok.');
	return getPublishedFromD1(db, { withBody: true, limit, includeTags: true, includeSources: false });
}

/** Gösterilen haberin gövdesi. Liste sorgusunda gövde yok; yalnız bu tek
 *  haber için okunuyor. */
export async function getArticleBody(slug: string) {
	const db = getDatabase();
	if (!db) throw new Error('D1 binding yok.');
	return getArticleFromD1(db, slug);
}
