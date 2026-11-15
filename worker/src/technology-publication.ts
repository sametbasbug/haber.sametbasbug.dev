/**
 * Equinox Haber 2.0 Orbit yayını.
 * Yalnız doğrulanmış Orbit eylem kimliği ile çağrılır; tüm değerler
 * ajan kimliği veya üç alanlı metinden türetilir.
 * Eski iki-adımlı pano yayınına dokunmaz.
 */
import { bodyMarkdown, slugify, type Env } from "./index.ts";
import { tokenSetRatio } from "./fuzz.ts";
import { type Identity } from "./identity.ts";
import { renderBody, RENDER_VERSION } from "./render.ts";
import { validateTechnologyArticle } from "./technology-contract.ts";

const AUTHORS = new Set(["Nyx AI", "Hemera AI", "Asteria AI", "Selene AI"]);
const DUPLICATE_TITLE_SIMILARITY = 82;
const MAX_LIST = 50;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function isTechnologyPublisher(identity: Identity | undefined): identity is Identity {
  return Boolean(identity?.actor?.startsWith("agent:")
    && identity.mayPublish && AUTHORS.has(identity.author));
}

export async function publishTechnologyAs(
  identity: Identity,
  input: unknown,
  env: Env,
): Promise<Response> {
  if (!isTechnologyPublisher(identity)) {
    return json({ error: "Orbit ajanı için yayın yetkisi yok" }, 403);
  }

  const result = validateTechnologyArticle(input);
  if (!result.article) return json({ problems: result.errors }, 422);

  const article = result.article;
  const slug = slugify(article.baslik);
  if (!slug) return json({ problems: ["başlıktan adres üretilemedi"] }, 422);

  const problems: string[] = [];
  const existingSlug = await env.DB.prepare("SELECT slug FROM articles WHERE slug = ?")
    .bind(slug).first<{ slug: string }>();
  if (existingSlug) problems.push("bu başlık için bir haber zaten bulunuyor");

  const originUrl = article.sources[0].url;
  const existingSource = await env.DB.prepare("SELECT slug FROM articles WHERE origin_url = ?")
    .bind(originUrl).first<{ slug: string }>();
  if (existingSource) problems.push("birincil kaynak daha önce yayımlandı");

  const recent = await env.DB.prepare(
    "SELECT slug, title FROM articles WHERE publication_era = 'technology' ORDER BY pub_date DESC LIMIT 200",
  ).all<{ slug: string; title: string }>();
  for (const row of recent.results ?? []) {
    if (tokenSetRatio(article.baslik.toLocaleLowerCase("tr-TR"), row.title.toLocaleLowerCase("tr-TR"))
      >= DUPLICATE_TITLE_SIMILARITY) {
      problems.push(`benzer haber mevcut: ${row.slug}`);
      break;
    }
  }
  if (problems.length > 0) return json({ problems }, 409);

  // Kaynakları yayına sistem ekler; ajan markdown'ı kaynağı taklit edemez.
  const markdown = bodyMarkdown(article.body, article.sources);
  let rendered;
  try {
    rendered = await renderBody(markdown);
  } catch (error) {
    return json({ problems: [`haber render edilemedi: ${String(error)}`] }, 500);
  }
  const timestamp = new Date().toISOString(); // UTC, +03:00 string değiştirme YOK.

  // D1 batch atomiktir. Bir kaynak kaydı düşerse haberin tamamı geri alınır.
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO articles (
          slug,title,description,category,author,body_md,body_html,render_version,
          hero_image,hero_alt,pub_date,updated_date,is_draft,breaking,editor_pick,
          origin_url,created_at,updated_at,publication_era,tech_category,orbit_actor_subject
        ) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?,0,0,0,?,?,?,?,?,?)`,
      ).bind(
        slug, article.baslik, article.ozet, "Teknoloji", identity.author,
        markdown, rendered.html, RENDER_VERSION,
        timestamp, timestamp, originUrl, timestamp, timestamp,
        "technology", article.kategori, identity.actor!,
      ),
      ...article.sources.map((source, index) =>
        env.DB.prepare("INSERT INTO article_sources (slug, position, name, url) VALUES (?,?,?,?)")
          .bind(slug, index, source.name, source.url)),
      env.DB.prepare(
        "UPDATE site_state SET content_version = content_version + 1, updated_at = ? WHERE id = 1",
      ).bind(timestamp),
    ]);
  } catch (error) {
    // Çakışan eşzamanlı yayın (slug/origin UNIQUE) beklenen 409'dur.
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/u.test(String(error))) {
      return json({ problems: ["bu haber eşzamanlı olarak yayımlanmış"] }, 409);
    }
    throw error;
  }

  return json({
    slug,
    baslik: article.baslik,
    kategori: article.kategori,
    yazar: identity.author,
    orbitActor: identity.actor,
    yayinTarihi: timestamp,
    url: `/${slug}/`,
    gorsel: null,
  }, 201);
}

/** Orbit'in doğruladığı ajan kimliği bu işlemin tek erişim kapısıdır.
 * Anonim ajan endpoint'i yoktur. */
export async function listTechnologyAs(input: Record<string, unknown>, env: Env): Promise<Response> {
  const requested = Number(input.limit ?? 10);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(MAX_LIST, requested) : 10;
  const requestedOffset = Number(input.offset ?? 0);
  const offset = Number.isInteger(requestedOffset) && requestedOffset > 0 ? Math.min(requestedOffset, 10000) : 0;

  const where = ["a.publication_era = 'technology'", "a.is_draft = 0"];
  const params: unknown[] = [];
  if (typeof input.kategori === "string" && input.kategori.length > 0) {
    where.push("a.tech_category = ?");
    params.push(input.kategori);
  }
  if (typeof input.tarihten === "string" && /^\d{4}-\d{2}-\d{2}/u.test(input.tarihten)) {
    where.push("a.pub_date >= ?");
    params.push(input.tarihten);
  }
  if (typeof input.arama === "string" && input.arama.trim()) {
    const term = input.arama.slice(0, 120).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    where.push("(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')");
    params.push(`%${term}%`, `%${term}%`);
  }

  const filter = where.join(" AND ");
  const count = await env.DB.prepare(`SELECT count(*) as total FROM articles a WHERE ${filter}`)
    .bind(...params).first<{ total: number }>();
  const rows = await env.DB.prepare(
    `SELECT a.slug,a.title,a.description,a.tech_category,a.author,a.orbit_actor_subject,a.pub_date
      FROM articles a WHERE ${filter} ORDER BY a.pub_date DESC LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset).all<any>();

  const results = rows.results ?? [];
  return json({
    haberler: results.map((a) => ({
      slug: a.slug, baslik: a.title, ozet: a.description, kategori: a.tech_category,
      yazar: a.author, orbitActor: a.orbit_actor_subject, yayinTarihi: a.pub_date,
      url: `/${a.slug}/`,
    })),
    toplam: count?.total ?? 0, donen: results.length,
    limit, offset, dahaVar: offset + results.length < (count?.total ?? 0),
  });
}

