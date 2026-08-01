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

## A1 — Açık: `heroAlt` hiçbir şablonda okunmuyor

**Bulgu: Hemera.** Faz 3, 2026-08-01. **Karar bekliyor.**

Kabul sözleşmesi her yayında `heroAlt` istiyor ve Asteria her seferinde
üretiyor. Ancak `src/` altındaki hiçbir şablon bu alanı okumuyor; tüm `<img>`
etiketleri `alt=""` kullanıyor.

Ayrıca hero görseli makale sayfasında gösterilmiyor. Şablonlarda yalnız kart
listelerinde (`NewsCard`, `FeaturedNewsShell`), `og:image` ve JSON-LD alanlarında
kullanılıyor. Üretilen şey makale görseli değil, küçük resim ve sosyal önizleme.

Seçenekler: (a) `heroAlt`'ı şablonlara bağlamak, (b) sözleşmeden çıkarmak.
Görseller gerçekten dekoratifse `alt=""` doğru uygulamadır ve `heroAlt` ölü
veridir. Bu bir tasarım/erişilebilirlik kararı; K6 hero kararıyla birlikte
görüşülmeli.

---

## A2 — Açık: canlıda 193 yayının adresi İngilizce

**Bulgu: Hemera.** Faz 3, 2026-08-01. **Karar bekliyor.**

585 yayının 193'ünde (%33) slug, Türkçe başlıktan değil kaynağın İngilizce
manşetinden türemiş. Nisan'da 148, kapı döneminde hâlâ 45 (%13).

Bazıları yarı çevrilmiş durumda:

    airbnb-co-founder-taps-peter-arnell-as-first-abd-chief-brand-architect
    a-deal-is-a-deal-von-der-leyen-fires-back-at-trump-over-auto-tariff-threat

Yeni `publish.slugify` slug'ı her zaman Türkçe başlıktan türetir ve
`tests/test_publish.py` bunu sabitler; ileriye dönük sorun kapanıyor.

Mevcut adresler ayrı bir konu: değiştirmek bağlantıları kırar, bırakmak Türkçe
bir yayında İngilizce adresler bırakır. Yönlendirmeli bir düzeltme mümkün ama
kapsamı bu işin dışında.
