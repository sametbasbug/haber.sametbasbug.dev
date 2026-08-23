/* Yayın uçları.
 *
 * Sözleşme `newsroom publish` ile aynı: aynı `selections` yükü, aynı kapılar,
 * aynı hata kodları. Değişen tek şey çağrının nereden geldiği — kabuk yerine
 * HTTP. Ajan tarafı bu yüzden yeniden yazılmıyor, yalnız gönderim biçimi
 * değişiyor.
 *
 * Bu modül hem tek başına bir Worker olarak (yerel geliştirme ve testler,
 * `wrangler dev`), hem de Astro SSR sitesinin API rotaları üzerinden
 * kullanılıyor (`src/pages/api/*`). Canlıda tek Worker var: yayın uçlarını
 * ayrı bir Worker'a koymak iki dağıtım, iki config ve görsel yolunun iki
 * kopyası demekti.
 *
 * Akış iki adımlı ve ayrılması kasıtlı:
 *
 *   POST /api/brief    → pano sabitlenir, `briefId` döner
 *   POST /api/publish  → haber o panoya karşı ölçülür ve yayımlanır
 *
 * Pano yükün içinde gelseydi "panoda olmayan aday" ve "çevrilmemiş başlık"
 * kapıları, yayımlamak isteyen tarafın kendi yazdığı referansa karşı ölçerdi.
 * Aynı ajan iki adımı da yapıyorken bile ayrım kazandırır: aday listesi haber
 * yazılmadan önce donar.
 */

import { validate } from "./accept.ts";
import { tokenSetRatio } from "./fuzz.ts";
import { authenticate, type AuthEnv, type Identity } from "./identity.ts";
import { renderBody, RENDER_VERSION } from "./render.ts";

/** `newsroom.live.DUPLICATE_TITLE_SIMILARITY` ile aynı olmak zorunda. */
const DUPLICATE_TITLE_SIMILARITY = 82;

/** `newsroom.publish.SUPPORTED_AUTHORS` ile aynı hizada. */
const SUPPORTED_AUTHORS = new Set(["Asteria AI", "Selene AI", "Hemera AI"]);

const PUBLISH_TZ_OFFSET = "+03:00";

/* Panonun geçerlilik penceresi. Çevrim saat başı olduğu için altı saat geniş;
 * amaç tazelik denetimi değil (onu tekrar yayın kapıları yapıyor), çok eski
 * bir panonun sessizce kullanılmasını ve tablonun sınırsız birikmesini
 * engellemek. */
const BRIEF_TTL_MS = 6 * 60 * 60 * 1000;

/* Yükte gelebilecek en büyük hero. Arşivdeki 327 görselden ölçülen dağılım:
 * hepsi 1200×675, medyan 91 KB, tamamı 400 KB altında. Base64 yaklaşık üçte
 * bir şişiriyor. Sınır, kanıtlanmış dağılımın belirgin üstünde ama açık uçlu
 * değil. */
const MAX_HERO_BASE64_BYTES = 1_400_000;

export interface Env extends AuthEnv {
  DB: D1Database;
  HERO: R2Bucket;
  /* Orbit ile giriş. `ORBIT_ISSUER` `AuthEnv`ten geliyor ve iki işi birden
   * yapıyor: tanımlıysa hem yayın ucu Orbit token'ı kabul eder hem de giriş
   * akışı açılır. Üçü de yoksa giriş düğmesi hiç görünmüyor — yarım
   * yapılandırılmış bir kapı, kapalı bir kapıdan kötüdür. */
  ORBIT_CLIENT_ID?: string;
  ORBIT_CLIENT_SECRET?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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
 * `tools/parity-slug.mjs` bunu 596 başlık üzerinde ölçüyor.
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

  /* İkinci kalıpta `-+` değil `-` var ve bu bilinçli.
   *
   * İlk `replace` alfanümerik olmayan her DİZİYİ tek bir tireye indiriyor,
   * yani çıktısında ardışık tire bulunması imkânsız. `-+$` yazmak, hiç
   * oluşamayacak bir diziyi geri izlemeyle aramak demek: CodeQL bunu
   * polinom ReDoS olarak işaretliyor (js/polynomial-redos) ve kalıp olarak
   * haklı, yalnız buradaki girdiyle erişilemiyor.
   *
   * Tek tire yazmak hem denk hem geri izlemesiz. Ama denklik ilk `replace`'in
   * daraltmasına DAYANIYOR: o kaldırılırsa burası da bozulur. */
  let slug = mapped.replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");

