/* Yayın uçları.
 *
 * Sözleşme `newsroom publish` ile aynı: aynı `selections` yükü, aynı kapılar,
 * aynı hata kodları. Değişen tek şey çağrının nereden geldiği — kabuk yerine
 * HTTP. Ajan tarafı bu yüzden yeniden yazılmıyor, yalnız gönderim biçimi
 * değişiyor.
 *
 * ————————————————————————————————————————————————————————————————
 * BU DİLİMDE KAPATILMAMIŞ İKİ ŞEY VAR. İkisi de bilerek açık ve ikisi de
 * canlıya çıkmadan önce kapanmalı:
 *
 * 1. KİMLİK. Aşağıdaki `authorize()` paylaşılan bir sır karşılaştırıyor.
 *    Tasarlanan şey bu değil: Orbit'in ES256 imzalı ID token'ı JWKS üzerinden
 *    doğrulanacak ve `author` token'ın `sub`'undan türetilecek. O iş Orbit
 *    tarafında bir istemci kaydı gerektiriyor, yani Samet'in kararı. Buraya
 *    sahte bir Orbit doğrulaması yazmadım — çalışıyormuş gibi duran bir kimlik
 *    katmanı, hiç olmayanından tehlikelidir.
 *
 * 2. PANO GÜVENİ. `brief` yükün içinde geliyor. Yani "panoda olmayan aday" ve
 *    "çevrilmemiş başlık" kapıları, ajanın kendi beyan ettiği panoya karşı
 *    ölçüyor. Kapılar duruyor ama kandırılabilir. Doğrusu: `prepare` panoyu
 *    sunucuya yazsın, `publish` yalnız `briefId` göndersin.
 * ———————————————————————————————————————————————————————————————— */

import { validate } from "./accept.ts";
import { tokenSetRatio } from "./fuzz.ts";
import { renderBody, RENDER_VERSION } from "./render.ts";

/** `newsroom.live.DUPLICATE_TITLE_SIMILARITY` ile aynı olmak zorunda. */
const DUPLICATE_TITLE_SIMILARITY = 82;

/** Yayın imzaları. `newsroom.publish.SUPPORTED_AUTHORS` ile aynı hizada. */
const SUPPORTED_AUTHORS = new Set(["Asteria AI", "Selene AI"]);

const PUBLISH_TZ_OFFSET = "+03:00";