export async function readTechnologyAs(input: Record<string, unknown>, env: Env): Promise<Response> {
  if (typeof input.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.slug)) {
    return json({ problems: ["geçersiz haber adresi"] }, 400);
  }
  const row = await env.DB.prepare(
    `SELECT slug,title,description,tech_category,author,orbit_actor_subject,
      pub_date,updated_date,body_md FROM articles
      WHERE slug=? AND publication_era='technology' AND is_draft=0`,
  ).bind(input.slug).first<any>();
  if (!row) return json({ problems: ["haber bulunamadı"] }, 404);
  const sources = await env.DB.prepare(
    "SELECT name,url FROM article_sources WHERE slug=? ORDER BY position",
  ).bind(input.slug).all<any>();
  return json({
    slug: row.slug, baslik: row.title, ozet: row.description, kategori: row.tech_category,
    yazar: row.author, orbitActor: row.orbit_actor_subject,
    yayinTarihi: row.pub_date, guncellemeTarihi: row.updated_date,
    metin: `# ${row.title}\n\n${row.body_md}`, kaynaklar: sources.results ?? [],
    url: `/${row.slug}/`,
  });
}

/** Kaynak düzeltme veya metin güncelleme. İlk URL (slug) değişmez:
 * dış bağlantılar ve haberin sahipliği güncellemeden etkilenmemeli. */
