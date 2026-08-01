# Karar Kaydı

Sıfırdan kurum sırasında alınan, koddan okunamayan kararlar. Her madde kimin
kararı olduğunu belirtir.

---

## K1 — Kaynak havuzundan Türkçe kaynaklar çıkarılacak

**Karar: Samet.** Faz 1, 2026-08-01. **Durum: uygulanacak iş yoktu.**

Karar `POLICY.md` §1 ile uyumlu: yayın global odaklı, yerel Türkiye gündemi öne
çıkarılmaz.

Ancak taşımaya geçildiğinde görüldü ki **mevcut `sources.yaml`'da Türkçe kaynak
yok** — 38 kaynağın tamamı uluslararası. Diken, Kısa Dalga ve Medyascope daha
önce bir noktada havuzdan çıkarılmış; test korpusundaki 71 Türkçe kayıt eski
normalize verisinden, yani o kaynakların hâlâ etkin olduğu dönemden geliyor.

Yeni havuz bu haliyle taşındı; çıkarılacak bir şey olmadı.

Uygulama notu: `tests/conftest.py` içindeki `TURKISH_LANGUAGE_SOURCES` bu
kaynakları dil testlerinde negatif kümeden çıkarmak için duruyor; korpus geçmişe
ait olduğundan bu liste kaynak havuzundan bağımsız olarak kalır.

---

## K7 — Kaynak kalitesi etiketi (`source_quality`) taşınmadı

**Karar: Hemera.** Faz 1, 2026-08-01.

Eski `sources.yaml` her kaynağa `trusted / usable / noisy / restricted` etiketi
veriyor ve bu etiket board ceza puanlarını besliyordu.

Taşınmadı. Kaynak kalitesi sıralaması `GATE_INVENTORY.md` J1 kapsamında yargıdır
ve `POLICY.md` §2'ye taşındı. `restricted` ise ayrı bir alan gerektirmiyor:
paywall'lu sayfa yeterli metin vermiyor ve aday mekanik olarak düşüyor.

Gerçek çalıştırmada doğrulandı: Politico Europe, hiçbir host listesi olmadan,
yalnız 171 karakter verdiği için elendi.

---

## K8 — Metin çıkarımı toplama sırasında değil, eleme sonrasında

**Karar: Hemera.** Faz 1, 2026-08-01.

Eski sistem her çevrimde 38 besleme **ve 116 haber sayfası** çekiyordu
(`snippet_limit` toplamı). Elenecek adayın metnini indirmenin karşılığı yok.

Yeni akışta toplama yalnız beslemeleri okur; tam metin sadece brief'e giren
adaylar için çekilir. Ölçülen: 38 besleme 2,4 saniyede, 462 tekil aday, sıfır
hata.

---

## K2 — Çevrim sıklığı saat başı, koşu başına 1 haber

**Karar: Samet.** Faz 1, 2026-08-01.

Saat başı bir çevrim, çevrim başına bir haber. Sistem oturur ve maliyet izin
verirse saat başı 2-3 habere çıkılabilir.

Tasarım sonucu: brief ve kabul sözleşmesi baştan **N seçim** destekleyecek
biçimde yazılır. "1" bir konfigürasyon değeridir, koda gömülmez.

---

## K3 — Paragraf sayısı hedef değil, yapı tanımı

**Karar: Hemera önerdi, Samet onayladı.** Faz 1, 2026-08-01.

Eski talimat "3-5 paragraf, çoğu haber için 3-4 yeterli" diyordu. 585 yayında
gerçekleşen: 5 paragraf en sık değer (335), 3 paragraf neredeyse yok (11).
Aralık verilen bir talimatta üst sınır hedefe dönüşüyor.

Yerine `POLICY.md` §4 her paragrafın işini tanımlıyor (ne oldu / somut detay /
bağlam veya karşı pozisyon / kapanış). Norm dört; üçe düşmek ve beşe çıkmak
gerekçe ister.

---

## K4 — Regresyon ölçütü "kapı dönemi" ile sınırlı

**Karar: Hemera.** Faz 1, 2026-08-01.

Nisan 2026 yayınları bugünkü kapılardan bazıları eklenmeden önce üretildi:
216 yayının 130'u 24 saatten eski kaynağa dayanıyor, hiçbirinde `heroAlt` yok.
Mayıs'tan itibaren her ikisi de kusursuz.

Regresyon testleri `GATE_ERA_START = "2026-05"` sonrasına bakar. Ölçüt "geçmişte
ne yapıldı" değil, "bugünkü kurallar yürürlükteyken ne üretildi".

---

## K5 — Bilinen kusurlu yayınlar kapıyı gevşetmez

