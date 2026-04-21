# News Pipeline

Ham haber akışını editoryal karara hazır, temiz taslaklara dönüştüren Python tabanlı hazırlık sistemi.

## Ne işe yarar?

Bu katman haber-project içinde yaşar; kaynaklardan haber toplar, normalize eder, tekrarları ayıklar, editoryal kuyruğa düşürür. Onaylanan kayıt doğrudan `anlikHaber` canlı markdown çıktısına yazılır.

Kısa akış:

1. `collect` → ham kayıtları toplar
2. `process` → normalize + filtre + dedupe + queue güncelleme yapar
3. `queue` → editoryal sırayı yönetir
4. `publish` → onaylanan kaydı Astro markdown yayınına dönüştürür

---

## Mimari kararlar

### 1. Editorial-first
Pipeline otomatik yayın yapmaz. Önce editoryal kuyruk üretir.

### 2. Python pipeline, Astro yayın yüzeyi
Veri işleme katmanı Python'da, yayın yüzeyi mevcut Astro yapısında kalır.

### 3. Dosya tabanlı storage
İlk sürümde JSON tabanlı klasör yapısı kullanılır. Gereksiz DB karmaşası yok.

### 4. Manual-review ayrımı
Hassas veya hukuki riskli haberler ayrı işaretlenir.

---

## Klasör yapısı

```text
news_pipeline/
  news_pipeline/
    cli/
    collectors/
    config/
    dedupe/
    editorial/
    models/
    normalize/
    publish/
    queue/
    storage/
    utils/
  data/
    raw/
    normalized/
    queue/
    logs/
    published/
```

---

## Kurulum

Proje kökünden:

```bash
python3 -m venv news_pipeline/.venv
source news_pipeline/.venv/bin/activate
pip install -e news_pipeline
```

İsteğe bağlı görsel akışı için proje kökündeki `.env` dosyasına şu alan eklenebilir:

```bash
PEXELS_API_KEY=
```

Bu dosya zaten `.gitignore` içinde olduğu için key repoya girmez.

---

## Temel komutlar

### Kaynakları topla

```bash
source news_pipeline/.venv/bin/activate
news-pipeline collect
```

### Ham veriyi işle ve queue üret

```bash
source news_pipeline/.venv/bin/activate
news-pipeline process
```

### Queue listesi

```bash
news-pipeline queue list
news-pipeline queue list --manual-only
news-pipeline queue list --status new
```

### Queue temizliği

```bash
news-pipeline queue cleanup
```

Varsayılan politika:
- `published` ve `rejected` kayıtlar 24 saat sonra arşive taşınır
- `new/reviewing/approved` kayıtlar 48 saat sonra bayat sayılır
- yüksek skorlu veya manual-review işaretli birkaç kayıt son kontrol için tutulabilir
- arşivdeki `rejected` kayıtlar 24 saat sonra silinir
- arşivdeki `published` kayıtlar 72 saat sonra silinir

### Hassas inceleme kuyruğu

```bash
news-pipeline queue review
```

### Tek kaydı incele

```bash
news-pipeline queue inspect <QUEUE_ID>
```

### Onayla / reddet

```bash
news-pipeline queue approve <QUEUE_ID>
news-pipeline queue reject <QUEUE_ID> --note "neden reddedildi"
```

### Yayına yaz

```bash
news-pipeline publish <QUEUE_ID>
```

Çıktı yolu:

```text
src/content/anlikHaber/
```

---

## Queue mantığı

Durumlar:

- `new`
- `reviewing`
- `approved`
- `rejected`
- `published`

Ek alanlar:

- `manual-review` notu → hassas/hukuki içerik
- `related_queue_ids` → benzer coverage kayıtları
- `supporting_sources` → ana kaydı güçlendiren ek kaynaklar

---

## Şu an çalışan kalite katmanları

- RSS collector
- normalize
- temel dedupe
- editorial filtering
- editorial scoring
- Türkçe başlık/description rewrite için kural tabanı
- manual-review işaretleme
- supporting source merge
- primary/supporting source ayrımı
- Astro `anlikHaber` canlı markdown üretimi

---

## Bilinen sınırlar

Bunlar henüz tam çözülmüş değil:

- rewrite sistemi hâlâ kural tabanlı, kusursuz değil
- olay düzeyinde gerçek cluster master record yok
- source diversity mantığı temel seviyede
- browser fallback yok
- görsel seçimi Pexels key yoksa güvenli fallback görsele döner
- otomatik publish yok

Bu bilinçli. Önce güvenilir omurga, sonra şatafat.

---

## Güvenli çalışma akışı

Önerilen günlük akış:

```bash
news-pipeline collect
news-pipeline process
news-pipeline queue cleanup
news-pipeline queue review
news-pipeline queue list --status new
news-pipeline queue inspect <id>
news-pipeline queue approve <id>
news-pipeline publish <id>
```

Önemli not:

- `publish` yalnız `approved` item kabul eder
- `published` item yeniden publish edilemez
- hassas haberlerde `queue review` öncelikli bakış olmalı

---

## Config dosyaları

- `news_pipeline/config/sources.yaml`
- `news_pipeline/config/categories.yaml`
- `news_pipeline/config/rules.yaml`

İlk sürümde ana config noktası `sources.yaml`.

---

## Sonraki mantıklı aşamalar

- event-level cluster master record
- daha güçlü source diversity scoring
- daha geniş Türkçe rewrite kapsaması
- cron entegrasyonu
- küçük editorial panel
