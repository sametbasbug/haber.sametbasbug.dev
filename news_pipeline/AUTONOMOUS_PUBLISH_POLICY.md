# Autonomous Publish Policy

Bu belge, news pipeline için otonom yayın karar sınırlarını tanımlar.

## Temel ilke

Nyx haber akışının kesilmemesi için normal koşullarda editoryal son kararı verebilir.
Ama bu yetki sınırsız değildir. Riskli alanlarda insan onayı devreye girer.

## Otonom publish AÇIK

Varsayılan mod:
- heartbeat yaklaşık 60 dakikada bir çalışır
- pipeline collect + process yapar
- queue içinden uygun adayları Nyx seçer
- düşük riskli ve çizgiye uygun kayıtlar doğrudan canlı `src/content/anlikHaber/` klasörüne yazılır
- gerektiğinde yayın akışı Nyx tarafından sürdürülür

## Nyx'in doğrudan publish edebileceği haberler

### 1. Düşük riskli teknoloji haberleri
- ürün güncellemeleri
- model / şirket / platform duyuruları
- AI ve yazılım ekosistemindeki doğrulanabilir gelişmeler
- açık kaynaklı veya teknik etkisi net olaylar

### 2. Düşük-orta riskli dünya / siyaset haberleri
- seçim, diplomasi, ekonomi, yaptırım, ticaret, devlet politikası gibi alanlarda
- açık kaynaklı ve güçlü yayıncı destekli gelişmeler
- kişisel itham içermeyen temiz politik özetler

### 3. Çoklu kaynakla güçlenmiş kayıtlar
- primary + supporting source yapısı varsa
- olay en azından editoryal olarak daha sağlam görünüyorsa

## Nyx'in publish ETMEMESİ gereken haberler

### Mutlaka kullanıcıya sorulacak alanlar
- cinsel suç iddiaları
- kişisel suçlama / karakter ithamı
- tek kaynağa dayanan sert hukuki iddialar
- hassas dava dosyaları
- yüksek gerilimli Türkiye iç siyaset başlıkları
- itibar riski yüksek gri alanlar
- doğrulama açığı bulunan kırılgan haberler

### Varsayılan bekletme alanları
- manual-review işaretli kayıtlar
- description/body hâlâ editoryal olarak zayıf kalan kayıtlar
- aynı olayın çelişen versiyonları
- bağlamı eksik veya dedupe/merge açısından yarım görünen kayıtlar

## Publish kararı için pratik eşikler

Nyx bir kaydı otonom publish etmeye daha yatkındır, eğer:
- `status = new`
- `manual-review` notu yok
- skor yaklaşık `>= 0.68`
- başlık ve description Türkçe/temiz seviyeye gelmiş
- kaynak güvenilir
- kayıt açıkça spam/gürültü değil

İlk güvenli modda heartbeat başına en fazla **1 kayıt** otomatik publish edilir.

## Manual-review politikası

Şu an `manual-review` taşıyan haberler otomatik publish edilmez.
Önce kullanıcı onayı gerekir.

Buna tipik örnekler:
- dava
- saldırı
- kişisel suçlama
- Epstein benzeri yüksek hassasiyetli dosyalar

## Editoryal ton ilkesi

Otonom publish açıksa bile Nyx şunları yapmaz:
- bağıran clickbait başlık
- teyitsiz sert hüküm
- kişisel itibarı gereksiz zedeleyen dil
- tek kaynağa dayanıp kesin hüküm kurma

## Varsayılan güvenlik önerisi

En güvenli pratik:
- otonom publish açık
- ama yalnız düşük riskli haberlerde aktif
- manual-review ve kırmızı bayraklı alanlar kullanıcıya eskale edilir

## Son söz

Amaç tam otomatik kaos değil.
Amaç, haber akışını canlı tutarken riski kontrollü biçimde Nyx'in omuzlamasıdır.
