# News Pipeline Operations

Bu dosya günlük kullanım ve ileride cron entegrasyonu için pratik operasyon rehberidir.

## Amaç

Pipeline'ı güvenli ve öngörülebilir biçimde çalıştırmak.

## Önerilen manuel akış

### 1. Topla
```bash
source news_pipeline/.venv/bin/activate
news-pipeline collect
```

### 2. İşle
```bash
news-pipeline process
```

### 3. Önce hassas kuyruğa bak
```bash
news-pipeline queue review
```

### 4. Önce queue temizliğini çalıştır
```bash
news-pipeline queue cleanup
```

Bu komut yalnız aktif queue'yi değil, arşiv retention'ını da uygular:
- rejected archive: 24 saat
- published archive: 72 saat

### 5. Sonra genel yeni kayıtları tara
```bash
news-pipeline queue list --status new
```

### 6. Gerekli kaydı aç
```bash
news-pipeline queue inspect <QUEUE_ID>
```

### 7. Onayla
```bash
news-pipeline queue approve <QUEUE_ID>
```

### 8. Canlı markdown üret
```bash
news-pipeline publish <QUEUE_ID>
```

### 9. Son edit
- `src/content/anlikHaber/` altındaki üretilen markdown dosyasını gözden geçir
- başlığı keskinleştir
- description'ı rafine et
- gerekiyorsa ikinci/üçüncü kaynak ekle

---

## Heartbeat için önerilen yaklaşım

Bu pipeline artık haber-project içinde yaşar; ilk tercih cron değil, heartbeat akışıdır.

Neden?
- haber akışı tam saat bağımlı değil
- queue kontrolü daha doğal yapılır
- boş turda sessiz kalmak kolaydır
- editoryal karar akışı daha insani kalır

Önerilen heartbeat script'i:

```bash
cd /Volumes/KIOXIA/haber-project && bash news_pipeline/scripts/heartbeat-cycle.sh
```

Script şu adımları çalıştırır:

```bash
news-pipeline collect
news-pipeline process
news-pipeline queue summary
news-pipeline queue review
news-pipeline queue list --status new
# varsayılan: extra Asteria gate çağrısı kapalı
# gerekirse RUN_ASTERIA_GATE=1 ile manuel açılır
bash news_pipeline/scripts/heartbeat-cycle.sh
```

Önemli not:
- `heartbeat-cycle.sh` içinde ekstra `asteria-editorial-gate.sh` çağrısı artık varsayılan olarak kapalıdır.
- Sebep, aynı heartbeat içinde Asteria'ya ikinci bir görev mesajı gidip günlük turn/message limitini gereksiz tüketebilmesidir.
- İkinci gate koşusu gerçekten isteniyorsa açıkça `RUN_ASTERIA_GATE=1` verilmelidir.

Detaylı çalışma notları için:

- `news_pipeline/HEARTBEAT_RUNBOOK.md`

## Neden?

Çünkü:
- düşük kaliteli veya hassas haberler ayıklanmalı
- hukuki risk taşıyan içeriklerde son karar kontrollü editoryal kapıdan geçmeli
- direct autopublish şu aşamada fazla cesur kalıyor
- heartbeat boş turda sessiz kalabilir

---

## Otonom publish modu

Varsayılan mod artık **direct autopublish kapalı** çizgisidir.

Bu ne demek?
- pipeline toplamaya ve işlemeye devam eder
- queue görünürlüğü sürer
- `news-pipeline autopublish` tabanlı doğrudan canlı yayın hattı kullanılmaz
- canlı publish kararı `news_pipeline/scripts/asteria-editorial-gate.sh` üzerinden Asteria editoryal kapısına taşınır

Detaylı sınırlar için:

- `news_pipeline/AUTONOMOUS_PUBLISH_POLICY.md`

## Manual-review politikası

Şu tip içerikler ayrı dikkat ister:

- dava
- saldırı
- cinsel suç iddiası
- kişisel suçlama
- Epstein benzeri yüksek riskli politik/sosyal dosyalar

Bu içerikleri önce:

```bash
news-pipeline queue review
```

ile aç.

---

## Sağlık kontrolü

Kod değişikliğinden sonra hızlı doğrulama:

```bash
python3 -m compileall news_pipeline/news_pipeline
```

---

## Pratik not

Queue kalabalıklaşırsa önce bunlara bak:

```bash
news-pipeline queue review
news-pipeline queue list --status new
```

Reject etmekten çekinme. Gürültü biriktiren queue, işe yarayan queue değildir.
