# Heartbeat Runbook

Bu dosya heartbeat sırasında news pipeline için izlenecek en sade operasyon akışını tanımlar.

## Amaç

Heartbeat tetiklendiğinde tek hedef şudur:
- yeni haberleri içeri almak
- queue'yu güncellemek
- önemli aday varsa kısa özet vermek
- yoksa sessiz kalmak

## Tek komutluk akış

```bash
cd /Volumes/KIOXIA/haber-project && bash news_pipeline/scripts/heartbeat-cycle.sh
```

## Script içinde ne çalışır?

1. `news_pipeline/.venv/bin/news-pipeline collect`
2. `news_pipeline/.venv/bin/news-pipeline process`
3. raw input tazeliği raporlanır (`raw_latest`, `raw_age_seconds`, `raw_status`)
4. `news_pipeline/.venv/bin/news-pipeline queue summary`
5. direct autopublish çalıştırılmaz, bu hat devre dışıdır
6. `news_pipeline/.venv/bin/news-pipeline queue review`
7. `news_pipeline/.venv/bin/news-pipeline queue list --status new`
8. `bash news_pipeline/scripts/asteria-editorial-gate.sh`
9. publish kararı Asteria editoryal kapısından geçer

## Heartbeat karar kuralı

### Kullanıcıya yaz
Yalnız şu durumlardan biri varsa:
- yeni `manual-review` kaydı çıktıysa
- güçlü ve yayınlanabilir yeni aday oluştuysa
- aynı olay birden fazla kaynakla güçlendiyse
- yayınlanmaya değer 1-3 temiz haber belirdiyse

### Sessiz kal
Şu durumlarda `HEARTBEAT_OK`:
- sadece gürültü/tekrar ayıklandıysa
- yeni anlamlı aday yoksa
- yalnız zayıf skorlar geldiyse
- son update çok yakın zamanda verildiyse
- `raw_status=stale_or_missing` dönmüş ve collect/process hattı veri tazeleyememişse

## Editoryal yetki

Varsayılan mod: **direct autopublish kapalı**.

Heartbeat akışı artık:
- toplar
- işler
- queue görünürlüğü sağlar
- sonunda `news_pipeline/scripts/asteria-editorial-gate.sh` ile Asteria'yı çağırır

Yani heartbeat script'i kendi başına canlı publish yapmaz.
Canlı publish kararı Asteria değerlendirmesinden geçmeden verilmez.

## Kısa mesaj formatı

Örnek:

- `2 güçlü aday çıktı, 1'i manual-review istiyor.`
- `Yeni yayın adayı: ...`
- `Manual-review kuyruğunda 1 hassas kayıt var.`

Uzun rapor dökme.

## Not

Bu runbook'ta direct autopublish devre dışıdır.
Heartbeat script'i artık canlı `src/content/anlikHaber/` klasörüne kendi başına otomatik yazmaz ve otomatik git commit + push yapmaz.
Bunun yerine heartbeat sonunda Asteria editoryal kapısı çağrılır.
Amaç, veri motorunu çalışır tutarken canlı publish düğmesini kontrollü bir editoryal katmana taşımaktır.
