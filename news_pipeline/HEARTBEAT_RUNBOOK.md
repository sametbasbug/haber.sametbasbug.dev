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

1. `news-pipeline collect`
2. `news-pipeline process`
3. `news-pipeline queue summary`
4. direct autopublish çalıştırılmaz, bu hat devre dışıdır
5. `news-pipeline queue review`
6. `news-pipeline queue list --status new`
7. `bash news_pipeline/scripts/asteria-editorial-gate.sh`
8. publish kararı Asteria editoryal kapısından geçer

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