  if (slug.length > MAX_SLUG_LENGTH) {
    const cut = slug.slice(0, MAX_SLUG_LENGTH);
    const lastDash = cut.lastIndexOf("-");
    slug = lastDash === -1 ? cut : cut.slice(0, lastDash);
  }
  return slug;
}

/** `newsroom.ingest.canonicalize` ile aynı soruyu sorar: iki adres aynı yayını
 *  mı gösteriyor. Takip parametreleri ve son eğik çizgi anlam taşımaz. */
export function canonicalize(url: string): string {
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
 *  Frontmatter burada üretilmiyor — o alanlar D1 sütunlarında duruyor.
 *
 *  Kaynaklar bölümünü ajan yazmaz; sistem panodaki adayın kendi yayınından
 *  yazar (POLICY.md §5). Kaynak alanı sözleşmede yoktur ve olmayacaktır. */
export function bodyMarkdown(body: string, sources: { name: string; url: string }[]): string {
  const [primary, ...supporting] = sources;
  const parts = [
    body.trim(), "", "## Kaynaklar", "",
    `- Ana kaynak: [${primary.name}](${primary.url})`,
  ];
  if (supporting.length > 0) {
    parts.push("", "## Ek kaynaklar", "");
    for (const source of supporting) parts.push(`- [${source.name}](${source.url})`);
  }
  /* Sonda boş satır bırakılmıyor: `body_md` Astro'nun `entry.body`'siyle aynı
     biçimde saklanmalı (kırpılmış), yoksa RSS'in `content:encoded` alanı
     arşivden gelen haberle yeni yayımlanan haber arasında ayrışır. */
  return parts.join("\n").trim();
}

/* HTTP kabuğu ile işin kendisi ayrı.
 *
 * İki çağıran var ve ikisi kimliği farklı yerden alıyor: `/api/brief`
 * `Authorization` başlığından, `/api/orbit-eylem` ise Orbit'in imzalı eylem
 * belgesinden. Ayrım burada bitiyor — belgeden gelen istek de aynı yetki
 * kontrollerinden, aynı doğrulamalardan ve aynı yazma yolundan geçiyor.
 * İkinci bir yayın yolu açsaydık kapılardan biri er geç ötekinden geri
 * kalırdı. */
export async function writeBrief(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let brief: any;
  try {
    brief = await request.json();
  } catch {
    return json({ error: "gövde JSON değil" }, 400);
  }

  return writeBriefAs(auth.identity, brief, env);
}

export async function writeBriefAs(identity: Identity, brief: any, env: Env): Promise<Response> {
  if (!identity.mayWriteBrief) {
    return json({ error: "bu kimlik pano yazamaz" }, 403);
  }

  if (!brief || typeof brief !== "object" || !Array.isArray(brief.board)) {
    return json({ problems: ["brief `board` dizisi taşımıyor"] }, 400);
  }

  /* BOŞ PANO KABUL EDİLMİYOR.
   *
   * Panonun tamamı "şu adaylar arasından seç" demek; sıfır adaylı bir pano
   * kendi kendisiyle çelişiyor ve `selectCount: 1` ile birlikte anlamsız.
   * Bu kapı bir karışıklıktan sonra eklendi: yerel bir denemede boş pano
   * yazmıştım, o pano altı saat boyunca "aktif" kaldı ve `panoOku`yu deneyen
   * biri boş `board` görüp kusur sandı. Kusur okumada değil, o panonun
   * yazılabilmiş olmasındaydı. */
  if (brief.board.length === 0) {
    return json({ problems: ["pano boş: en az bir aday gerekiyor"] }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date();
  await env.DB.prepare(
    `INSERT INTO briefs (id, payload, policy_fingerprint, created_at, expires_at)
     VALUES (?,?,?,?,?)`,
  ).bind(
    id,
    JSON.stringify(brief),
    brief.policy?.fingerprint ?? null,
    now.toISOString(),
    new Date(now.getTime() + BRIEF_TTL_MS).toISOString(),
  ).run();

  return json({
    briefId: id,
    boardSize: brief.board.length,
    selectCount: brief.task?.selectCount ?? 1,
    policyFingerprint: brief.policy?.fingerprint ?? null,
    expiresAt: new Date(now.getTime() + BRIEF_TTL_MS).toISOString(),
  }, 201);
}

export async function publish(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "gövde JSON değil" }, 400);
  }

  return publishAs(auth.identity, payload, env);
}