export async function editTechnologyAs(
  identity: Identity,
  input: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  if (!isTechnologyPublisher(identity)) {
    return json({ error: "Orbit ajanı için düzenleme yetkisi yok" }, 403);
  }
  const slug = typeof input.slug === "string" ? input.slug : "";
  const reason = typeof input.gerekce === "string" ? input.gerekce.trim() : "";
  if (!slug || reason.length < 10 || reason.length > 500) {
    return json({ problems: ["slug ve 10-500 karakterlik gerekce gerekli"] }, 422);
  }
  const allowed = new Set(["slug", "gerekce", "metin", "kategori", "kaynaklar"]);
  if (Object.keys(input).some((k) => !allowed.has(k))) {
    return json({ problems: ["izin verilmeyen düzenleme alanı"] }, 422);
  }

  const row = await env.DB.prepare(
    `SELECT slug,title,body_md,tech_category,orbit_actor_subject,is_draft,updated_at,
      pub_date,origin_url FROM articles WHERE slug=? AND publication_era='technology'`,
  ).bind(slug).first<any>();
  if (!row) return json({ problems: ["haber bulunamadı"] }, 404);
  if (row.orbit_actor_subject !== identity.actor) {
    return json({ error: "başka ajanın haberi düzenlenemez" }, 403);
  }
  if (row.is_draft !== 0) return json({ problems: ["yayından kaldırılmış haber düzenlenemez"] }, 409);

  const before = await env.DB.prepare(
    "SELECT name,url FROM article_sources WHERE slug=? ORDER BY position",
  ).bind(slug).all<{ name: string; url: string }>();
  const oldSources = before.results ?? [];
  // body_md sonuna sunucunun eklediği kaynak listesi bulunur. Ajanın
  // kendi metnini döndürmek için güvenilir ayıracı kullan; düzenleme
  // gövdesi gönderilmediyse eski içeriği kaynak bölümü olmadan koru.
  const marker = "\n\n## Kaynaklar\n";
  const previousText = row.body_md.includes(marker)
    ? row.body_md.slice(0, row.body_md.lastIndexOf(marker))
    : row.body_md;
  const validated = validateTechnologyArticle({
    metin: input.metin ?? `# ${row.title}\n\n${previousText}`,
    kategori: input.kategori ?? row.tech_category,
    kaynaklar: input.kaynaklar ?? oldSources.map((s) => s.url),
  });
  if (!validated.article) return json({ problems: validated.errors }, 422);
  const article = validated.article;

  // Kendi satırı hariç tekrar kaynak/başlık engeli.
  const urlConflict = await env.DB.prepare(
    "SELECT slug FROM articles WHERE origin_url=? AND slug<>?",
  ).bind(article.sources[0].url, slug).first<any>();
  if (urlConflict) return json({ problems: ["birincil kaynak başka haberde"] }, 409);

  const candidateTitles = await env.DB.prepare(
    "SELECT slug,title FROM articles WHERE publication_era='technology' AND slug<>?",
  ).bind(slug).all<{ slug: string; title: string }>();
  if ((candidateTitles.results ?? []).some((other) =>
    tokenSetRatio(other.title.toLocaleLowerCase("tr-TR"), article.baslik.toLocaleLowerCase("tr-TR"))
    >= DUPLICATE_TITLE_SIMILARITY)) {
    return json({ problems: ["başlık başka bir habere çok benziyor"] }, 409);
  }

  const markdown = bodyMarkdown(article.body, article.sources);
  let rendered;
  try { rendered = await renderBody(markdown); }
  catch (error) { return json({ problems: [`haber render edilemedi: ${String(error)}`] }, 500); }
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO article_revisions
        (slug,action,previous_body_md,previous_category,previous_sources_json,actor_subject,reason,created_at)
        VALUES (?,'edit',?,?,?,?,?,?)`,
    ).bind(slug, row.body_md, row.tech_category, JSON.stringify(oldSources), identity.actor!, reason, now),
    env.DB.prepare(
      `UPDATE articles SET title=?, description=?, tech_category=?, body_md=?, body_html=?,
        origin_url=?, updated_date=?, updated_at=?, render_version=?
        WHERE slug=? AND orbit_actor_subject=? AND publication_era='technology'`,
    ).bind(
      article.baslik, article.ozet, article.kategori, markdown, rendered.html,
      article.sources[0].url, now, now, RENDER_VERSION, slug, identity.actor!,
    ),
    env.DB.prepare("DELETE FROM article_sources WHERE slug=?").bind(slug),
    ...article.sources.map((s, i) =>
      env.DB.prepare("INSERT INTO article_sources (slug,position,name,url) VALUES (?,?,?,?)")
        .bind(slug, i, s.name, s.url)),
    env.DB.prepare(
      "UPDATE site_state SET content_version=content_version+1, updated_at=? WHERE id=1",
    ).bind(now),
  ]);

  return json({ slug, baslik: article.baslik, kategori: article.kategori, guncellemeTarihi: now });
}

/** Soft-delete/restoration. Yalnızca kaydın kendi Orbit aktörü yapabilir. */
export async function setTechnologyPublicationState(
  identity: Identity,
  input: Record<string, unknown>,
  env: Env,
  action: "withdraw" | "restore",
): Promise<Response> {
  if (!isTechnologyPublisher(identity)) return json({ error: "Orbit ajanının yayın yönetme yetkisi yok" }, 403);
  const slug = typeof input.slug === "string" ? input.slug : "";
  const reason = typeof input.gerekce === "string" ? input.gerekce.trim() : "";
  if (!slug || reason.length < 10 || reason.length > 500
    || Object.keys(input).some((k) => k !== "slug" && k !== "gerekce")) {
    return json({ problems: ["slug ve 10-500 karakterlik gerekce gerekli"] }, 422);
  }
  const row = await env.DB.prepare(
    `SELECT slug,body_md,tech_category,orbit_actor_subject,is_draft
      FROM articles WHERE slug=? AND publication_era='technology'`,
  ).bind(slug).first<any>();
  if (!row) return json({ problems: ["haber bulunamadı"] }, 404);
  if (row.orbit_actor_subject !== identity.actor) {
    return json({ error: "başka ajanın haberi yönetilemez" }, 403);
  }
  const nextDraft = action === "withdraw" ? 1 : 0;
  if (row.is_draft === nextDraft) return json({ problems: ["haber zaten istenen durumda"] }, 409);

  const sources = await env.DB.prepare(
    "SELECT name,url FROM article_sources WHERE slug=? ORDER BY position",
  ).bind(slug).all<any>();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO article_revisions
        (slug,action,previous_body_md,previous_category,previous_sources_json,actor_subject,reason,created_at)
        VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(slug, action, row.body_md, row.tech_category,
      JSON.stringify(sources.results ?? []), identity.actor!, reason, now),
    env.DB.prepare(
      "UPDATE articles SET is_draft=?,updated_at=?,updated_date=? WHERE slug=? AND orbit_actor_subject=?",
    ).bind(nextDraft, now, now, slug, identity.actor!),
    env.DB.prepare(
      "UPDATE site_state SET content_version=content_version+1,updated_at=? WHERE id=1",
    ).bind(now),
  ]);
  return json({ slug, durum: nextDraft ? "yayindan-kaldirildi" : "yayinda", tarih: now });
}
