# Gate Envanteri — mevcut sistemden çıkarılan kapılar

Durum: Faz 0 · Kaynak: `news_pipeline/` (dondurulmuş), `scripts/asteria-editorial-gate.sh`

Bu belge mevcut üretim sisteminin uyguladığı **her** kapıyı kayda geçirir ve
her birini üç kovadan birine koyar. Amaç, sıfırdan kurarken pahalıya öğrenilmiş
dersleri kaybetmemek; kötü çözümleri ise bilinçli olarak geride bırakmak.

Sınıflandırma ilkesi:

- **M (mekanik)** — doğru/yanlış olarak karara bağlanır, insan yargısı gerekmez.
  Python'da kalır.
- **J (yargı)** — "daha iyi", "uygun", "yeterli" gibi bir değerlendirme gerektirir.
  `POLICY.md`'ye taşınır, Asteria uygular. Python'da **kod olarak yer almaz**.
- **D (düşer)** — semptomatik yama. Ne Python'da ne politikada yer alır.

---

## A. Mekanik kapılar — Python'da kalır

| # | Kapı | Bugünkü yer | Not |
|---|------|-------------|-----|
| M1 | Kaynak yaşı > 24s ise ele | `filtering.py:MAX_SOURCE_AGE_HOURS`, `heartbeat_publish_one._source_is_fresh` | Üç ayrı yerde ayrı ayrı uygulanıyor; tek yere iner |
| M2 | Yayın tarihi gelecekte (> 6s sapma) ise ele | `filtering.py:MAX_FUTURE_SKEW_HOURS` | Aynen korunur |
| M3 | Aynı URL zaten canlıda mı | `publish._assert_not_duplicate_live` | Aynen korunur |
| M4 | Başlık/description bulanık eşleşmeyle canlıda mı | `dedupe/similarity.py` + rapidfuzz | Eşik değeri korunur, konu-ailesi cezaları düşer (bkz. D3) |
| M5 | Kaynak metni minimum uzunluk altında mı | `MIN_THIN_SOURCE_TEXT_CHARS = 500` | Aday brief'e girmeden önce uygulanır |
| M6 | Sponsorlu/reklam URL işaretleri | `SPONSORED_URL_MARKERS` | Aynen korunur |
| M7 | Liveblog formatı | `filtering.py` `/live/` kontrolü | Format tespiti, içerik yargısı değil — kalır |
| M8 | Okunamayan/paywall host | `UNREADABLE_PRIMARY_HOSTS` | Sabit host listesi değil, çıkarma başarısızlığından türetilir |
| M9 | Başlık < 18 karakter | `filtering.py` | Aynen korunur |
| M10 | Gövde minimum uzunluk (520 karakter) | `MIN_AUTOPUBLISH_BODY_LENGTH` | Asteria çıktısının kabul sözleşmesine iner |
| M11 | Minimum fact sayısı (2) | `MIN_AUTOPUBLISH_FACTS` | Kabul sözleşmesi |
| M12 | Zorunlu alanlar: heroPrompt, heroAlt, kategori, kaynak | `has_hero_brief`, frontmatter şeması | Kabul sözleşmesi; `src/content.config.ts` şemasıyla hizalanır |
| M13 | Kategori geçerli enum içinde mi | `content.config.ts` | Şema kaynak-doğru; Python enum'u ondan türetir |
| M14 | Türkçe dil kontrolü | `looks_too_english` + 3 kelime listesi | **Mekanik ama kötü uygulanmış** — bkz. aşağıda |
| M15 | İç not sızıntısı (`manual-review`, `source-profile` vb.) | `audit-content` | Aynen korunur, kritik |
| M16 | Görsel bütünlüğü: kırık/politika/yakın tekrar | `audit-images` | Aynen korunur |
| M17 | Astro build geçiyor mu | `npm run build` | Aynen korunur |
| M18 | Commit diff'i yalnız içerik dosyalarına mı dokunuyor | `_is_content_only_publish_change` | Aynen korunur, kritik güvenlik kapısı |
| M19 | Aynı wake'te ikinci koşu guard'ı | `_recent_cycle_guard` | Zamanlayıcı Codex'e geçtiği için yeniden tasarlanır |

