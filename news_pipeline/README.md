# News Pipeline

`news_pipeline`, Anlık Haber’in Python tabanlı teknik rayıdır.

Bu katman haber toplar, normalize eder, tekrarları azaltır, başlık panosu üretir, kuyruk tutar, kalite kapılarını çalıştırır, AI hero görselini üretir ve Astro markdown yayınına güvenli geçiş sağlar.

Önemli çizgi: **Python editör değildir.** Asteria haber seçimini yapar, kaynak metni okur, Türkçe başlık/açıklama/gövde/fact/tags yazar ve `heroPrompt` + `heroAlt` üretir. Python bu editoryal dokunuşu denetimli biçimde yayına taşır.

## Güncel üretim akışı

Aktif heartbeat akışı şu sıradadır:

```bash
news-pipeline heartbeat prepare-one --json
# Asteria seçilen URL'yi okur ve haberi yazar
news-pipeline queue polish <QUEUE_ID> \
  --title '...' \
  --description '...' \
  --category 'Teknoloji' \
  --facts-json '["...", "..."]' \
  --body '...' \
  --hero-prompt '...' \
  --hero-alt '...' \
  --tags-json '["pipeline", "haber", "..."]' \
  --json
news-pipeline heartbeat publish-one --execute --no-collect --json
```

`prepare-one` yalnız başlık panosu verir. Python’un Türkçe taslak/özet üretip Asteria’yı çıpalamasına izin verilmez.

`publish-one` teknik raydır:

- Asteria polish notunu kontrol eder
- hero brief var mı bakar
- kaynak yaşı ve duplicate guard çalıştırır
- markdown üretir
- AI hero üretir ve WebP optimize eder
- `audit-images` ve `audit-content` çalıştırır
- `npm run build` çalıştırır
- dar kapsamlı commit/push yapar

Deneysel modda heartbeat başına en fazla **1 haber** yayımlanır.

## Deprecated: direct autopublish

`news-pipeline autopublish` artık kapalıdır.

Bu komut silinmedi; eski referanslar kırılmasın diye duruyor. Ancak çalıştırıldığında yayın yapmaz ve açık uyarıyla çıkar. Sebep: direct autopublish Asteria’nın editoryal handoff’unu bypass eder.

Kullanılacak güvenli ray:

```bash
news-pipeline heartbeat prepare-one --json
news-pipeline queue polish <QUEUE_ID> ... --json
news-pipeline heartbeat publish-one --execute --no-collect --json
```

## Kurulum

Repo kökünden:

```bash
python3 -m venv news_pipeline/.venv
source news_pipeline/.venv/bin/activate
pip install -e "news_pipeline[test]"
npm install
```

## Klasör yapısı

```text
news_pipeline/
  news_pipeline/
    cli/                 # Typer CLI komutları
    collectors/          # RSS/toplama
    config/              # kaynak ve kategori configleri
    dedupe/              # benzerlik/tekrar yardımcıları
    editorial/           # scoring, filtering, autonomy gates
    models/              # Pydantic veri modelleri
    normalize/           # raw -> normalized temizlik
    publish/             # markdown, frontmatter, body, hero image
    queue/               # queue servisleri
    storage/             # JSON file storage
    utils/               # logging vb.
  data/
    raw/
    normalized/
    queue/
    state/
    archive/
```

## Temel komutlar

### Kaynak toplama ve işleme

```bash
news-pipeline collect
news-pipeline process
news-pipeline queue cleanup
```

RSS kaynakları `sources.yaml` içinde iki maliyet sınırı destekler:

- `max_items`: feed'den işlenecek en fazla entry sayısı
- `snippet_limit`: gerçek haber sayfasına gidip article snippet çekilecek ilk entry sayısı

Asteria `prepare-one` panosunda snippet görmez; snippet Python queue zenginliği içindir. Asteria seçtiği haber URL'sini ayrıca okur.

### Heartbeat panosu

```bash
news-pipeline heartbeat prepare-one --json
```

Bu komut Asteria’ya şu tür bilgiler verir:

- aday başlıklar
- kaynak adı ve URL
- skor/sinyal
- `strictGate.reason`
- son yayımlanan haberler (`board.recentPosts`)
- sıcak kategori/kaynak sinyali (`hotCategory`, `hotSource`)

