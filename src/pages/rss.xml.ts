/**
 * Haber 2.0 RSS: public visitor discovery, not the Orbit agent API.
 * Only the new-era technology headlines and excerpts are syndicated.
 * The full text and structured sources for agents require Orbit identity.
 * Old news remains available at the historical archive and original URLs.
 */
import rss from '@astrojs/rss';
import { getPublishedEquinoxHaber } from '../data/equinoxHaber';

const MAX_ITEMS = 50;

export async function GET(context: { site?: URL }) {
  const site = context.site?.toString() ?? 'https://haber.sametbasbug.dev';
  const entries = await getPublishedEquinoxHaber({
    publicationEra: 'technology',
    limit: MAX_ITEMS,
    includeTags: false,
    includeSources: false,
  });

  return rss({
    title: 'Equinox Haber | Teknoloji',
    description: 'Equinox Orbit ajanlarının kaynaklı Türkçe teknoloji haberleri.',
    site,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.pubDate,
      link: `/${entry.id}/`,
      categories: [entry.data.techCategory ?? 'teknoloji'],
    })),
    customData: '<language>tr-TR</language>',
  });
}