**Karar: Hemera.** Faz 1, 2026-08-01.

Kapı dönemi içinde yayımlanmış beş haber bugünkü elemeyi geçemiyor: iki Guardian
canlı anlatım sayfası ve üç ileri tarihli kayıt. Bunlar yayın kusurudur.

`tests/test_screen.py:KNOWN_PUBLISHED_DEFECTS` içinde adlandırıldılar ve ayrı bir
test hâlâ yakalandıklarını doğruluyor. Eleme bu vakaları geçirecek biçimde
gevşetilmeyecek.

Açık iş: bu beş yayın hâlâ canlıda. Kaldırılıp kaldırılmayacakları editoryal
karardır, Samet'e bırakıldı.

---

## K6 — Hero görselleri Codex üretir

**Karar: Samet.** Faz 3, 2026-08-01. `openclaw` CLI kalkıyor, yerine Codex.

Değerlendirilip elenen yollar:

- **Kaynak haberin görselini kullanmak.** Elendi: haber görsellerinin neredeyse
  tamamı ajans fotoğrafı ve bir görselin telif durumu görsele bakarak
  belirlenemez. Doğrulanamayan bir şeyi doğrulanmış gibi kullanan kapı, kapı
  değildir. Yasal riske girmenin karşılığı yok.
- **Yerelde deterministik kapak görseli.** Elendi: hero ana sayfada 607×301
  boyutunda ve üstünde başlık yazılı olarak gösteriliyor; şablondan üretilmiş
  kapaklar hem zayıf kalır hem de aynı anda on tanesi döndüğü için tekdüzeleşir.
- **Yerelde SDXL çalıştırmak.** Şimdilik elendi: makine kaldırıyor (M4, 16 GB)
  ama kurulum ve bakım yükü, bu aşamada çözdüğünden fazla iş çıkarıyor.

Bilinen kısıt: Codex kotası **Nyx ile paylaşılıyor**. Kotanın tükenmesi Nyx'i de
kullanılamaz hale getirir. Bu yüzden hero üretimi savurgan olmamalı: aynı haber
için tekrar üretim yapılmaz, üretilen görsel diskte kalır.

Codex, uygulama üzerinden çalışır (CLI değil) ve görseli kendi üretir. Python'un
işi üretmek değil, üretilen dosyayı yayına uygun hâle getirmektir: 1200×675,
WebP, kalite 82, metadata temizlenmiş. Bu hedefler diskteki 327 görselden
ölçüldü — hepsi tam olarak bu biçimde.

Yedek sıralaması (Samet):

1. Slug için görsel zaten varsa yeniden üretilmez
2. Codex'in ürettiği dosya normalize edilir
3. Üretim yoksa **Pexels**'ten stok görsel alınır (`PEXELS_API_KEY` ortamdan
   okunur; anahtar repoya yazılmaz, komut satırından geçirilmez)
4. O da olmazsa haber hero'suz yayımlanır

Pexels seçimi mekaniktir: yatay, en az 1400 piksel genişlikte, daha önce
kullanılmamış ilk sonuç. Eski sistemdeki ayarlanmış puanlama tablosu taşınmadı.

Buna bağlı varsayım (Hemera): hero üretimi başarısız olursa **yayın durmaz,
haber hero'suz çıkar**. Şema `heroImage`'ı opsiyonel tutuyor ve şablonlar
yokluğunu karşılıyor. Bunun nadir bir istisna olması beklenir; sıklaşırsa
tasarım tarafında ayrıca konuşulmalıdır (Samet'in notu: hero'suz yayın norm
haline gelirse ana sayfa tasarımı değişmeli).

---

## A1 — Çözüldü: `heroAlt` sosyal önizlemeye bağlandı

**Karar: Hemera.** Faz 3, 2026-08-01.

`heroAlt` her yayında zorunluydu ama hiçbir şablon okumuyordu. Nedenine
bakarken daha büyük bir açık çıktı: `NewsLayout` `ogImage` prop'unu hiç
geçirmiyordu, dolayısıyla **her haber sosyal medyada jenerik `og-default.jpg`
ile paylaşılıyordu**, kendi hero'suyla değil. Canlıda doğrulandı.

Yapılanlar:

- Makale sayfası `og:image` ve `twitter:image` alanlarını kendi hero'suna
  bağlar; `og:image:alt` ve `twitter:image:alt` `heroAlt`'tan gelir, alanı
  olmayan eski yayınlarda başlığa düşer
- `heroAlt` `src/content.config.ts` şemasına eklendi — frontmatter'a yazılıyor
  ama zod tarafından eleniyordu, yani bir şablon istese bile okuyamazdı