### Queue inceleme

```bash
news-pipeline queue summary
news-pipeline queue list --status new
news-pipeline queue inspect <QUEUE_ID>
news-pipeline queue review
```

### Asteria polish

```bash
news-pipeline queue polish <QUEUE_ID> \
  --title 'Türkçe başlık' \
  --description 'Türkçe açıklama' \
  --category 'Bilim' \
  --facts-json '["fact 1", "fact 2"]' \
  --body 'Haber gövdesi...' \
  --hero-prompt 'AI hero prompt...' \
  --hero-alt 'Türkçe alt metin' \
  --tags-json '["pipeline", "haber", "bilim"]' \
  --json
```

Polish olmadan production publish kapısı geçilmez.

### Teknik publish

```bash
news-pipeline heartbeat publish-one --execute --no-collect --json
```

Manual-review sonrası aynı gerçek scheduler wake içinde bilinçli düzeltme yapılıp ikinci kez deneniyorsa:

```bash
news-pipeline heartbeat publish-one --execute --no-collect --force --json
```

`--force` kör retry için değil, aynı wake içinde Asteria’nın düzelttiği adayın recent-cycle guard’a takılmasını önlemek içindir.

### Audit

```bash
news-pipeline audit-content
news-pipeline audit-images
npm run build
```

CI/local kalite kapısında bunlar provider çağrısı yapmadan çalışmalıdır.

## Queue mantığı

Durumlar:

- `new`
- `reviewing`
- `approved`
- `rejected`
- `published`

Önemli alanlar:

- `notes` içinde `asteria-editorial-polish` → Asteria dokunuşu var
- `draft_body` → Asteria’nın Türkçe haber gövdesi
- `hero_prompt` → Asteria’nın görsel brief’i
- `hero_alt` → Türkçe alt metin
- `draft_sources` → kaynaklar
- `related_queue_ids` / `supporting_sources` → destekleyici kayıtlar

## Kalite ve güvenlik kapıları

Production publish şu kapılardan geçer:

- Asteria polish notu zorunlu
- `heroPrompt` ve `heroAlt` zorunlu
- başlık/açıklama/fact/body Türkçe kontrolü
- minimum gövde derinliği
- source age: publish hard gate varsayılan 24 saat; Asteria headline board ve queue stale-source temizliği varsayılan 18 saat
- aynı URL tekrar kontrolü
- fuzzy title/description/topic duplicate kontrolü
- AI hero üretimi zorunlu; stok fallback varsayılan kapalı
- `audit-images` → broken/policy/recent duplicate sıfır olmalı
- `audit-content` → iç not/meta sızıntısı olmamalı
- Astro build geçmeli

## AI hero politikası

Hero görseller haber özelinde AI ile üretilir.

Varsayılan çıktı:

- `1200×675`
- `WebP`
- kalite `82`
- `public/images/generated/anlik-haber/`

AI provider geçici olarak doluysa `hero_image.py` birkaç kez yeniden dener ve son provider/CLI hatasını raporlar. `NEWS_PIPELINE_AI_HERO_ATTEMPTS` ile deneme sayısı ayarlanabilir; stok fallback yalnız açık acil override ile kullanılmalıdır.

## Config dosyaları

- `news_pipeline/config/sources.yaml`
- `news_pipeline/config/categories.yaml`
- `news_pipeline/config/rules.yaml`

Ana kaynak havuzu `sources.yaml` içindedir. Kaynakların cadence ayarı heartbeat yükünü azaltmak için kullanılır.

## CI beklentisi

CI dış servis/provider çağırmamalı. Güvenli kontroller:

```bash
python -m compileall news_pipeline/news_pipeline
python -m pytest news_pipeline/tests
news-pipeline audit-content
news-pipeline audit-images
npm run build
```

`collect`, `process`, AI hero generation veya gerçek publish CI’da çalıştırılmaz.

## Operasyon notu

Bu sistem artık deneysel “her şeyi yeniden tasarla” aşamasında değil. Güncel bakım çizgisi:

- küçük bug fix
- kalite kapısı iyileştirme
- dokümantasyon düzeltme
- Asteria’nın editoryal rolünü koruma

Büyük mimari değişiklikler ayrıca değerlendirilmelidir.