export async function publishAs(identity: Identity, payload: any, env: Env): Promise<Response> {
  if (!identity.mayPublish) {
    return json({ error: "bu kimlik yayımlayamaz" }, 403);
  }

  /* Yayın imzası kimlikten gelir, yükten değil. `newsroom` tarafındaki kural
   * aynen korunuyor: yazar adı model yanıtının parçası değildir, operasyonel
   * metadata olarak sistem belirler. Böylece bir operatör — kasten ya da
   * yanlışlıkla — başkasının imzasıyla yayımlayamaz. Ajan devretmesinde de
   * aynen geçerli: imza `publishers.author`tan okunuyor, ajanın gönderdiği
   * gövdeden değil. */
  const author = identity.author;
  if (!SUPPORTED_AUTHORS.has(author)) {
    return json({ problems: [`desteklenmeyen yazar: ${author}`] }, 500);
  }

  if (typeof payload.briefId !== "string" || payload.briefId.length === 0) {
    return json({ problems: ["briefId eksik; önce POST /api/brief"] }, 400);
  }

  const briefRow = await env.DB.prepare(
    "SELECT payload, expires_at, consumed_at FROM briefs WHERE id = ?",
  ).bind(payload.briefId).first<any>();

  if (!briefRow) return json({ problems: ["pano bulunamadı"] }, 404);
  if (briefRow.consumed_at) {
    return json({ problems: ["bu pano zaten kullanıldı; yeni bir prepare gerekiyor"] }, 409);
  }
  if (new Date(briefRow.expires_at).getTime() < Date.now()) {
    return json({ problems: ["pano süresi dolmuş; yeni bir prepare gerekiyor"] }, 409);
  }

  const brief = JSON.parse(briefRow.payload);

  // 1. Kabul sözleşmesi — Python'daki `accept.validate` ile birebir.
  const result = validate({ selections: payload.selections, note: payload.note }, brief);
  if (result.errors.length > 0) {
    return json({ contractErrors: result.errors }, 422);
  }
  if (result.accepted.length === 0) {
    /* Seçim yapılmaması hata değildir (POLICY.md §7). Pano yine de tüketilir:
     * "bu turda yayımlanabilir aday yoktu" bir karardır ve aynı panoya
     * ikinci kez bakılması o kararı geçersiz kılar. */
    await env.DB.prepare("UPDATE briefs SET consumed_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), payload.briefId).run();
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

  const originUrl = entry?.url ? canonicalize(String(entry.url)) : null;
  if (originUrl) {
    const existingUrl = await env.DB.prepare("SELECT slug FROM articles WHERE origin_url = ?")
      .bind(originUrl).first<{ slug: string }>();
    if (existingUrl) problems.push(`bu kaynak zaten yayında: ${entry.url}`);
  }

  // Başlık benzerliği tam tarama ister; 587 satırda bu D1 için ucuz.
  const titles = await env.DB.prepare("SELECT slug, title FROM articles")
    .all<{ slug: string; title: string }>();
  const lowered = String(selection.title).trim().toLowerCase();
  for (const row of titles.results ?? []) {
    if (tokenSetRatio(lowered, row.title.toLowerCase()) >= DUPLICATE_TITLE_SIMILARITY) {
      problems.push(`aynı haber zaten yayında: ${row.slug}`);
      break;
    }
  }

  if (problems.length > 0) return json({ problems }, 409);

  // 3. Render-on-write. Astro build kapısının yerini tutuyor: çevrim düşerse
  //    D1'e hiçbir şey yazılmaz ve yarım yayın ortada kalmaz.
  const sources = [{ name: String(entry?.source ?? "Kaynak"), url: String(entry?.url ?? "") }];
  const markdown = bodyMarkdown(String(selection.body), sources);

  let rendered;
  try {
    rendered = await renderBody(markdown);
  } catch (error) {
    return json({ problems: [`render başarısız: ${String(error)}`] }, 500);
  }

  /* 4. Hero. Sıra `newsroom/newsroom/hero.py` ile aynı mantıkta: görsel
   *    yoksa yayın DURMAZ, haber hero'suz çıkar (hero.py 4. adım, kasıtlı).
   *    Normalizasyon burada yapılmıyor — Selene yerelde 1200×675 WebP'ye
   *    çevirip yolluyor, çünkü kanıtlanmış dönüşüm kodu orada ve Worker'da
   *    ImageMagick yok.
   *
   *    Görsel D1 yazımından ÖNCE yükleniyor: yükleme düşerse haber hiç
   *    yazılmamış olur. Ters sırada, görselsiz kalmış bir haber yayında
   *    kalırdı. */
  let heroImage: string | null = null;
  let heroAlt: string | null = null;
  const heroBase64 = payload.heroWebpBase64;
  if (typeof heroBase64 === "string" && heroBase64.length > 0) {
    if (heroBase64.length > MAX_HERO_BASE64_BYTES) {
      return json({ problems: [`hero çok büyük: ${heroBase64.length} bayt (base64)`] }, 413);
    }
    try {
      const binary = Uint8Array.from(atob(heroBase64), (c) => c.charCodeAt(0));
      // WebP imzası: "RIFF" ….. "WEBP". Biçim doğrulanmadan depoya
      // yazılırsa `heroImage` var olan ama görüntülenemeyen bir dosyayı
      // gösterir — `hero.py`'nin görsel denetimi kapısının karşılığı.
      const magic = new TextDecoder().decode(binary.slice(0, 4));
      const format = new TextDecoder().decode(binary.slice(8, 12));
      if (magic !== "RIFF" || format !== "WEBP") {
        return json({ problems: ["hero WebP değil"] }, 400);
      }
      await env.HERO.put(`equinox-haber/${slug}.webp`, binary, {
        httpMetadata: { contentType: "image/webp" },
      });
      heroImage = `/images/generated/equinox-haber/${slug}.webp`;
      /* `heroAlt` yalnız ekrandaki görseli gerçekten anlatıyorsa yazılır.
       * Stok yedeğine düşüldüğünde ajan `heroDescribesSelection: false`
       * yollar ve alan boş kalır; şablonlar başlığa düşer. Yanlış alt metin,
       * eksik alt metinden kötüdür — ekran okuyucu kullanan biri için sessiz
       * bir yalandır (DECISIONS A1). */
      heroAlt = payload.heroDescribesSelection === false ? null : String(selection.heroAlt);
    } catch (error) {
      return json({ problems: [`hero yüklenemedi: ${String(error)}`] }, 400);
    }
  }

  const stamp = new Date().toISOString().replace("Z", PUBLISH_TZ_OFFSET);

  // 5. Yazma. Haber başına atomik: haber, etiketleri ve kaynakları tek
  //    partide gider; biri düşerse hiçbiri yazılmaz. Pano da aynı partide
  //    tüketiliyor ki "yayımlandı ama pano açık kaldı" durumu oluşmasın.
  await env.DB.batch([
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
      env.DB.prepare("INSERT INTO article_tags (slug, tag, position) VALUES (?,?,?)")
        .bind(slug, tag, i)),
    ...sources.map((source, i) =>
      env.DB.prepare("INSERT INTO article_sources (slug, position, name, url) VALUES (?,?,?,?)")
        .bind(slug, i, source.name, source.url)),
    env.DB.prepare("UPDATE briefs SET consumed_at = ? WHERE id = ?")
      .bind(stamp, payload.briefId),
    /* İçerik sürümü aynı partide artıyor. Ayrı bir çağrı olsaydı "haber
       yazıldı ama sürüm artmadı" durumu mümkün olurdu ve haber liste
       sayfalarında önbellek süresi dolana kadar görünmezdi. */
    env.DB.prepare("UPDATE site_state SET content_version = content_version + 1, updated_at = ? WHERE id = 1")
      .bind(stamp),
  ]);

  return json({
    published: [{
      slug, title: selection.title, author,
      url: `/${slug}/`,
      heroImage, renderVersion: RENDER_VERSION,
      htmlBytes: rendered.html.length,
    }],
  }, 201);
}

/* Kaldırma penceresi.
 *
 * Gerçek kullanım "az önce yanlış bir şey yayımladık"; dört ay önceki bir
 * haberi kaldırmak editoryal bir karardır ve tek bir çağrının arkasında
 * olmamalı. Asimetri bilerek kapatılıyor: yayımlamak pano, kabul sözleşmesi,
 * tekrar kapıları ve render'dan geçiyor; kaldırmak tek çağrı. Yanlış yayını
 * durduran kapı var, DOĞRU yayını kaldıranı yok. Pencere o boşluğun yerini
 * tutmuyor ama zararı sınırlıyor.
 *
 * Daha eskisini kaldırmak isteyen insan doğrudan veritabanından yapar; bu
 * bir eksiklik değil, kararın insanda kalması. */
const WITHDRAW_WINDOW_MS = 24 * 60 * 60 * 1000;

const MIN_WITHDRAW_REASON = 10;

/** Arşiv okumada tek çağrıda dönebilecek en fazla kayıt. */
const LISTE_LIMIT = 100;
/** Gövde de istendiğinde tavan; bkz. `listPublished`. */
const GOVDE_LIMIT = 10;

/** Panonun mevcut durumunu okur.
 *
 * `panoYaz` bir `briefId` döndürüyor ve ajanın onu kaybetmesi mümkün —
 * konuşma biter, oturum değişir, kalıcı hafıza yoktur. O zaman pano altı saat
 * boyunca kimsenin ulaşamadığı bir yerde asılı kalıyordu. İki adımlı bir
 * akışta ilk adımın çıktısını okuyamamak tasarım hatasıydı. */
export async function readBoardAs(identity: Identity, env: Env): Promise<Response> {
  if (!identity.mayWriteBrief) {
    return json({ error: "bu kimlik panoyu okuyamaz" }, 403);
  }

  const row = await env.DB.prepare(
    `SELECT id, payload, created_at, expires_at, consumed_at
       FROM briefs WHERE consumed_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
  ).bind(new Date().toISOString()).first<any>();

  if (!row) return json({ aktifPano: null });

  const brief = JSON.parse(row.payload);
  return json({
    aktifPano: {
      briefId: row.id,
      olusturuldu: row.created_at,
      gecerlilikSonu: row.expires_at,
      selectCount: brief.task?.selectCount ?? 1,
      policyFingerprint: brief.policy?.fingerprint ?? null,
      board: brief.board ?? [],
    },
  });
}

/** Yayımlanmış haberleri döndürür. Yayıncı yetkisi İSTEMEZ — bkz. `orbit-eylem.ts`.
 *
 * BU UÇ RSS'İN KOPYASI DEĞİL ve olmamalı; olsaydı Orbit'ten geçmenin bir
 * karşılığı olmazdı. RSS son haberleri veriyor ve orada duruyor: kimseden bir
 * şey alınmadı. Buradan gelen fark arşivin kendisi —
 *
 *   RSS  → son haberler, sabit sayı, süzgeç yok, arama yok
 *   Orbit → 580 haberin tamamı; arama, etiket, kategori, tarih aralığı,
 *           sayfalama ve istenirse haber gövdesi
 *
 * Yani "Orbit hesabı olanın erişimi daha iyi" cümlesi bir kısıtla değil, bir
 * fazlalıkla kuruluyor. */
export async function listPublished(input: any, env: Env): Promise<Response> {
  const govdeIstendi = input?.govde === true;
  /* Gövde istendiğinde tavan düşüyor.
   *
   * Üstbilgi satırı birkaç yüz bayt; haber gövdesi birkaç kilobayt. Yüz
   * gövde, çağıran ajanın bağlamına yüzlerce kilobayt boşaltmak demek — ve o
   * bağlam sınırlı. Ajan "hepsini getir" diyebilir, biz veremeyiz; sayfalama
   * zaten var (`offset`, `dahaVar`). */
  const tavan = govdeIstendi ? GOVDE_LIMIT : LISTE_LIMIT;
  const limit = Math.min(Math.max(Number(input?.limit ?? Math.min(20, tavan)) || 20, 1), tavan);
  const offset = Math.max(Number(input?.offset ?? 0) || 0, 0);

  const kosullar: string[] = ["a.is_draft = 0"];
  const degerler: unknown[] = [];

  if (typeof input?.kategori === "string" && input.kategori.length > 0) {
    kosullar.push("a.category = ?");
    degerler.push(input.kategori);
  }
  if (typeof input?.etiket === "string" && input.etiket.length > 0) {
    kosullar.push("EXISTS (SELECT 1 FROM article_tags t WHERE t.slug = a.slug AND t.tag = ?)");
    degerler.push(input.etiket);
  }
  if (typeof input?.tarihten === "string" && input.tarihten.length > 0) {
    kosullar.push("a.pub_date >= ?");
    degerler.push(input.tarihten);
  }
  if (typeof input?.tarihe === "string" && input.tarihe.length > 0) {
    kosullar.push("a.pub_date <= ?");
    degerler.push(input.tarihe);
  }

  /* Arama başlık ve özette, LIKE ile.
   *
   * FTS5 tablosu kurmadım: 580 satırlık bir arşivde tarama zaten ucuz ve ayrı
   * bir indeks, senkron tutulması gereken ikinci bir gerçek demek. Kullanıcı
   * girdisi jokerleri KAÇIRILIYOR — kaçırılmasaydı `%` gönderen biri süzgeci
   * sessizce etkisiz hale getirirdi. */
  const arama = typeof input?.arama === "string" ? input.arama.trim() : "";
  if (arama.length > 0) {
    const kalip = `%${arama.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    kosullar.push("(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')");
    degerler.push(kalip, kalip);
  }

  const nerede = kosullar.join(" AND ");
  const sayim = await env.DB.prepare(
    `SELECT count(*) AS n FROM articles a WHERE ${nerede}`,
  ).bind(...degerler).first<{ n: number }>();

  const alanlar = govdeIstendi
    ? "a.slug, a.title, a.description, a.category, a.author, a.pub_date, a.hero_image, a.body_md"
    : "a.slug, a.title, a.description, a.category, a.author, a.pub_date, a.hero_image";

  const rows = await env.DB.prepare(
    `SELECT ${alanlar} FROM articles a
      WHERE ${nerede} ORDER BY a.pub_date DESC LIMIT ? OFFSET ?`,
  ).bind(...degerler, limit, offset).all<any>();

  const sonuc = rows.results ?? [];
  return json({
    haberler: sonuc.map((row) => ({
      slug: row.slug,
      baslik: row.title,
      ozet: row.description,
      kategori: row.category,
      yazar: row.author,
      yayinTarihi: row.pub_date,
      url: `/${row.slug}/`,
      gorsel: row.hero_image,
      ...(govdeIstendi ? { govde: row.body_md } : {}),
    })),
    donen: sonuc.length,
    /* Tavan cevapta yazılı: ajan neden istediğinden az aldığını görebilmeli,
       yoksa eksik veriyi eksik sanmaz, "hepsi bu" sanar. */
    limit,
    /* Süzgece uyan TOPLAM sayı; dönen sayı değil. Ajan "kaç tane var" ile
       "kaç tane aldım"ı ayırt edemezse sayfalamayı kuramaz. */
    toplam: sayim?.n ?? sonuc.length,
    offset,
    dahaVar: offset + sonuc.length < (sayim?.n ?? 0),
  });
}

/** Haberi yayından kaldırır. Silmez: `is_draft` ile gizler, satır durur. */
export async function withdrawAs(identity: Identity, input: any, env: Env): Promise<Response> {
  if (!identity.mayPublish) return json({ error: "bu kimlik yayından kaldıramaz" }, 403);

  const slug = typeof input?.slug === "string" ? input.slug.trim() : "";
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (slug.length === 0) return json({ problems: ["slug eksik"] }, 400);
  /* `reason` ZORUNLU ve bu "mümkünse" değil. Gerekçesiz bir kaldırma, altı ay
   * sonra bakan biri için sebebi kaybolmuş bir boşluktur; kaldırma kararının
   * tek denetim izi bu alan. */
  if (reason.length < MIN_WITHDRAW_REASON) {
    return json({ problems: [`reason en az ${MIN_WITHDRAW_REASON} karakter olmalı`] }, 400);
  }

  const row = await env.DB.prepare(
    "SELECT slug, title, pub_date, is_draft FROM articles WHERE slug = ?",
  ).bind(slug).first<any>();

  if (!row) return json({ problems: [`haber bulunamadı: ${slug}`] }, 404);
  if (row.is_draft === 1) return json({ problems: ["bu haber zaten yayında değil"] }, 409);

  const yas = Date.now() - new Date(row.pub_date).getTime();
  if (yas > WITHDRAW_WINDOW_MS) {
    return json({
      problems: [`bu haber 24 saatten eski (${Math.floor(yas / 3_600_000)} saat); kaldırma insan kararı`],
    }, 409);
  }

  const stamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE articles SET is_draft = 1, updated_at = ? WHERE slug = ?").bind(stamp, slug),
    env.DB.prepare(
      `INSERT INTO article_withdrawals (slug, action, reason, subject, actor_subject, created_at)
       VALUES (?,'withdraw',?,?,?,?)`,
    ).bind(slug, reason, identity.subject, identity.actor ?? null, stamp),
    /* İçerik sürümü aynı partide artıyor: artmasaydı kaldırılan haber liste
       sayfalarında önbellek süresi dolana kadar görünmeye devam ederdi. */
    env.DB.prepare("UPDATE site_state SET content_version = content_version + 1, updated_at = ? WHERE id = 1").bind(stamp),
  ]);

  return json({ slug, baslik: row.title, kaldirildi: true, tarih: stamp });
}

