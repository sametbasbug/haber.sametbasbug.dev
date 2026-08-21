-- İçerik sürümü — önbellek geçersizleştirmesi için.
--
-- Sorun ölçülerek görüldü: kenar önbelleği D1 okumasını zorunlu kıldı (sayfa
-- başına 4225 satır, ücretsiz planda günde 5M) ama 60 saniyelik pencere
-- boyunca yeni yayımlanan haber LİSTE sayfalarında görünmüyordu. Haber kendi
-- adresinde anında çıkıyor, ana sayfada bir dakika gecikiyordu.
--
-- Bu sistemin varlık sebebi "tak diye yansısın". Bir dakikalık gecikme, beş
-- dakikalık derleme turundan iyi ama istenen şey değil.
--
-- Çözüm: önbellek anahtarına bir sürüm karışıyor. Yayın ve düzeltme bu sayıyı
-- artırıyor, artan sayı bütün eski anahtarları ulaşılamaz kılıyor. Cloudflare
-- Cache API'sinin `delete()`'i yalnız isteğin düştüğü veri merkezini temizler,
-- yani gerçek bir geçersizleştirme aracı değil; sürüm anahtarı her yerde
-- çalışır.
--
-- Maliyet: istek başına bir satır okuma. Önbellek isabetinde toplam maliyet
-- 4225 satırdan 1 satıra iniyor.
--
-- SÖZLEŞME: `publish()` bu sayıyı kendi artırıyor. `publish()` DIŞINDAN yapılan
-- her içerik değişikliği — göç, silme, elle düzeltme — artırmak ZORUNDA.
-- Unutulduğunda belirti sinsi: veritabanı doğru, sayfa eski. Bu tam olarak
-- test harness'ında yaşandı ve ancak sayfa denkliği düştüğü için görüldü.
--
-- Sayıyı veriden türetmek (count + max(updated_at)) sözleşmeyi gereksiz
-- kılardı ama `count(*)` bütün tabloyu tarıyor: istek başına 1 satır yerine
-- 587 satır. Bu yüzden sayaç tercih edildi.

CREATE TABLE site_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  -- Her yayın, düzeltme ve silmede artar. Değeri anlam taşımaz, DEĞİŞMESİ
  -- anlam taşır.
  content_version INTEGER NOT NULL,
  updated_at    TEXT NOT NULL
);

INSERT INTO site_state (id, content_version, updated_at)
  VALUES (1, 1, '2026-08-21T04:00:00+03:00');