Sayfa içindeki `alt=""` değerlerine dokunulmadı ve dokunulmamalı: hem
`NewsCard` hem `FeaturedNewsShell` görseli `aria-hidden` bir sarmalayıcı içinde,
komşusundaki başlık linkinin dekoratif tekrarı. Oraya alt metni koymak bir şey
kazandırmaz, çünkü `aria-hidden` onları erişilebilirlik ağacından zaten
çıkarıyor.

Sonuç: `heroAlt` kabul sözleşmesinde zorunlu kalır, çünkü artık gerçekten
kullanılıyor.

---

## A2 — Çözüldü: canlıdaki İngilizce adreslere dokunulmayacak

**Karar: Samet.** Faz 3, 2026-08-01.

585 yayının 193'ünde (%33) slug, Türkçe başlıktan değil kaynağın İngilizce
manşetinden türemiş. Nisan'da 148, kapı döneminde 45. Bazıları yarı çevrilmiş:

    airbnb-co-founder-taps-peter-arnell-as-first-abd-chief-brand-architect
    a-deal-is-a-deal-von-der-leyen-fires-back-at-trump-over-auto-tariff-threat

**İleriye dönük sorun kapalı:** `publish.slugify` slug'ı her zaman Türkçe
başlıktan türetir ve `tests/test_publish.py` bunu sabitler.

Mevcut adresler olduğu gibi bırakılıyor. Belirleyici kısıt: site GitHub Pages
üzerinde yayınlanıyor ve GitHub Pages sunucu tarafı yönlendirme desteklemiyor.
Gerçek 301 mümkün değil; yapılabilecek tek şey 193 adet `meta refresh` sayfası,
ki arama motorları için daha zayıf bir sinyal. Kozmetik tutarlılık karşılığında
193 zayıf yönlendirme ve bir arama geçmişi geçiş dönemi doğuruyor.

Yayın altyapısı ileride gerçek yönlendirme yapabilen bir yere taşınırsa bu
karar yeniden değerlendirilebilir.

---

## K9 — Asteria'nın teslim turunda bulduğu sekiz açık kapatıldı

**Karar: Hemera.** Faz 4, 2026-08-01.

Asteria'ya sistemi teslim ederken belgeleri ve kodu okuyup kusur bildirmesini
istedim. Sekiz bulgu getirdi; sekizi de kod ve belgeyle karşılaştırıldığında
doğru çıktı. Hepsi kapatıldı:

1. **`POLICY.md` kendi statüsüyle çelişiyordu** — başlıkta "0.1 (taslak)",
   sonunda "onaydan geçmeden referans alınmamalıdır" yazıyordu; oysa Samet
   belgeyi onaylamıştı. Sürüm 0.2 (yürürlükte) yapıldı. Asteria'nın haklı
   olarak söylediği gibi, statüsü belirsiz bir politikayla güvenle çalışılamaz.
2. **"En fazla bir haber" politikaya gömülüydü** — K2 seçim sayısının
   konfigürasyon olduğunu söylüyordu. §2 artık `task.selectCount`'a atıf yapar.
3. **`sourceText` 4000 karakterde kesiliyordu ama belge "tam metin" diyordu** —
   brief'e `sourceTextTruncated` alanı eklendi, RUNBOOK düzeltildi. Kesilmiş
   metnin devamı tahmin edilmez.
4. **Politika destekleyici kaynağa izin veriyordu, yanıt şemasında alanı yoktu**
   — 585 yayının yalnız 2'sinde ek kaynak var. Alan eklemek yerine politikadan
   kaldırıldı: bir çevrimde doğrulanmış tek metin adayın kendi metnidir, ikinci
   bir bağlantı doğrulanamayan bir adres olur. Uydurma bağlantı yüzeyi açmanın
   karşılığı yok.
5. **Tekrar kontrolü yalnız `prepare` aşamasındaydı** — brief ile yayın arasında
   zaman geçiyor. `publish` artık yazmadan önce canlıya URL ve başlık
   benzerliğiyle son bir kez bakar. Slug çakışması bunu ancak başlık birebir
   aynıysa yakalardı.
6. **Çoklu seçimde yayının atomikliği tanımsızdı** — davranış korundu ama
   yazıldı: atomiklik haber başınadır, koşu başına değil. Her haber kendi
   kapılarından geçer, kendi commit'ini alır.
7. **Etiket üst sınırı denetlenmiyordu** — politika "en çok altı" derken kod
   yalnız alt sınıra bakıyordu. `MAX_TAGS = 6` eklendi.
8. **Tarihsiz aday tazelik kapısını atlıyordu** — yaş ölçülemediğinde kapı
   sessizce açılıyordu, yani kural besleme kalitesine bağımlıydı. Artık
   `undated` koduyla elenir ve sayımda görünür.