/** Kaldırılan haberi geri alır.
 *
 * Kaldırma ajan yapabiliyorsa geri alma da yapabilmeli. Aksi halde "geri
 * alınabilir" demek "biri veritabanına girerse geri alınabilir" demek olurdu
 * ve geri almak kaldırmaktan daha güvenli bir işlem. */
export async function restoreAs(identity: Identity, input: any, env: Env): Promise<Response> {
  if (!identity.mayPublish) return json({ error: "bu kimlik yayına alamaz" }, 403);

  const slug = typeof input?.slug === "string" ? input.slug.trim() : "";
  if (slug.length === 0) return json({ problems: ["slug eksik"] }, 400);

  const row = await env.DB.prepare(
    "SELECT slug, title, is_draft FROM articles WHERE slug = ?",
  ).bind(slug).first<any>();

  if (!row) return json({ problems: [`haber bulunamadı: ${slug}`] }, 404);
  if (row.is_draft === 0) return json({ problems: ["bu haber zaten yayında"] }, 409);

  const stamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE articles SET is_draft = 0, updated_at = ? WHERE slug = ?").bind(stamp, slug),
    env.DB.prepare(
      `INSERT INTO article_withdrawals (slug, action, reason, subject, actor_subject, created_at)
       VALUES (?,'restore','yayına geri alındı',?,?,?)`,
    ).bind(slug, identity.subject, identity.actor ?? null, stamp),
    env.DB.prepare("UPDATE site_state SET content_version = content_version + 1, updated_at = ? WHERE id = 1").bind(stamp),
  ]);

  return json({ slug, baslik: row.title, yayinda: true, tarih: stamp });
}

