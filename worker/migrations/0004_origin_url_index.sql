-- `origin_url` benzersizliği kısıttan koda taşınıyor.
--
-- Göç sırasında arşiv bu kısıtı reddetti ve reddetmesi doğruydu: 587 haberin
-- 16'sı, 8 kaynağı ikişer kez kullanıyor. Her çift aynı haberin iki sürümü —
-- biri İngilizce slug'la (kaynağın manşetinden türemiş), biri Türkçe. Bu, eski
-- sistemin bilinen davranışı ve `newsroom.publish.slugify` docstring'inde
-- anlatılıyor.
--
-- Karar: arşiv olduğu gibi taşınır. Göçün içerik temizliği yapması yanlış
-- olurdu — hangi sürümün kalacağı editoryal bir karar ve göç betiğinin
-- vereceği bir karar değil. Sekiz çift Samet'e ayrıca bildirildi.
--
-- Yeni tekrarları engelleyen şey kısıt değil, `publish()` içindeki sorgu
-- ("bu kaynak zaten yayında"). Python tarafı da aynı şekilde çalışıyor:
-- `live.LiveIndex.has_url` bir tarama yapar, veritabanı kısıtı kullanmaz.
-- Kısıtı kaldırmak bu yüzden bir gevşetme değil, iki uygulamayı hizalama.
--
-- İndeks kalıyor: kapının sorgusu ona dayanıyor ve tarama başına maliyeti o
-- belirliyor.

DROP INDEX articles_origin_url;
CREATE INDEX articles_origin_url ON articles (origin_url);
