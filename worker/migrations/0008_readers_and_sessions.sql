-- Orbit ile giriş yapan insanlar ve oturumları.
--
-- Anahtar `orbit_subject`: Orbit'in bu siteye özel verdiği `sub` claim'i.
-- Orbit'in iç `accounts.id` değeri DEĞİL ve handle da değil. Handle geri
-- alınabiliyor ve ortak havuzdan geliyor; birincil anahtar yapılırsa ilk
-- devir teslimde iki kullanıcı birbirine karışır. Orbit `sub`'ı istemci
-- başına türetiyor (pairwise), yani bu değer yalnız haber için anlamlı.
CREATE TABLE readers (
  id TEXT PRIMARY KEY,
  orbit_subject TEXT NOT NULL UNIQUE,
  -- Profil alanları YEREL BİR KOPYADIR, doğruluk kaynağı değil. Kullanıcı
  -- Orbit'te adını değiştirdiğinde burası bir sonraki girişte tazeleniyor.
  -- Görüntülemek için saklanıyor; her sayfa için Orbit'e sormak, Orbit'in
  -- kesintisini haberin kesintisi yapardı.
  display_name TEXT,
  picture_url TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- Oturumlar.
--
-- Çerezdeki değer `<selector>.<secret>` biçiminde. İkiye ayrılmasının sebebi:
-- arama `selector` üzerinden indeksli yapılıyor, doğrulama ise `secret`in
-- özetiyle. Tek parça olsaydı ya özeti indekslemek (zamanlama sızıntısına
-- açık eşitlik araması) ya da bütün satırları taramak gerekirdi.
--
-- `secret` HİÇ SAKLANMIYOR, yalnız SHA-256 özeti. Veritabanı sızarsa
-- oturumlar ele geçirilemez.
CREATE TABLE reader_sessions (
  selector TEXT PRIMARY KEY,
  secret_digest TEXT NOT NULL,
  reader_id TEXT NOT NULL REFERENCES readers(id),
  created_at INTEGER NOT NULL,
  -- Mutlak son. Yenileme yok: bu sitede oturumun uzunluğu bir rahatlık
  -- tercihi, ve kendiliğinden sönmeyen bir oturum bir gün sönmez.
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX reader_sessions_reader_idx ON reader_sessions (reader_id, created_at DESC);
CREATE INDEX reader_sessions_expiry_idx ON reader_sessions (expires_at);
