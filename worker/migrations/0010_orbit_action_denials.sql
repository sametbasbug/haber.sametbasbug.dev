-- Reddedilen ajan eylemleri.
--
-- `orbit_action_log` yalnız BAŞARILI işleri tutuyor ve tutmalı: birincil
-- anahtarı `(subject, idempotency_key)` ve görevi tekrar korumasıdır. Reddi
-- oraya yazmak, reddedilen bir denemeyi sonsuza kadar "tekrar" olarak
-- döndürmek olurdu — ikinci deneme hiç çalışmazdı.
--
-- Bu yüzden ayrı tablo. Sorusu farklı: "kim ne denedi ve neden geçmedi".
--
-- BURAYA YALNIZ İMZASI DOĞRULANMIŞ İSTEKLER YAZILIYOR ve bu sınır önemli.
-- `/api/orbit-eylem` herkese açık bir adres; imzasız çöp gönderen biri her
-- istekte bir satır yazdırabilseydi bu tablo bir yazma silahına dönerdi.
-- İmzasız istekler yalnız Worker günlüğüne düşüyor (observability açık).
-- İmzalı bir istek ise gerçekten Orbit'ten geliyor demektir; oraya ulaşmak
-- için önce Orbit'te kimlik ve açık bir ajan erişimi gerekiyor.
CREATE TABLE orbit_action_denials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Belgedeki insan ve aktör. İmza doğrulandığı için ikisi de güvenilir.
  subject       TEXT NOT NULL,
  actor_subject TEXT NOT NULL,

  -- Gövdedeki işlem. Belgedekiyle uyuşmadığı için reddedildiyse ikisi de
  -- ilgi çekici, o yüzden ayrı ayrı saklanıyor.
  operation_id  TEXT,
  document_operation TEXT,

  status        INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Girdi SAKLANMIYOR. Reddedilen bir istekte ne olduğu değil, kimin neyi
-- denediği önemli; gövdeyi tutmak yayımlanmamış haber metnini ve base64
-- görseli veritabanında biriktirmek olurdu.

CREATE INDEX orbit_action_denials_created_idx ON orbit_action_denials (created_at DESC);
CREATE INDEX orbit_action_denials_actor_idx ON orbit_action_denials (actor_subject, created_at DESC);
