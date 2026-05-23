# Anlık Haber

Anlık Haber, `haber.sametbasbug.dev` için geliştirilmiş editoryal öncelikli haber yayın sistemidir.

Amaç basit: günün gürültüsünü büyütmeden, güvenilir kaynaklardan gelen önemli gelişmeleri kısa, temiz ve Türkçe okunur haberler hâline getirmek.

Canlı yayın: https://haber.sametbasbug.dev

## Ne var burada?

Bu repo iki ana parçadan oluşur:

- **Astro yayın yüzeyi** — haber sayfaları, RSS, sitemap, kategori yapısı ve statik deploy.
- **Python news pipeline** — RSS toplama, normalize etme, dedupe, kuyruk, kalite kapıları, hero görsel üretimi ve yayın rayı.

Asteria AI bu sistemin dar kapsamlı editoryal ajanıdır. Python haberin editörü değildir; teknik raydır. Asteria başlığı seçer, kaynağı okur, Türkçe metni ve görsel brief’i yazar. Pipeline ise bunu güvenli biçimde markdown’a dönüştürür, görsel üretir, audit/build yapar ve yayına çıkarır.

## Yayın çizgisi

Anlık Haber global odaklı bir Türkçe haber yüzeyidir. Kategori seti bilinçli olarak dar tutulur:

- **Siyaset**
- **Ekonomi**
- **Teknoloji**
- **Bilim**

Türkiye bağlantılı haberler ancak global bağlamı güçlüyse bu kategoriler içinde değerlendirilir.

## Editoryal prensipler

- Haber kısa olabilir; bülten maddesi gibi görünmemeli.
- İddia, dava veya soruşturma haberleri yasak değildir; kesin hüküm gibi yazılmaz, atıf açık tutulur.
- Aynı olay ailesi yakın aralıklarla tekrar paketlenmez.
- Kategori ve kaynak dengesi korunur; sistem tek bir kaynak ya da kategoriye saplanmaz.
- İngilizce teknik/finansal/hukuki terimler gereksiz yere metne sızmaz.
- Hero görseller haber özelinde AI ile üretilir; stok görsel fallback’i varsayılan olarak kapalıdır.

## Asteria akışı

Güncel heartbeat akışı:

1. `prepare-one` başlık panosu üretir.
2. Asteria son yayınları, kategori/kaynak dengesini ve adayları inceler.
3. Asteria seçtiği haberin kaynak URL’sini okur.
4. Asteria Türkçe başlık, açıklama, gövde, fact listesi, etiketler, `heroPrompt` ve `heroAlt` yazar.
5. `queue polish` bu editoryal dokunuşu queue item üzerine işler.
6. `publish-one` teknik yayını yapar:
   - markdown üretimi
   - AI hero üretimi ve WebP optimizasyonu
   - görsel/content audit
   - Astro build
   - dar kapsamlı commit/push

Deneysel hedef: heartbeat başına en fazla **1 haber**.

## Teknik mimari

```text
haber-project/
  src/
    components/news/          # Haber arayüz bileşenleri
    content/anlikHaber/       # Yayınlanan markdown haberler
    pages/                    # Astro sayfaları, RSS, sitemap
  public/images/generated/    # Üretilen hero görseller
  news_pipeline/
    news_pipeline/
      collectors/             # RSS/toplama
      normalize/              # Temizleme ve normalize
      dedupe/                 # Benzerlik ve tekrar kontrolü
      editorial/              # Filtreleme, scoring, kalite kapıları
      queue/                  # Editoryal kuyruk
      publish/                # Markdown + hero + frontmatter üretimi
      cli/                    # news-pipeline komutları
    data/                     # Raw/normalized/queue/state verileri
```

## Kullanım

Kurulum:

```bash
python3 -m venv news_pipeline/.venv
source news_pipeline/.venv/bin/activate
pip install -e news_pipeline
npm install
```

Temel komutlar:

```bash
# Kaynakları topla
news-pipeline collect

# Raw kayıtları normalize edip queue üret
news-pipeline process

# Editoryal pano hazırla
news-pipeline heartbeat prepare-one --json

# Asteria polish sonrası tek haber yayımla
news-pipeline heartbeat publish-one --execute --no-collect --json

# Kalite kontrolleri
news-pipeline audit-content
news-pipeline audit-images
npm run build
```

## Hero görseller

Hero görselleri varsayılan olarak OpenClaw image generation hattı üzerinden üretilir ve şu biçime normalize edilir:

- Boyut: `1200×675`
- Format: `WebP`
- Kalite: `82`
- Konum: `public/images/generated/anlik-haber/`

Stok Pexels/Unsplash fallback’i kalite çizgisini düşürdüğü için varsayılan olarak kullanılmaz. AI hero üretimi başarısızsa yayın durur; sistem hata nedenini raporlar ve gerekirse tekrar denenir.

## Deploy

Repo `main` branch’e push edildiğinde GitHub Actions ile GitHub Pages deploy çalışır.

Canlı domain:

```text
haber.sametbasbug.dev
```

Workflow:

```text
.github/workflows/deploy.yml
```

## Durum

Sistem artık büyük mimari değişiklik bekleyen deneysel bir prototip değil. Güncel yaklaşım:

- Büyük yeniden tasarım yok.
- Küçük bug fix ve kalite ayarları var.
- Asteria editoryal kaliteyi korur.
- Python hattı hız, güvenlik ve yayın disiplini sağlar.

Son optimizasyonlardan sonra tipik haber üretim süresi eski 15+ dakika bandından yaklaşık 5-6 dakika seviyesine indi.

## Lisans

- Kod: `LICENSE` altındaki **MIT License**
- Tarafımızca üretilen veya hakları bize ait içerikler, görseller ve marka unsurları: `CONTENT_LICENSE.md` altındaki ayrı kullanım bildirimi
- Üçüncü taraf içerikler kendi hak sahipleri ve lisans koşullarına tabidir
