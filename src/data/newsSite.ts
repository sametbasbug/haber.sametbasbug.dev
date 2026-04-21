const MAIN_SITE_URL = (import.meta.env.PUBLIC_MAIN_SITE_URL || 'https://sametbasbug.dev').replace(/\/+$/, '');
const NEWS_SITE_URL = (import.meta.env.PUBLIC_NEWS_SITE_URL || 'https://haber.sametbasbug.dev').replace(/\/+$/, '');
const NEWS_SUBDOMAIN_ENABLED = String(import.meta.env.PUBLIC_NEWS_SUBDOMAIN_ENABLED || 'true') === 'true';

export function isNewsSubdomainEnabled() {
  return NEWS_SUBDOMAIN_ENABLED;
}

export function getMainSiteUrl() {
  return MAIN_SITE_URL;
}

export function getNewsSiteUrl() {
  return NEWS_SITE_URL;
}

export function getNewsHomePath() {
  return '/';
}

export function getNewsHomeHref() {
  return '/';
}

export function getNewsArticleHref(slug: string) {
  return `/${slug}/`;
}

export function getNewsPageHref(pageNumber: number) {
  return pageNumber <= 1 ? '/' : `/sayfa/${pageNumber}/`;
}

export function getNewsPanelHref(pageNumber: number = 1) {
  return pageNumber <= 1 ? '/icerik-paneli/' : `/icerik-paneli/sayfa/${pageNumber}/`;
}

export function getNewsCanonicalUrl(pathname: string) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return NEWS_SUBDOMAIN_ENABLED ? new URL(cleanPath, `${NEWS_SITE_URL}/`).toString() : undefined;
}