export interface Env {
  DB: D1Database;
  HERO: R2Bucket;
  PUBLISH_TOKEN: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* GEÇİCİ — bkz. dosya başındaki not (1). */
function authorize(request: Request, env: Env): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !env.PUBLISH_TOKEN) return false;

  // Sabit zamanlı karşılaştırma: uzunluk sızıntısını da kapatmak için
  // önce uzunluk, sonra bayt bayt XOR.
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(env.PUBLISH_TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** `newsroom.publish.slugify` karşılığı.
 *
 * Slug her zaman Türkçe başlıktan türetilir. Üç ayrıntı bire bir taşınmak
 * zorunda, çünkü üçü de adresi değiştiriyor:
 *
 * 1. Kesme ve tırnak karakterleri BOŞA eşlenir, tireye değil. "2026’nın"
 *    → "2026nin"; tireye eşlense "2026-nin" olurdu ve arşivdeki 587 adresin
 *    biçiminden ayrılırdı.
 * 2. Eşleme küçültmeden ÖNCE yapılır: `"İ".toLowerCase()` birleşik noktalı
 *    bir karakter üretir ve sonrasında ASCII'ye düşmez.
 * 3. Uzunluk sınırı 110 ve kesme sözcük sınırından yapılır.
 *
 * `tools/parity-slug.mjs` bunu arşivdeki 587 başlık/dosya adı çifti üzerinde
 * ölçüyor.
 */
const TURKISH_MAP: Record<string, string> = {
  "ç": "c", "Ç": "c",
  "ğ": "g", "Ğ": "g",
  "ı": "i", "I": "i", "İ": "i",
  "ö": "o", "Ö": "o",
  "ş": "s", "Ş": "s",
  "ü": "u", "Ü": "u",
  "â": "a", "î": "i", "û": "u",
  "’": "", "'": "", "”": "", "“": "",
};

const MAX_SLUG_LENGTH = 110;

export function slugify(title: string): string {
  const mapped = [...title]
    .map((ch) => (ch in TURKISH_MAP ? TURKISH_MAP[ch] : ch))
    .join("")
    .toLowerCase();

  let slug = mapped.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");

  if (slug.length > MAX_SLUG_LENGTH) {
    const cut = slug.slice(0, MAX_SLUG_LENGTH);
    const lastDash = cut.lastIndexOf("-");
    slug = lastDash === -1 ? cut : cut.slice(0, lastDash);
  }
  return slug;
}

/** `newsroom.ingest.canonicalize` ile aynı soruyu sorar: iki adres aynı yayını
 *  mı gösteriyor. Takip parametreleri ve son eğik çizgi anlam taşımaz. */
function canonicalize(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$|^ref$/u.test(key)) parsed.searchParams.delete(key);
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

/** `newsroom.publish.render`'ın gövde kısmı: haber metni + Kaynaklar bölümü.
 *  Frontmatter burada üretilmiyor — o alanlar D1 sütunlarında duruyor. */
function bodyMarkdown(body: string, sources: { name: string; url: string }[]): string {
  const [primary, ...supporting] = sources;
  const parts = [
    body.trim(), "", "## Kaynaklar", "",
    `- Ana kaynak: [${primary.name}](${primary.url})`,
  ];
  if (supporting.length > 0) {
    parts.push("", "## Ek kaynaklar", "");
    for (const source of supporting) parts.push(`- [${source.name}](${source.url})`);
  }
  parts.push("");
  return parts.join("\n");
}

async function publish(request: Request, env: Env): Promise<Response> {
  if (!authorize(request, env)) {
    return json({ error: "yetkisiz" }, 401);
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "gövde JSON değil" }, 400);
  }

  const author = String(payload.author ?? "Asteria AI");
  if (!SUPPORTED_AUTHORS.has(author)) {
    return json({ problems: [`desteklenmeyen yazar: ${author}`] }, 400);
  }

  const brief = payload.brief;
  if (!brief || typeof brief !== "object") {
    return json({ problems: ["brief eksik"] }, 400);
  }

  // 1. Kabul sözleşmesi — Python'daki `accept.validate` ile birebir.
  const result = validate({ selections: payload.selections, note: payload.note }, brief);
  if (result.errors.length > 0) {
    return json({ contractErrors: result.errors }, 422);
  }
  if (result.accepted.length === 0) {
    // Seçim yapılmaması hata değil (POLICY.md §7).
    return json({ published: [], declinedReason: result.declinedReason }, 200);
  }

  const selection = result.accepted[0] as Record<string, any>;
  const board = new Map<string, any>((brief.board ?? []).map((e: any) => [e.id, e]));
  const entry = board.get(selection.candidateId);

  const slug = slugify(selection.title);
  const problems: string[] = [];

  // 2. Tekrar yayın kapıları — statik sistemde `live.py`'nin yaptığı iş.
  const existingSlug = await env.DB.prepare("SELECT slug FROM articles WHERE slug = ?")
    .bind(slug).first<{ slug: string }>();
  if (existingSlug) problems.push(`aynı slug zaten yayında: ${slug}`);

  const originUrl = entry?.url ? canonicalize(entry.url) : null;
  if (originUrl) {
    const existingUrl = await env.DB.prepare("SELECT slug FROM articles WHERE origin_url = ?")
      .bind(originUrl).first<{ slug: string }>();
    if (existingUrl) problems.push(`bu kaynak zaten yayında: ${entry.url}`);
  }

  // Başlık benzerliği tam tarama ister; 587 satırda bu D1 için ucuz.
  const titles = await env.DB.prepare("SELECT slug, title FROM articles").all<{ slug: string; title: string }>();
  const lowered = selection.title.trim().toLowerCase();
  for (const row of titles.results ?? []) {
    if (tokenSetRatio(lowered, row.title.toLowerCase()) >= DUPLICATE_TITLE_SIMILARITY) {
      problems.push(`aynı haber zaten yayında: ${row.slug}`);
      break;
    }
  }

  if (problems.length > 0) return json({ problems }, 409);

  // 3. Hero. Sıra `newsroom/newsroom/hero.py` ile aynı mantıkta: görsel
  //    üretilemediyse yayın DURMAZ, haber hero'suz çıkar (hero.py 4. adım).
  //    Normalizasyon burada yapılmıyor — Selene yerelde 1200×675 WebP'ye
  //    çevirip yolluyor, çünkü kanıtlanmış dönüşüm kodu orada ve Worker'da
  //    ImageMagick yok.
  let heroImage: string | null = null;
  let heroAlt: string | null = null;
  if (typeof payload.heroWebpBase64 === "string" && payload.heroWebpBase64.length > 0) {
    try {
      const binary = Uint8Array.from(atob(payload.heroWebpBase64), (c) => c.charCodeAt(0));
      const key = `equinox-haber/${slug}.webp`;
      await env.HERO.put(key, binary, { httpMetadata: { contentType: "image/webp" } });
      heroImage = `/images/generated/${key}`;
      // `heroAlt` yalnız ekrandaki görseli gerçekten anlatıyorsa yazılır.
      // Stok yedeğine düşüldüğünde ajan `heroDescribesSelection: false` yollar.
      heroAlt = payload.heroDescribesSelection === false ? null : selection.heroAlt;
    } catch (error) {
      problems.push(`hero yüklenemedi: ${String(error)}`);
      return json({ problems }, 400);
    }
  }

  // 4. Render-on-write. Bu adım Astro build kapısının yerini tutuyor: çevrim
  //    düşerse D1'e hiçbir şey yazılmaz ve yarım yayın ortada kalmaz.
  // Kaynaklar bölümünü ajan yazmaz, sistem panodaki adayın kendi yayınından
  // yazar (POLICY.md §5). Pano girdisindeki alan adı `source`.
  const sources = [{ name: String(entry?.source ?? "Kaynak"), url: String(entry?.url ?? "") }];
  const markdown = bodyMarkdown(String(selection.body), sources);

  let rendered;
  try {
    rendered = await renderBody(markdown);
  } catch (error) {
    return json({ problems: [`render başarısız: ${String(error)}`] }, 500);
  }

  const stamp = new Date().toISOString().replace("Z", PUBLISH_TZ_OFFSET);

  // 5. Yazma. Haber başına atomik: haber, etiketleri ve kaynakları tek
  //    partide gider; biri düşerse hiçbiri yazılmaz.
  const statements = [
    env.DB.prepare(
      `INSERT INTO articles (
         slug, title, description, category, author,
         body_md, body_html, render_version,
         hero_image, hero_alt, pub_date, updated_date,
         is_draft, breaking, editor_pick, origin_url, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,?,?,?)`,
    ).bind(
      slug, selection.title, selection.description, selection.category, author,
      markdown, rendered.html, RENDER_VERSION,
      heroImage, heroAlt, stamp, stamp, originUrl, stamp, stamp,
    ),
    ...(selection.tags as string[]).map((tag, i) =>
      env.DB.prepare("INSERT INTO article_tags (slug, tag, position) VALUES (?,?,?)").bind(slug, tag, i)),
    ...sources.map((source, i) =>
      env.DB.prepare("INSERT INTO article_sources (slug, position, name, url) VALUES (?,?,?,?)")
        .bind(slug, i, source.name, source.url)),
  ];

  await env.DB.batch(statements);

  return json({
    published: [{
      slug, title: selection.title, author,
      url: `/${slug}/`,
      heroImage, renderVersion: RENDER_VERSION,
      htmlBytes: rendered.html.length,
    }],
  }, 201);
}

