/** Determine an article smoke-check URL without publishing synthetic content.
 * Empty technology RSS is valid on launch; fall back to an archived article.
 * Reject external and non-article destinations. */
import { pathToFileURL } from 'node:url';
const SITE = 'https://haber.sametbasbug.dev';
const ARTICLE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/u;

export function firstArticleUrl(body, kind) {
  const match = kind === 'rss'
    ? body.match(/<item\b[^>]*>[\s\S]*?<link>([^<]+)<\/link>/iu)
    : kind === 'archive'
      ? body.match(/<article\b[^>]*>[\s\S]*?<h2\b[^>]*>\s*<a\b[^>]*href="([^"]+)"/iu)
      : null;
  if (!match) return '';
  try {
    const url = new URL(match[1].replaceAll('&amp;', '&'), SITE);
    return url.origin === SITE && !url.search && !url.hash && ARTICLE.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kind = process.argv[2];
  if (kind !== 'rss' && kind !== 'archive') process.exit(2);
  let body='';
  for await(const chunk of process.stdin) {
    body+=chunk;
    if(body.length>2_000_000) process.exit(3);
  }
  process.stdout.write(firstArticleUrl(body,kind));
}
