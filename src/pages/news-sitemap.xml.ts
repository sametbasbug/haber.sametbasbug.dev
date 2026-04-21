import { getPublishedAnlikHaber } from '../data/anlikHaber';

const PUBLICATION_NAME = 'Anlık Haber';
const PUBLICATION_LANGUAGE = 'tr';
const NEWS_WINDOW_MS = 1000 * 60 * 60 * 24 * 2;
const MAX_ITEMS = 1000;

export async function GET(context: { site?: URL }) {
  const site = context.site?.toString() ?? 'https://haber.sametbasbug.dev';
  const now = Date.now();
  const entries = (await getPublishedAnlikHaber())
    .filter((entry) => now - entry.data.pubDate.getTime() <= NEWS_WINDOW_MS)
    .slice(0, MAX_ITEMS);

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${entries
    .map((entry) => {
      const url = new URL(`/${entry.id}/`, site).toString();
      return `  <url>\n    <loc>${escapeXml(url)}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>${escapeXml(PUBLICATION_NAME)}</news:name>\n        <news:language>${PUBLICATION_LANGUAGE}</news:language>\n      </news:publication>\n      <news:publication_date>${entry.data.pubDate.toISOString()}</news:publication_date>\n      <news:title>${escapeXml(entry.data.title)}</news:title>\n    </news:news>\n  </url>`;
    })
    .join('\n')}\n</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