async function readArticle(slug: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT slug, title, description, category, author, body_html,
            hero_image, hero_alt, pub_date, updated_date, render_version
       FROM articles WHERE slug = ? AND is_draft = 0`,
  ).bind(slug).first<Record<string, unknown>>();

  if (!row) return json({ error: "bulunamadı" }, 404);

  /* Bu sayfa NewsLayout'un yerini TUTMUYOR. Bu dilimin sorusu "render-on-write
   * uçtan uca çalışıyor mu"; şablon eşleştirmesi ayrı bir dilim. Buradaki
   * çıplak HTML, D1'den gelen gövdenin doğru olduğunu gözle görmek içindir. */
  const hero = row.hero_image
    ? `<img src="${row.hero_image}" alt="${row.hero_alt ?? row.title}" width="1200" height="675">`
    : "";

  return new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${row.title}</title><meta name="description" content="${row.description}">` +
      `</head><body><article><h1>${row.title}</h1>` +
      `<p><small>${row.author} · ${row.category} · ${row.pub_date}</small></p>` +
      hero +
      `<div class="article-prose">${row.body_html}</div>` +
      `</article></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/publish") {
      return publish(request, env);
    }

    const article = /^\/([a-z0-9-]+)\/?$/u.exec(url.pathname);
    if (request.method === "GET" && article) {
      return readArticle(article[1], env);
    }

    // Hero görselleri R2'den. Yol, frontmatter'daki `heroImage` ile aynı olmak
    // zorunda: arşivdeki 587 haber `/images/generated/equinox-haber/<slug>.webp`
    // adresini taşıyor ve D1'den gelen haber onlardan farklı bir adres
    // kullanırsa göç sırasında iki ayrı şema oluşur.
    const image = /^\/images\/generated\/(.+\.webp)$/u.exec(url.pathname);
    if (request.method === "GET" && image) {
      const object = await env.HERO.get(image[1]);
      if (!object) return json({ error: "görsel bulunamadı" }, 404);
      return new Response(object.body, {
        headers: {
          "content-type": object.httpMetadata?.contentType ?? "image/webp",
          // Görsel slug'a bağlı ve slug değişmiyor; düzeltmede görsel
          // değişirse anahtar da değişmeli.
          "cache-control": "public, max-age=31536000, immutable",
          etag: object.httpEtag,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/articles") {
      const rows = await env.DB.prepare(
        "SELECT slug, title, category, author, pub_date, render_version FROM articles WHERE is_draft = 0 ORDER BY pub_date DESC LIMIT 20",
      ).all();
      return json({ articles: rows.results });
    }

    return json({ error: "bulunamadı" }, 404);
  },
} satisfies ExportedHandler<Env>;