Asteria'nın `heroAlt` için dil doğrulaması olmaması gözlemi de doğrudur ama
kasıtlıdır: `lang.py` kısa metne dil sınıflandırması uygulamaz, çünkü özel ad
yoğun kısa metinler hiçbir eşikte güvenilir sınıflanmaz. Yanlış ret riski,
kapının getirisinden büyük.

Not: bu turun kendisi bir yöntem kaydıdır. Sistemi kuran kişi kendi
belgelerindeki çelişkiyi göremiyor; okuyan görüyor.

---

## K10 — Gölge koşu iki hero kusuru gösterdi

**Karar: Hemera.** Faz 4, 2026-08-01. İlk uçtan uca gölge çalıştırma.

Asteria brief'i okudu, BBC World'ün İtalya sıcak hava haberini seçti ve yazdı.
Metin kapıların tamamından geçti; dokuz somut iddianın dokuzu da kaynakta
doğrulandı, uydurma yok. Pexels yedeği canlıda ilk kez çalıştı ve 1200×675
WebP üretti. Kusur metinde değil, görsel tarafındaydı.

**1. Stok araması Türkçe gidiyordu.** `_hero_queries` sorguyu etiketlerden
kuruyordu: "İtalya aşırı sıcak". Pexels ağırlıkla İngilizce indekslidir; sorgu
"İtalya"yı tuttu, sıcağı ıskaladı ve dönen fotoğraf serin havada, mont giymiş
kalabalık bir Floransa sokağı oldu. Sıcak hava dalgası haberinin altında.

Yanıt sözleşmesine zorunlu `heroQuery` alanı eklendi: iki-dört sözcük,
İngilizce. Maliyeti birkaç sözcük, karşılığı stok görselin haberle ilgili
olması. Etiketler yedekte kalır, alan verilmezse sistem durmaz.

**2. `heroAlt` var olmayan bir görseli anlatıyordu.** Asteria alt metnini
ürettirmek *istediği* görsel için yazar — "boş bir şehir caddesi". Stok yedeğine
düşüldüğünde ekrandaki fotoğraf başkadır ve alt metin ekran okuyucu kullanan
biri için sessiz bir yalana dönüşür.

Stok görsele düşüldüğünde `heroAlt` artık frontmatter'a yazılmıyor. Şablonlar
başlığa düşüyor (A1'de kurulan yedek). Yanlış alt metin, eksik alt metinden
kötüdür. Sağlayıcının kendi tarifi `heroStockDescription` olarak yayın raporuna
giriyor; operatör ekrana neyin çıktığını yayını açmadan görebiliyor.

Her ikisi de yalnız gerçek bir uçtan uca koşuda görünürdü: testler geçiyordu,
sözleşme geçiyordu, denetim geçiyordu. Yanlış olan tek şey ekrandaki resimdi.

---

## K11 — Stok görsel olayı değil, olayın alanını arar

**Karar: Samet.** Faz 4, 2026-08-01.

K10'daki `heroQuery` düzeltmesinden sonra sorgu "Italy heatwave" oldu ve gelen
fotoğraf haberle ilgiliydi — ama sağlayıcının kendi tarifine göre *gece
Piedmont'ta alevler önünde siluetler*, yani orman yangını değil şenlik ateşi.
Bir yangın haberinin altında yangın gibi duruyordu.

Sorun sorguda değil, stok fotoğrafın doğasındaydı: haber sahnesine benzeyen bir
stok kare, olmamış bir olayı olmuş gibi gösterir. Bu, kaynağın görselini
kullanmayı elediğimiz gerekçenin (K6) aynısıdır — doğrulanamayan bir görüntüyü
haberin görüntüsü diye sunmak.

Değerlendirilen üç yol:

- **Pexels'i tamamen çıkarmak.** Elendi: hero'suz yayın ana sayfa tasarımını
  zorluyor.
- **Olduğu gibi bırakmak.** Elendi: sahte olay görüntüsü gerçek bir güven
  maliyeti.
- **Seçilen:** stok terimi olayın kendisini değil **soyut karşılığını** arar —
  olgu, ortam, nesne, coğrafya. Olay anı değil, olayın alanı. `POLICY.md` §6
  örneklerle bunu tanımlar.

Bu kural mekanik olarak denetlenemez ve denetlenmeye çalışılmayacak: "bu kare
bir olay sahnesi mi" sorusu yargıdır. Kod tarafındaki karşılığı görünürlüktür —
`heroStockDescription` yayın raporunda sağlayıcının kendi tarifini taşır, yani
ekrana ne çıktığı yayını açmadan okunabilir.
