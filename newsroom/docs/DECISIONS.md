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

## K6 — Hero görsel sağlayıcısı Faz 3'e ertelendi

**Karar: Samet.** Faz 0, 2026-08-01.

`openclaw` CLI kalmayacak. Yerine ne geleceği belirsiz; Codex'in kendi görsel
üretimi kotadan yiyor. Hemera'nın ön önerisi kategori/başlığa göre yerelde
deterministik üretilen kapak görseli (marjinal maliyet sıfır, kota yok, asla
başarısız olmaz), ama bu görsel dilde bir değişiklik olduğu için tasarım kararı.

Hero katmanı sağlayıcıdan bağımsız arayüz arkasına konacak; seçenekler Faz 3'te
görselleriyle sunulacak.
