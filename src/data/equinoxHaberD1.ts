/* D1 destekli haber kaynağı.
 *
 * İçerik koleksiyonunun (`astro:content`) döndürdüğü girdi biçimini birebir
 * taklit eder: `id`, `body`, `data`. Amaç sayfaları ve bileşenleri yeniden
 * yazmamak — `[...slug].astro`, `NewsCard.astro` ve şablonlar aynı alanları
 * okumaya devam ediyor.
 *
 * Tek ek alan `bodyHtml`. Koleksiyon tarafında gövde `render(entry)` ile
 * çalışma anında markdown'dan üretiliyor; D1 tarafında ise yazma anında
 * üretilip saklanmış HTML geliyor (bkz. `worker/src/render.ts`). Çıktının
 * aynı olduğu ölçüldü: arşivdeki 587 haberin 587'sinde birebir.
 *
 * `pubDate` gerçek bir `Date` olmak zorunda: şablonlar `toISOString()` ve
 * `valueOf()` çağırıyor. Şemadaki `z.coerce.date()` koleksiyon tarafında bu
 * dönüşümü yapıyor, burada elle yapılıyor.
 */

export interface NewsSource { name: string; url: string }

export interface D1NewsEntry {
  id: string;
  body: string;
  /** Yazma anında üretilmiş HTML. Koleksiyon girdilerinde bulunmaz. */
  bodyHtml: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    updatedDate?: Date;
    heroImage?: string;
    heroAlt?: string;
    isDraft: boolean;
    tags: string[];
    author: string;
    category: string;
    breaking: boolean;
    editorPick: boolean;
    sources: NewsSource[];
  };
}

interface ArticleRow {
  slug: string; title: string; description: string; category: string; author: string;
  body_md: string; body_html: string;
  hero_image: string | null; hero_alt: string | null;
  pub_date: string; updated_date: string;
  is_draft: number; breaking: number; editor_pick: number;
}

/** D1 satırlarını koleksiyon girdisi biçimine çevirir.
 *
 * Etiketler ve kaynaklar ayrı tablolarda; her haber için ayrı sorgu atmak
 * N+1 olurdu, bu yüzden tek seferde çekilip bellekte gruplanıyor. */
function assemble(
  rows: ArticleRow[],
  tags: { slug: string; tag: string }[],
  sources: { slug: string; name: string; url: string }[],
): D1NewsEntry[] {
  const tagsBySlug = new Map<string, string[]>();
  for (const row of tags) {
    const list = tagsBySlug.get(row.slug);
    if (list) list.push(row.tag);
    else tagsBySlug.set(row.slug, [row.tag]);
  }

  const sourcesBySlug = new Map<string, NewsSource[]>();
  for (const row of sources) {
    const list = sourcesBySlug.get(row.slug);
    const entry = { name: row.name, url: row.url };
    if (list) list.push(entry);
    else sourcesBySlug.set(row.slug, [entry]);
  }

  return rows.map((row) => ({
    id: row.slug,
    body: row.body_md,
    bodyHtml: row.body_html,
    data: {
      title: row.title,
      description: row.description,
      pubDate: new Date(row.pub_date),
      updatedDate: row.updated_date ? new Date(row.updated_date) : undefined,
      heroImage: row.hero_image ?? undefined,
      heroAlt: row.hero_alt ?? undefined,
      isDraft: row.is_draft === 1,
      tags: tagsBySlug.get(row.slug) ?? [],
      author: row.author,
      category: row.category,
      breaking: row.breaking === 1,
      editorPick: row.editor_pick === 1,
      sources: sourcesBySlug.get(row.slug) ?? [],
    },
  }));
}

/** Yayımlanmış haberler, yeniden eskiye.
 *
 * Sıralama `ORDER BY` ile veritabanında yapılıyor; koleksiyon tarafındaki
 * `sort((a,b) => b.pubDate - a.pubDate)` ile aynı sonucu vermeli.
 *
 * **Gövdeler bu sorguya girmez.** Listeleme, ilgili haberler, önceki/sonraki
 * ve site haritası yalnız üstbilgi kullanıyor; gövdeleri de çekmek her sayfa
 * isteğinde ~2 MB'ı boşuna taşımak demekti. Gövdeye gerçekten ihtiyacı olan
 * iki yer var ve ikisi de kendi sorgusunu yapıyor: haber sayfası
 * (`getArticleFromD1`) ve RSS (`withBody`).
 *
 * `withBody` yalnız RSS için var ve orada da sınırlı sayıda haber isteniyor. */
export async function getPublishedFromD1(
  db: D1Database,
  options: { withBody?: boolean; limit?: number } = {},
): Promise<D1NewsEntry[]> {
  const bodyColumns = options.withBody ? "body_md, body_html," : "'' AS body_md, '' AS body_html,";
  const limit = options.limit ? ` LIMIT ${Number(options.limit)}` : "";

  const [articles, tags, sources] = await Promise.all([
    db.prepare(
      `SELECT slug, title, description, category, author, ${bodyColumns}
              hero_image, hero_alt, pub_date, updated_date, is_draft, breaking, editor_pick
         FROM articles WHERE is_draft = 0 ORDER BY pub_date DESC${limit}`,
    ).all<ArticleRow>(),
    db.prepare("SELECT slug, tag FROM article_tags ORDER BY slug, position").all<{ slug: string; tag: string }>(),
    db.prepare("SELECT slug, name, url FROM article_sources ORDER BY slug, position")
      .all<{ slug: string; name: string; url: string }>(),
  ]);

  return assemble(articles.results ?? [], tags.results ?? [], sources.results ?? []);
}

/** Tek haber, gövdesiyle.
 *
 * Haber sayfası listeyi zaten üstbilgi olarak çekiyor (ilgili haberler,
 * önceki/sonraki için); gövdeye yalnız gösterilen haber için ihtiyaç var. */
export async function getArticleFromD1(
  db: D1Database,
  slug: string,
): Promise<{ body: string; bodyHtml: string } | null> {
  const row = await db.prepare(
    "SELECT body_md, body_html FROM articles WHERE slug = ? AND is_draft = 0",
  ).bind(slug).first<{ body_md: string; body_html: string }>();

  return row ? { body: row.body_md, bodyHtml: row.body_html } : null;
}
