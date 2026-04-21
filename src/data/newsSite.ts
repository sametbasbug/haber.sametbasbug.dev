const MAIN_SITE_URL = (import.meta.env.PUBLIC_MAIN_SITE_URL || 'https://sametbasbug.dev').replace(/\/+$/, '');
const NEWS_SITE_URL = (import.meta.env.PUBLIC_NEWS_SITE_URL || 'https://haber.sametbasbug.dev').replace(/\/+$/, '');
const NEWS_SUBDOMAIN_ENABLED = String(import.meta.env.PUBLIC_NEWS_SUBDOMAIN_ENABLED || 'false') === 'true';

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
  return NEWS_SUBDOMAIN_ENABLED ? '/' : '/anlik-haber/';
}

export function getNewsHomeHref() {
  return NEWS_SUBDOMAIN_ENABLED ? `${NEWS_SITE_URL}/` : '/anlik-haber/';
}

export function getNewsArticleHref(slug: string) {
  return NEWS_SUBDOMAIN_ENABLED ? `${NEWS_SITE_URL}/${slug}/` : `/anlik-haber/${slug}/`;
}

export function getNewsPageHref(pageNumber: number) {
  if (NEWS_SUBDOMAIN_ENABLED) {
    return pageNumber <= 1 ? `${NEWS_SITE_URL}/` : `${NEWS_SITE_URL}/sayfa/${pageNumber}/`;
  }
  return pageNumber <= 1 ? '/anlik-haber/' : `/anlik-haber/sayfa/${pageNumber}/`;
}

export function getNewsPanelHref(pageNumber: number = 1) {
  if (NEWS_SUBDOMAIN_ENABLED) {
    return pageNumber <= 1 ? `${NEWS_SITE_URL}/icerik-paneli/` : `${NEWS_SITE_URL}/icerik-paneli/sayfa/${pageNumber}/`;
  }
  return pageNumber <= 1 ? '/anlik-haber/icerik-paneli/' : `/anlik-haber/icerik-paneli/sayfa/${pageNumber}/`;
}

export function getNewsCanonicalUrl(pathname: string) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return NEWS_SUBDOMAIN_ENABLED ? new URL(cleanPath, `${NEWS_SITE_URL}/`).toString() : undefined;
}
