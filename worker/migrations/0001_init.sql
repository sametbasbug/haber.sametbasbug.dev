-- Equinox Haber — yayın deposu.
--
-- Şema `src/content.config.ts` içindeki koleksiyon şemasının aynasıdır. Oradaki
-- bir alan burada yoksa göç eksik demektir; `tools/parity-schema.mjs` bu
-- eşleşmeyi denetler.
--
-- Tasarım kararı — neden hem markdown hem HTML saklanıyor:
--
-- `body_md` gerçek kaynaktır. Düzeltme onun üzerinde yapılır, yeniden render
-- ondan üretilir. `body_html` yazma anında bir kez üretilmiş çıktıdır (bkz.
-- `src/render.ts`). Okuma yolunda markdown ayrıştırması yapılmaz; bu, Astro
-- build kapısının verdiği "bu haber gerçekten render oluyor" garantisini
-- koruma biçimimizdir: render başarısızsa yazma hiç gerçekleşmez.
--
-- `render_version` renderer değiştiğinde neyin bayatladığını söyler. Sürüm
-- atlandığında eski satırlar toplu yeniden render edilir; hangi satırın
-- yenilenmesi gerektiği tahmin edilmez, sorgulanır.

CREATE TABLE articles (
  slug            TEXT PRIMARY KEY,

  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('Siyaset','Ekonomi','Teknoloji','Bilim')),
  author          TEXT NOT NULL,

  body_md         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  render_version  INTEGER NOT NULL,

  hero_image      TEXT,
  -- `heroAlt` yalnız ekrandaki görseli gerçekten anlatıyorsa yazılır. Stok
  -- yedeğine düşüldüğünde NULL kalır ve şablonlar başlığa düşer; yanlış alt
  -- metin eksik alt metinden kötüdür (bkz. newsroom/docs/DECISIONS.md A1).
  hero_alt        TEXT,

  pub_date        TEXT NOT NULL,
  updated_date    TEXT NOT NULL,

  is_draft        INTEGER NOT NULL DEFAULT 0 CHECK (is_draft IN (0,1)),
  breaking        INTEGER NOT NULL DEFAULT 0 CHECK (breaking IN (0,1)),
  editor_pick     INTEGER NOT NULL DEFAULT 0 CHECK (editor_pick IN (0,1)),

  -- Tekrar yayın kapısı için. `origin_url` adayın kaynak yayınının
  -- kanonikleştirilmiş adresidir; `newsroom.live.LiveIndex.has_url` ile aynı
  -- soruyu sorar. Başlık benzerliği ayrı bir kapı olduğu için burada değil,
  -- `title` üzerinden çalışma anında ölçülür.
  origin_url      TEXT,

  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Arşiv ve ana sayfa listelemesi. Taslaklar listelemeye girmez.
CREATE INDEX articles_pub_date ON articles (is_draft, pub_date DESC);
CREATE INDEX articles_category ON articles (is_draft, category, pub_date DESC);
CREATE UNIQUE INDEX articles_origin_url ON articles (origin_url) WHERE origin_url IS NOT NULL;

-- Etiketler ayrı tabloda: etiket sayfaları etikete göre sorgulanıyor, JSON
-- sütunu bu sorguyu indekslenemez hale getirirdi.
CREATE TABLE article_tags (
  slug      TEXT NOT NULL REFERENCES articles(slug) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  -- Sıra editoryal: ilk etiket haberin ana konusudur, alfabetik değildir.
  position  INTEGER NOT NULL,
  PRIMARY KEY (slug, tag)
);

CREATE INDEX article_tags_tag ON article_tags (tag);

CREATE TABLE article_sources (
  slug      TEXT NOT NULL REFERENCES articles(slug) ON DELETE CASCADE,
  -- 0 ana kaynaktır; `render()` ilkini "Ana kaynak", kalanını "Ek kaynaklar"
  -- başlığı altında yazıyor. Sıra bu yüzden anlamlıdır.
  position  INTEGER NOT NULL,
  name      TEXT NOT NULL,
  url       TEXT NOT NULL,
  PRIMARY KEY (slug, position)
);
