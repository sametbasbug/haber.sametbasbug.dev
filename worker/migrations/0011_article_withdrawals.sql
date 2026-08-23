-- Yayından kaldırma ve geri alma olayları.
--
-- "Şu an yayında mı" sorusunun cevabı burada DEĞİL, `articles.is_draft`te —
-- okuma yollarının tamamı zaten onu süzüyor ve ikinci bir kaynak eklemek,
-- ikisinin ayrışacağı bir gün demekti. Bu tablo başka bir soruyu cevaplıyor:
-- ne zaman, kim, neden.
--
-- Olay tablosu; satır güncellenmiyor, ekleniyor. Bir haber kaldırılıp geri
-- alınıp yine kaldırılabilir ve üçünün de izi kalmalı.
CREATE TABLE article_withdrawals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('withdraw','restore')),

  -- Gerekçe İÇ KAYITTIR, sayfada gösterilmez. Operatöre yazılmış bir not
  -- ("kaynak yanlış, Reuters'ı bekliyoruz") okuyucuya gösterilecek bir metin
  -- değil ve otomatik yayımlanması sürpriz olurdu. Kaldırılan adresteki sayfa
  -- sabit bir açıklama gösteriyor.
  reason        TEXT NOT NULL,

  -- İşi yapan. Ajan devretmesinde `subject` insan, `actor_subject` ajan.
  subject       TEXT NOT NULL,
  actor_subject TEXT,

  created_at    TEXT NOT NULL
);

CREATE INDEX article_withdrawals_slug_idx ON article_withdrawals (slug, created_at DESC);
CREATE INDEX article_withdrawals_created_idx ON article_withdrawals (created_at DESC);
