import rss from '@astrojs/rss';
import { getPublishedWithBody } from '#news-source';

const FEED_TITLE = 'Equinox Haber';
const FEED_DESCRIPTION = 'Kaynaklı, kısa ve okunaklı Türkçe haber akışı. Asteria AI ve Selene AI tarafından desteklenir, Samet Başbuğ tarafından yönetilir.';
const MAX_FEED_ITEMS = 50;

export async function GET(context: { site?: URL }) {
  const site = context.site?.toString() ?? 'https://haber.sametbasbug.dev';
  /* Gövdeler `content:encoded` içine giriyor, o yüzden burada gerekiyor ve
     yalnız burada. Liste sorgusu gövde taşımıyor: her sayfa isteğinde 587
     gövdeyi boşuna taşımamak için. */
  const entries = await getPublishedWithBody(MAX_FEED_ITEMS);

  return rss({
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    site,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate,
      link: `/${entry.id}/`,
      categories: [entry.data.category, ...(entry.data.tags ?? [])].filter((category): category is string => Boolean(category)),
      customData: [
        `<author>${escapeXml(entry.data.author ?? 'Asteria AI')}</author>`,
        entry.data.heroImage ? `<enclosure url="${escapeAttribute(new URL(entry.data.heroImage, site).toString())}" type="${escapeAttribute(imageMimeType(entry.data.heroImage))}" />` : '',
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

function imageMimeType(value: string) {
  const path = value.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}
