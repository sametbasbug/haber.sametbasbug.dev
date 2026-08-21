/* `sitemap-index.xml`.
 *
 * `@astrojs/sitemap` bu dosyayı derleme anında üretiyor ve sunucu modunda hiç
 * üretmiyor — `robots.txt` ona işaret ettiği için geçişte 404 olurdu ve bu
 * SEO tarafında sessiz bir kayıp demekti.
 *
 * Biçim statik çıktının aynısı; `worker/tools/parity-page.mjs` iki sürümü
 * karşılaştırıyor.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ site }) => {
	const base = (site ?? new URL('https://haber.sametbasbug.dev')).toString().replace(/\/$/, '');
	const body =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
		`<sitemap><loc>${base}/sitemap-0.xml</loc></sitemap>` +
		'</sitemapindex>';

	return new Response(body, { headers: { 'content-type': 'application/xml' } });
};