### M14 hakkında ayrı not

Türkçe kontrolü mekanik bir kapıdır ve kalmalıdır — ama bugünkü uygulaması üç el
yapımı kelime listesine (`ENGLISH_MARKERS`, `TURKISH_MARKERS`,
`TURKISH_MORPHOLOGY_RE`) ve bunların üstüne yığılmış üç ayrı istisna fonksiyonuna
dayanıyor (`looks_too_english`, `body_looks_too_english`, `fact_looks_too_english`).
Her istisna somut bir yanlış-ret vakasından sonra eklenmiş; kod yorumları bunu
açıkça söylüyor ("the Stilta description from 2026-05-19").

Yeni sistemde bu, kelime listesi değil ölçüm olacak: Türkçe karakter oranı +
biçimbirim örüntüsü + İngilizce durak sözcük yoğunluğu üzerinden tek bir eşik,
tek bir fonksiyon, tüm alanlar için aynı. Özel adların ("Institute for the Study
of War") kapıyı tetiklememesi istisna değil, ölçümün doğal sonucu olmalı.

---

## B. Yargı kuralları — `POLICY.md`'ye taşınır

Bunların hiçbiri yeni Python paketinde kod olarak bulunmayacak.

| # | Kural | Bugünkü yer |
|---|-------|-------------|
| J1 | Kaynak kalitesi/güveni sıralaması | `scoring.py:SOURCE_WEIGHTS`, `source_priority.py:SOURCE_NAME_WEIGHTS` |
| J2 | Kategori önceliği | `scoring.py:CATEGORY_WEIGHTS` |
| J3 | Konu önemi (`openai: +0.06`, `turkey: +0.06`, `trump: +0.02`) | `scoring.py:KEYWORD_BOOSTS` |
| J4 | Düşük sinyalli/magazin içerik elemesi | `filtering.py:LOW_SIGNAL_TERMS`, `BLOCKLIST_TERMS` |
| J5 | Spor içeriğinin çizgi dışı sayılması | `filtering.py:SPORT_TITLE_RE` |
| J6 | Opinion/review/hands-on içeriğin ele alınışı | `BLOCKLIST_TERMS` + gate prompt |
| J7 | Aynı kaynağa arka arkaya yaslanmama | `RECENT_SOURCE_PENALTY_*` + gate prompt |
| J8 | Aynı şirket/ürün kümesinin üst üste binmemesi | `RECENT_COMPANY_PENALTY_*` + gate prompt |
| J9 | Kategori çeşitliliği, Bilim'in ihmal edilmemesi | `MIN_CATEGORY_TARGETS`, `SCIENCE_*` + gate prompt |
| J10 | Riskli dosyalarda (suçlama, dava, cinsel suç) ek dikkat | `HIGH_RISK_AUTOPUBLISH_TERMS`, `RISKY_HEADLINE_TERMS` |
| J11 | Siyaset haberlerinin otomatik elenmemesi | `HOT_CATEGORY_EXEMPT_CATEGORIES` + gate prompt |
| J12 | Global odak; yerel Türkiye gündeminin öne çıkarılmaması | yalnız gate prompt |
| J13 | Gövde uzunluğu/paragraf sayısı (3-5, habere göre) | yalnız gate prompt |
| J14 | Ton: haber tonu, köşe yazısı/analist tonu değil | yalnız gate prompt |
| J15 | Kapanış cümlesi refleksleri ("bu da ... gösteriyor") | yalnız gate prompt |
| J16 | Başlık/description doğal Türkçe olmalı, kaynak başlığı kopyalanmamalı | gate prompt + M14 |

**J1-J11 bugün iki yerde birden yazılı.** Sistemin asıl kusuru budur.

### Tespit edilen somut çelişkiler

1. **Kaynak ağırlıkları iki modülde tutarsız.** `scoring.py` TechCrunch'a `0.34`,
   `source_priority.py` aynı kaynağa `0.78` veriyor. Ölçekler farklı, listeler
   farklı, hangisinin geçerli olduğu çağrı yoluna bağlı. `The Verge`, `Engadget`,
   `ZDNET` yalnız ikinci listede var; `politico-eu`, `space-com`, `physorg`
   yalnız birincide.
2. **Aynı kural hem ceza puanı hem prompt talimatı.** "Aynı kaynağa arka arkaya
   yaslanma" hem `RECENT_SOURCE_PENALTY_PER_ITEM = 0.07` olarak sayısal ceza,
   hem de Asteria'ya verilen doğal dil talimatı. İkisi aynı anda çalışıyor;
   toplam etki hiçbir yerde hesaplanmıyor.
3. **`CATEGORY_MIN_SCORES = {}` ölü.** Boş dict, ama `is_autopublish_candidate`
   içinde hâlâ dallanma üretiyor.

---

## C. Düşen kapılar

| # | Kapı | Neden düşüyor |
|---|------|---------------|
| D1 | İsim/olay bazlı blocklist'ler: `"rod stewart"`, `"father ted"`, `"eurovision entry"`, `"revolver gifted"`, `"world cup training grounds"` | Tek bir kötü çıktıya karşı yazılmış nokta yamaları. Genellenebilir kural değil; kapsamı asla tamamlanmaz. J4 bunları politika düzeyinde zaten karşılıyor. |
| D2 | Ayarlanmış ceza sabitleri: `SCIENCE_RECENT_PENALTY`, `POLITICO_EU_BASELINE_PENALTY`, `RECENT_TOPIC_FAMILY_PENALTY_MAX` vb. (~40 sabit) | Yargının aritmetiğe çevrilmiş hali. Birleşik etkisi öngörülemez, test edilemez, gerekçesi kodda görünmez. |
| D3 | `topic_family.py` konu-ailesi ceza mekanizması | Tekrar tespiti M4'te mekanik olarak, tekrar *yargısı* J8'de politika olarak karşılanır. Ara katman gereksiz. |
| D4 | `editorial/rewrite.py` (418 satır) | Python'un Türkçe taslak üretmesi. README'nin kendisi bunu yasaklıyor ("Python editör değildir"). Ölü ağırlık. |
| D5 | `autopublish` komutu (deprecated) | Zaten kapalı, yalnız geriye dönük referans için duruyor. |
| D6 | `body_template.py` placeholder gövde üretimi + `PLACEHOLDER_BODY_MARKERS` kontrolü | Şablon gövde hiç üretilmezse, şablon sızıntısı kontrolüne de gerek kalmaz. |
| D7 | `scripts/asteria-editorial-gate.sh` içindeki 90 satırlık gömülü prompt | `POLICY.md`'ye taşınır. Prompt shell script içinde versiyonlanmaz. |
| D8 | `openclaw` bağımlılığı (hero üretimi + gate çağrısı) | Asteria Codex'e taşınıyor; openclaw CLI kalmayacak. Hero sağlayıcısı Faz 3'te kararlaştırılacak, arayüz arkasında. |

---

## D. Faz 0 çıktısı olarak taşınacak test korpusu

Yeni `screen` katmanı ağ ve sağlayıcı olmadan test edilebilmeli. Eldeki malzeme:

- `src/content/equinoxHaber/` — 585 yayımlanmış haber (pozitif örnekler:
  frontmatter şeması, Türkçe dil sinyali, gövde uzunluk dağılımı)
- `news_pipeline/data/` — ham/normalize edilmiş kayıtlar ve queue geçmişi
  (negatif örnekler: elenmiş adaylar ve ret gerekçeleri)
- `tests/test_safety_gates.py` — 2139 satır. Yeniden kullanılmayacak, ama
  **her testin hangi gerçek vakayı koruduğu** okunup buraya taşınmalı.

Bu korpusun oluşturulması Faz 1'in ilk işidir.
