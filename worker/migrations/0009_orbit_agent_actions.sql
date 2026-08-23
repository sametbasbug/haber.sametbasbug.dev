-- Ajan eylemleri: Orbit üzerinden devretme.
--
-- 0005'in tepesindeki gerekçe artık geçerli DEĞİL. O tarihte "Orbit'te bir
-- ajanın alabileceği kimlik yok" doğruydu; 23 Ağustos 2026'da Orbit'e bağlı
-- site eylemleri eklendi ve boşluk kapandı. Akış şu:
--
--   insan Orbit panelinde Haber için ajan erişimini açar
--     → ajan Orbit'e "Haber'de şu işlemi yap" der
--       → ORBIT siteye gelir, 60 saniyelik ES256 imzalı bir belgeyle
--
-- Ajanın elinde Haber'e ait hiçbir sır yoktur ve olmamalıdır: saklama yeri
-- olmayan istemcilerde çalışmaz, ve insan Orbit'ten kapattığında ortalıkta
-- yaşamaya devam eden bir anahtar kalır. Yayıncı anahtarı yolu bu göçle
-- KAPANMIYOR — geçiş sırasında ikisi birden çalışmalı, yoksa Selene bir anda
-- yayımlayamaz hale gelir. Kapatmak `key_digest` sütununu boşaltmakla olur.

-- Ajan satırları. `subject` artık iki şey taşıyabiliyor:
--   * insanın Orbit `sub`'u        → o insan kendi yayımlıyor
--   * `agent:<orbit ajan kimliği>` → o ajan bir insanın adına yayımlıyor
--
-- İkincisinde `acts_for` kimin adına olduğunu söyler ve BOŞ BIRAKILAMAZ:
-- eylem belgesindeki `sub` ile eşleşmezse istek reddedilir. Yani "Selene
-- yayımlayabilir" değil, "Selene, Samet'in adına yayımlayabilir" yazıyor.
ALTER TABLE publishers ADD COLUMN acts_for TEXT;

-- Yayın imzası yine `publishers.author`tan geliyor, eylem belgesindeki
-- `act.handle`tan değil. Handle Orbit'te geri alınabiliyor ve devredilebiliyor;
-- imzayı ona bağlamak, ilk devir tesliminde arşivdeki yazarı değiştirirdi.

-- Tekrar koruması.
--
-- Orbit ajanın verdiği `Idempotency-Key`i olduğu gibi bize taşıyor ve tekrarı
-- ÇÖZMÜYOR — o bizim işimiz. Ajan tarafı yeniden denemeye yatkın; anahtarsız
-- bir tekrar, aynı haberi ikinci kez yayımlamak demek. Yayının kendi kapıları
-- (pano `consumed_at`, slug tekilliği, başlık benzerliği) çoğu tekrarı zaten
-- durdurur, ama onlar 409 döner — ajan için "başarısız" demektir. Bu tablo
-- ilk çalışmanın cevabını aynen döndürmeyi mümkün kılıyor.
CREATE TABLE orbit_action_log (
  -- İnsanın pairwise `sub`'u. Anahtar ajanın değil insanın kapsamında tekil:
  -- iki ajan aynı anahtarı üretirse bu bir çakışmadır ve öyle görünmeli.
  subject         TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation_id    TEXT NOT NULL,

  -- Gövdenin özeti. Aynı anahtar FARKLI gövdeyle gelirse bu bir tekrar değil
  -- çakışmadır (409): sessizce ilk cevabı döndürmek, ajanın yaptığını sandığı
  -- işin hiç yapılmaması olurdu.
  input_digest    TEXT NOT NULL,

  -- İlk çalışmanın çıktısı, JSON. Tekrar geldiğinde aynen dönüyor.
  output          TEXT NOT NULL,

  -- Kimin yaptığı kaybolmasın. İş insanın adına ama aktör ajan (RFC 8693).
  actor_subject   TEXT NOT NULL,
  created_at      TEXT NOT NULL,

  PRIMARY KEY (subject, idempotency_key)
);

CREATE INDEX orbit_action_log_created_idx ON orbit_action_log (created_at DESC);
