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

export interface PublishedD1Options {
  withBody?: boolean;
  limit?: number;
  offset?: number;
  category?: string;
  since?: Date | string;
  includeTags?: boolean;
  includeSources?: boolean;
}

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

const ARTICLE_META_COLUMNS = `slug, title, description, category, author,
       '' AS body_md, '' AS body_html,
       hero_image, hero_alt, pub_date, updated_date, is_draft, breaking, editor_pick`;

function positiveInteger(value?: number) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function nonNegativeInteger(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function readRelations<T>(
  db: D1Database,
  slugs: string[],
  sqlForPlaceholders: (placeholders: string) => string,
): Promise<T[]> {
  const rows: T[] = [];
  /* D1/SQLite bağ parametresi sınırına yaklaşmamak için büyük arşiv sorgularını
   * küçük parçalar halinde yürüt. Normal sayfalarda bu döngü tek turdur. */
  for (let index = 0; index < slugs.length; index += 80) {
    const chunk = slugs.slice(index, index + 80);
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db.prepare(sqlForPlaceholders(placeholders)).bind(...chunk).all<T>();
    rows.push(...(result.results ?? []));
  }
  return rows;
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
  options: PublishedD1Options = {},
): Promise<D1NewsEntry[]> {
  const bodyColumns = options.withBody ? "body_md, body_html," : "'' AS body_md, '' AS body_html,";
  const where = ['is_draft = 0'];
  const bindings: unknown[] = [];

  if (options.category) {
    where.push('category = ?');
    bindings.push(options.category);
  }
  if (options.since) {
    where.push('pub_date >= ?');
    bindings.push(isoDate(options.since));
  }

  const limit = positiveInteger(options.limit);
  const offset = nonNegativeInteger(options.offset);
  const pagination = limit
    ? ` LIMIT ${limit}${offset ? ` OFFSET ${offset}` : ''}`
    : offset
      ? ` LIMIT -1 OFFSET ${offset}`
      : '';

  const articles = await db.prepare(
    `SELECT slug, title, description, category, author, ${bodyColumns}
            hero_image, hero_alt, pub_date, updated_date, is_draft, breaking, editor_pick
       FROM articles
      WHERE ${where.join(' AND ')}
      ORDER BY pub_date DESC, slug ASC${pagination}`,
  ).bind(...bindings).all<ArticleRow>();

  const articleRows = articles.results ?? [];
  const slugs = articleRows.map((row) => row.slug);
  if (slugs.length === 0) return [];

  const includeTags = options.includeTags ?? true;
  const includeSources = options.includeSources ?? true;
  const [tags, sources] = await Promise.all([
    includeTags
      ? readRelations<{ slug: string; tag: string }>(
          db,
          slugs,
          (placeholders) => `SELECT slug, tag FROM article_tags WHERE slug IN (${placeholders}) ORDER BY slug, position`,
        )
      : Promise.resolve([]),
    includeSources
      ? readRelations<{ slug: string; name: string; url: string }>(
          db,
          slugs,
          (placeholders) => `SELECT slug, name, url FROM article_sources WHERE slug IN (${placeholders}) ORDER BY slug, position`,
        )
      : Promise.resolve([]),
  ]);

  return assemble(articleRows, tags, sources);
}

export async function getPublishedCountFromD1(db: D1Database): Promise<number> {
  const row = await db.prepare(
    'SELECT COUNT(*) AS total FROM articles WHERE is_draft = 0',
  ).first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export interface D1ArticlePageData {
  entry: D1NewsEntry;
  body: string;
  bodyHtml: string | null;
  nextEntry?: D1NewsEntry;
  prevEntry?: D1NewsEntry;
  relatedEntries: D1NewsEntry[];
}

/** Haber detay sayfası için bütün arşivi çekmeden gereken küçük çalışma seti.
 *
 * Eski yol her tekil haber isteğinde ~4-7 bin D1 satırı okuyordu çünkü ilgili
 * haberleri JS'te hesaplamak için tüm haberler + tüm etiketler + tüm kaynaklar
 * belleğe alınıyordu. Burada yalnız mevcut haber, komşuları ve üç ilgili aday
 * okunur. Botların eski haber arşivini taraması bu yüzden günlük kotayı artık
 * doğrusal biçimde eritmez. */
export async function getArticlePageFromD1(
  db: D1Database,
  slug: string,
): Promise<D1ArticlePageData | null> {
  const current = await db.prepare(
    `SELECT slug, title, description, category, author, body_md, body_html,
            hero_image, hero_alt, pub_date, updated_date, is_draft, breaking, editor_pick
       FROM articles
      WHERE slug = ? AND is_draft = 0`,
  ).bind(slug).first<ArticleRow>();
  if (!current) return null;

  const [tagsResult, sourcesResult, newer, older] = await Promise.all([
    db.prepare('SELECT slug, tag FROM article_tags WHERE slug = ? ORDER BY position')
      .bind(slug).all<{ slug: string; tag: string }>(),
    db.prepare('SELECT slug, name, url FROM article_sources WHERE slug = ? ORDER BY position')
      .bind(slug).all<{ slug: string; name: string; url: string }>(),
    db.prepare(
      `SELECT ${ARTICLE_META_COLUMNS}
         FROM articles
        WHERE is_draft = 0
          AND (pub_date > ? OR (pub_date = ? AND slug < ?))
        ORDER BY pub_date ASC, slug DESC
        LIMIT 1`,
    ).bind(current.pub_date, current.pub_date, current.slug).first<ArticleRow>(),
    db.prepare(
      `SELECT ${ARTICLE_META_COLUMNS}
         FROM articles
        WHERE is_draft = 0
          AND (pub_date < ? OR (pub_date = ? AND slug > ?))
        ORDER BY pub_date DESC, slug ASC
        LIMIT 1`,
    ).bind(current.pub_date, current.pub_date, current.slug).first<ArticleRow>(),
  ]);

  const currentTags = (tagsResult.results ?? []).map((row) => row.tag);
  let relatedWhere = 'a.category = ?';
  let scoreExpression = '6';
  let relatedBindings: unknown[] = [slug, current.category];

  if (currentTags.length > 0) {
    const placeholders = currentTags.map(() => '?').join(', ');
    relatedWhere = `(a.category = ? OR a.slug IN (
      SELECT slug FROM article_tags WHERE tag IN (${placeholders})
    ))`;
    scoreExpression = `(CASE WHEN a.category = ? THEN 6 ELSE 0 END) + 3 * (
      SELECT COUNT(*) FROM article_tags matched
       WHERE matched.slug = a.slug AND matched.tag IN (${placeholders})
    )`;
    /* SELECT içindeki yer tutucular WHERE'dekilerden önce bağlanır. */
    relatedBindings = [current.category, ...currentTags, slug, current.category, ...currentTags];
  }

  const related = await db.prepare(
    `SELECT ${ARTICLE_META_COLUMNS}, ${scoreExpression} AS relation_score
       FROM articles a
      WHERE a.is_draft = 0
        AND a.slug <> ?
        AND ${relatedWhere}
      ORDER BY relation_score DESC, a.pub_date DESC, a.slug ASC
      LIMIT 3`,
  ).bind(...relatedBindings).all<ArticleRow>();

  let relatedRows = related.results ?? [];
  if (relatedRows.length < 3) {
    const excluded = [slug, ...relatedRows.map((row) => row.slug)];
    const placeholders = excluded.map(() => '?').join(', ');
    const fallback = await db.prepare(
      `SELECT ${ARTICLE_META_COLUMNS}
         FROM articles
        WHERE is_draft = 0 AND slug NOT IN (${placeholders})
        ORDER BY pub_date DESC, slug ASC
        LIMIT ${3 - relatedRows.length}`,
    ).bind(...excluded).all<ArticleRow>();
    relatedRows = [...relatedRows, ...(fallback.results ?? [])];
  }

  const [entry] = assemble(
    [current],
    tagsResult.results ?? [],
    sourcesResult.results ?? [],
  );
  const [nextEntry] = newer ? assemble([newer], [], []) : [];
  const [prevEntry] = older ? assemble([older], [], []) : [];

  return {
    entry,
    body: current.body_md,
    bodyHtml: current.body_html,
    nextEntry,
    prevEntry,
    relatedEntries: assemble(relatedRows, [], []),
  };
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