export async function readArticle(slug: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT slug, title, description, category, author, body_html,
            hero_image, hero_alt, pub_date, updated_date, render_version
       FROM articles WHERE slug = ? AND is_draft = 0`,
  ).bind(slug).first<Record<string, any>>();

  if (!row) return json({ error: "bulunamadı" }, 404);

  /* Bu sayfa NewsLayout'un yerini TUTMUYOR. Şablon eşleştirmesi ayrı bir
   * dilim; buradaki çıplak HTML, D1'den gelen gövdenin doğru olduğunu gözle
   * görmek içindir. */
  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

  const hero = row.hero_image
    ? `<img src="${escape(row.hero_image)}" alt="${escape(row.hero_alt ?? row.title)}" width="1200" height="675">`
    : "";

  return new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escape(row.title)}</title>` +
      `<meta name="description" content="${escape(row.description)}">` +
      `</head><body><article><h1>${escape(row.title)}</h1>` +
      `<p><small>${escape(row.author)} · ${escape(row.category)} · ${escape(row.pub_date)}</small></p>` +
      hero +
      `<div class="article-prose">${row.body_html}</div>` +
      `</article></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/brief") {
      return writeBrief(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/publish") {
      return publish(request, env);
    }

    /* Hero görselleri R2'den. Yol, frontmatter'daki `heroImage` ile aynı olmak
     * zorunda: arşivdeki 587 haber `/images/generated/equinox-haber/<slug>.webp`
     * adresini taşıyor ve D1'den gelen haber farklı bir adres kullanırsa göç
     * sırasında iki ayrı şema oluşur. */
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
        `SELECT slug, title, category, author, pub_date, render_version
           FROM articles WHERE is_draft = 0 ORDER BY pub_date DESC LIMIT 20`,
      ).all();
      return json({ articles: rows.results });
    }

    const article = /^\/([a-z0-9-]+)\/?$/u.exec(url.pathname);
    if (request.method === "GET" && article) {
      return readArticle(article[1], env);
    }

    return json({ error: "bulunamadı" }, 404);
  },
} satisfies ExportedHandler<Env>;
