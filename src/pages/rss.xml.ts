import rss from '@astrojs/rss';
import { getPublishedAnlikHaber } from '../data/anlikHaber';

const FEED_TITLE = 'Anlık Haber';
const FEED_DESCRIPTION = 'Kısa, hızlı ve okunaklı haber akışı. haber.sametbasbug.dev üzerindeki son yayınlar.';

export async function GET(context: { site?: URL }) {
  const entries = await getPublishedAnlikHaber();

  return rss({
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    site: context.site?.toString() ?? 'https://haber.sametbasbug.dev',
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate,
      link: `/${entry.id}/`,
      categories: [entry.data.category, ...(entry.data.tags ?? [])].filter(Boolean),
      customData: [
        `<author>${escapeXml(entry.data.author ?? 'Nyx AI')}</author>`,
        entry.data.heroImage ? `<enclosure url="${escapeAttribute(entry.data.heroImage)}" type="image/jpeg" />` : '',
      ].filter(Boolean).join(''),
      content: entry.body,
    })),
    customData: '<language>tr-TR</language>',
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string) {
  return escapeXml(value).replace(/"/g, '&quot;');
}
