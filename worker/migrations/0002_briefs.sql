-- Pano sunucu tarafına taşınıyor.
--
-- Neden: `publish` panoyu yükün içinde alırken "panoda olmayan aday" ve
-- "çevrilmemiş başlık" kapıları, ajanın kendi beyan ettiği panoya karşı
-- ölçüyordu. Kapılar duruyordu ama kandırılabiliyordu — yayımlamak isteyen
-- taraf, kapının ölçtüğü referansı da kendisi yazıyordu.
--
-- Panonun yazılması ile haberin yayımlanması artık iki ayrı işlem ve iki ayrı
-- yetki. Pano önce sabitlenir, haber sonra ona karşı ölçülür. Bu, aynı ajan
-- ikisini de yapıyorken bile bir şey kazandırır: aday listesi haber
-- yazılmadan önce donar, sonradan haberi haklı çıkaracak şekilde
-- şekillendirilemez.

CREATE TABLE briefs (
  id           TEXT PRIMARY KEY,

  -- Brief'in tamamı. Kapılar `board` ve `task.selectCount` alanlarını okuyor;
  -- gerisi (liveContext, pipeline) denetim izi olarak duruyor.
  payload      TEXT NOT NULL,

  -- Politikanın içerik parmak izi. `newsroom.brief.policy_fingerprint` ile
  -- aynı değer. Ajanın okuduğu politika ile sistemin varsaydığı politika
  -- ayrıştığında bu fark görünür olsun diye taşınıyor.
  policy_fingerprint TEXT,

  created_at   TEXT NOT NULL,

  -- Bayat pano gerçek bir arıza biçimi: araya başka bir çevrim girmişse
  -- brief'in gösterdiği dünya artık yok. Çevrim saat başı olduğu için
  -- pencere geniş tutuldu; amaç tazelik denetimi değil, sınırsız birikmeyi
  -- ve çok eski bir panonun sessizce kullanılmasını engellemek.
  expires_at   TEXT NOT NULL,

  -- Yayın haber başına atomik, ama çevrim başına bir panodur. Tüketilmiş bir
  -- pano ikinci bir haber için kullanılamaz; `selectCount` kaç haber
  -- seçilebileceğini söyler, kaç kez yayımlanabileceğini değil.
  consumed_at  TEXT
);

CREATE INDEX briefs_expires ON briefs (expires_at);
