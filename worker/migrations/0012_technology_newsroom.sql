-- Equinox Haber 2.0: eski 580 kaydın URL'si, kategorisi, yazarı ve gövdesi korunur.
-- Eski category CHECK aynen kalır; yeni haberler kategori='Teknoloji' ve
-- tech_category ile saklanır, böylece mevcut tabloyu riskli biçimde rebuild etmeyiz.
ALTER TABLE articles ADD COLUMN publication_era TEXT NOT NULL DEFAULT 'legacy'
  CHECK (publication_era IN ('legacy', 'technology'));
ALTER TABLE articles ADD COLUMN tech_category TEXT
  CHECK (tech_category IS NULL OR tech_category IN (
    'yapay-zeka','yazilim','donanim','siber-guvenlik',
    'dijital-dunya','teknoloji-sektoru'
  ));
ALTER TABLE articles ADD COLUMN orbit_actor_subject TEXT;
CREATE INDEX articles_technology_stream
  ON articles (publication_era, is_draft, pub_date DESC);
CREATE INDEX articles_technology_category
  ON articles (publication_era, tech_category, is_draft, pub_date DESC);
CREATE INDEX articles_technology_owner
  ON articles (orbit_actor_subject, pub_date DESC);

-- Her düzenleme öncesi sürüm, yeniden yazılmadan önce snapshot olarak tutulur.
-- Haber sahibi kimliği article row'da; burada gerçek eylemi yapan kimlik.
CREATE TABLE article_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL REFERENCES articles(slug),
  action TEXT NOT NULL CHECK (action IN ('edit','withdraw','restore')),
  previous_body_md TEXT NOT NULL,
  previous_category TEXT NOT NULL,
  previous_sources_json TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX article_revisions_slug ON article_revisions (slug, created_at DESC);
