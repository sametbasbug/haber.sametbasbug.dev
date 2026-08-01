# Test Korpusu

Üreten: `newsroom/tools/build_corpus.py` · Tohum: `20260801`

Yeni `screen`, `accept` ve dil katmanlarının **ağ ve sağlayıcı olmadan** test
edilmesi için sabitlenmiş veri. Bir kez üretilir, repoya girer; sonrasında
`news_pipeline/data/` (git dışı, taşınabilir diskte) bağımlılığı kalmaz.

## Dosyalar

| Dosya | Kayıt | İçerik |
|---|---|---|
| `published.jsonl` | 585 | Yayımlanmış haberler. 584'ü kaynak kaydına eşleşiyor (`origin`). |
| `candidates.jsonl` | 1500 | Yayımlanmamış aday havuzundan örneklem (havuz: 13.307). |
| `manifest.json` | — | Üretim sayıları ve eşleşmeyen kayıtlar. |

`published.jsonl` her kayıtta hem yayımlanan **Türkçe** metni hem kaynağın
**orijinal İngilizce** başlık/özetini taşır. Bu eşleşme dil kapısının (M14)
kalibrasyonu için doğrudan kullanılabilir: 584 temiz Türkçe pozitif, 584 temiz
İngilizce negatif, artı 1500 ek İngilizce negatif.

## Ne yer doğrudur, ne değildir

**Yer doğrudur (ground truth):**

- Yayımlanmış olmak. `published.jsonl` içindeki her kayıt gerçekten canlıya
  çıkmıştır — şema, dil ve biçim açısından kesin pozitiftir.
- Nesnel alan değerleri: yayın tarihi, kaynak URL, kategori enum'u, gövde
  uzunluğu, paragraf sayısı.

**Yer doğru DEĞİLDİR:**

- **Queue ret gerekçeleri bilinçli olarak korpusa alınmadı.** Queue geçmişinde
  2201 kayıt ve 1694 ret var; ancak retlerin tamamını, yerine geçtiğimiz
  sistemin kendisi üretmiş. Dağılım şöyle: 1551 ret "kaynak 24 saatten eski"
  (mekanik), 143 ret eski skorlama motorunun çıktısı, 57 ret tek bir otomatik
  `manual-review` string'i. **İnsan etiketli editoryal veri yok.**

  Bu retleri etiket olarak kullanmak, eski sistemin kusurlarını yeni sistemin
  testlerine sabitlemek olurdu. Alınmadılar.

- **Yayımlanmamış olmak, kötü olmak değildir.** `candidates.jsonl` etiketsiz bir
  havuzdur. Bir aday yayımlanmamış olabilir çünkü o koşuda başka bir haber
  seçilmiştir. Zayıf-negatif bile sayılmamalıdır.

## Ne için kullanılır

1. **Mekanik kapı regresyonu (M1-M13).** 1500 aday üzerinde yaş, gelecek sapması,
   kısa başlık, liveblog, sponsorlu URL kapıları deterministik olarak test edilir.
2. **Şema uyumu (M12, M13).** 585 yayın, `src/content.config.ts` şemasına karşı
   altın örnek kümesidir.
3. **Dil kapısı kalibrasyonu (M14).** Yukarıdaki eşleşmiş TR/EN kümesi.
4. **Kabul sözleşmesi eşikleri (M10, M11).** Gerçek dağılıma karşı doğrulama.

Editoryal *yargının* kalitesi bu korpusla ölçülemez. O, Faz 4'teki gölge
çalıştırmada insan değerlendirmesiyle ölçülecektir.

## Gerçek dağılım (585 yayın)

```
gövde uzunluğu   min 506 · p10 924 · medyan 1197 · p90 1551 · maks 2145
paragraf         3:11  4:234  5:335  6:5
kategori         Teknoloji 247 · Siyaset 198 · Ekonomi 87 · Bilim 53
```

Faz 2'de kabul sözleşmesi yazılırken bu dağılımlar referans alınmalıdır.
