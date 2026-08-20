-- Kimin yayımlayabileceği.
--
-- Orbit KİM olduğunu söyler, ne yapabileceğini değil. Bu bir eksiklik değil,
-- Orbit'in açık kararı: site kapsamları (`openid`, `profile`, `email`,
-- `orbit.graph.read`, `orbit.posts.read`) tamamı okuma yetkisidir ve
-- `site-authorization-scopes.ts` "ajan adına yazma yetkisi" verilmediğini
-- gerekçesiyle yazar — bir siteye giriş izni, o sitenin kullanıcı adına
-- konuşmasına dönüşemez.
--
-- Dolayısıyla yayımlama yetkisi Orbit'ten ithal edilmez, burada verilir.
-- Orbit'in ID token'ı kapıdan kimin geçtiğini kanıtlar; bu tablo o kişinin
-- yayımlayıp yayımlayamayacağını söyler.

CREATE TABLE publishers (
  -- Orbit ID token'ındaki `sub`. Siteye özel türetilmiş kimlik; Orbit'in iç
  -- hesap kimliği DEĞİL. Handle da değil: handle geri alınabiliyor ve ortak
  -- havuzdan geliyor, anahtar olarak kullanılırsa ilk devir teslimde iki
  -- yayıncı birbirine karışır (Orbit 0038/0039).
  subject      TEXT PRIMARY KEY,

  -- Yayın imzası. Model yanıtının parçası değildir ve olmayacaktır:
  -- operasyonel metadata olarak sistem tarafından belirlenir, böylece bir
  -- operatör yanlışlıkla başkasının imzasıyla yayımlayamaz.
  -- `newsroom.publish.SUPPORTED_AUTHORS` ile aynı hizada olmalı.
  author       TEXT NOT NULL,

  -- Panoyu sabitleyebilir mi / haber yayımlayabilir mi. İkisi ayrı, çünkü
  -- panoyu kuran taraf ile haberi yazan taraf aynı olmak zorunda değil;
  -- ayrıldıklarında pano güveni gerçek bir güvence haline gelir.
  may_write_brief  INTEGER NOT NULL DEFAULT 0 CHECK (may_write_brief IN (0,1)),
  may_publish      INTEGER NOT NULL DEFAULT 0 CHECK (may_publish IN (0,1)),

  -- Erişimi silmeden kapatabilmek için. Silmek denetim izini de siler;
  -- kapatmak izi bırakır.
  disabled_at  TEXT,

  note         TEXT,
  created_at   TEXT NOT NULL
);
