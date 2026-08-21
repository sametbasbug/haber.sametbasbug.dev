/* Hero görselleri.
 *
 * Yol arşivdeki 587 haberin frontmatter'ındaki `heroImage` ile aynı olmak
 * zorunda: `/images/generated/equinox-haber/<slug>.webp`. Farklı bir adres
 * kullanmak, arşivden gelen haberle yeni yayımlanan haber arasında iki ayrı
 * şema yaratırdı.
 *
 * Arşivin görselleri repoda ve statik varlık olarak sunuluyor; Cloudflare
 * varlıkları Worker'dan önce denediği için bu rota onlar için hiç çalışmaz.
 * Buraya yalnız D1 üzerinden yayımlanan yeni haberlerin görselleri düşer —
 * onlar R2'de.
 */
import type { APIRoute } from 'astro';
import { getWorkerEnv } from '#runtime-env';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const path = params.path;
  if (!path || !path.endsWith('.webp')) {
    return new Response(null, { status: 404 });
  }

  const object = await getWorkerEnv().HERO.get(path);
  if (!object) return new Response(null, { status: 404 });

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/webp',
      // Görsel slug'a bağlı ve slug değişmiyor. Düzeltmede görsel değişirse
      // anahtarın da değişmesi gerekir; aksi halde eski görsel önbellekte
      // kalır.
      'cache-control': 'public, max-age=31536000, immutable',
      etag: object.httpEtag,
    },
  });
};
