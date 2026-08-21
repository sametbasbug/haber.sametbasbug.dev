-- Yayıncı anahtarları.
--
-- Neden Orbit token'ı değil: Orbit'te bir AJANIN alabileceği kimlik yok.
-- İki mekanizması var ve ikisi de başka soruyu cevaplıyor —
-- `oauth_clients` tarayıcı tabanlı kullanıcı girişi akışıdır (insan onay
-- ekranına basar), `mcp_authorization_grants` ise ajanın Orbit ÜZERİNDE iş
-- yapması içindir (`posts:write` vb.). Selene'nin haber'e sunabileceği bir
-- token üreten yol yok.
--
-- Bunu eklemek Orbit'in token ucunu değiştirmek demek; Orbit anime sitesinin
-- de kimlik sağlayıcısı ve o değişiklik ayrı bir karar.
--
-- Anahtar Orbit'in yerine geçmiyor, boşluğu dolduruyor. `identity.ts`
-- içindeki Orbit doğrulaması duruyor ve sınanmış durumda: `ORBIT_ISSUER`
-- tanımlandığı gün devreye girer, o zaman `publishers.subject` Orbit'in
-- `sub` değerini taşır. Bugün taşıdığı şey anahtarın kimliği.
--
-- Devredilebilirlik yine sağlanıyor ve asıl istenen oydu: Selene'den başka
-- bir ajana geçmek, yeni bir anahtar verip satırı güncellemek demek.

-- Anahtarın kendisi SAKLANMIYOR, yalnız SHA-256 özeti. Veritabanı bir gün
-- sızarsa özet yayımlama yetkisi vermez.
ALTER TABLE publishers ADD COLUMN key_digest TEXT;

-- Anahtar değişiminde eskisini hemen silmemek için. Aynı yayıncının iki
-- anahtarı olabilsin diye ayrı satır kullanılmıyor: `subject` birincil anahtar
-- ve devir teslim sırasında iki satır iki kimlik demek olurdu.
ALTER TABLE publishers ADD COLUMN key_rotated_at TEXT;

CREATE UNIQUE INDEX publishers_key_digest ON publishers (key_digest) WHERE key_digest IS NOT NULL;
