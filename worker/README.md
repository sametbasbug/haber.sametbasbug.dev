# Yayın Worker'ı

Haberi HTTP ile alan, kapılardan geçiren, **yazma anında** HTML'e çeviren ve
D1'e yazan katman. Statik sitenin yerini almıyor; şu an yanında duruyor ve tek
bir haberin uçtan uca bu yoldan geçtiği doğrulandı.

## Neden

Sözleşme `newsroom publish` ile aynı: aynı `selections` yükü, aynı kapılar,
aynı hata kodları. Değişen tek şey çağrının nereden geldiği — kabuk yerine
HTTP. Böylece yayın "repoda komut çalıştırmak" olmaktan çıkıp "paket
göndermek" oluyor: hangi ajanın yayımladığı, hangi makinede olduğu ve çalışma
ağacının temiz olup olmadığı yayının koşulu olmaktan çıkıyor.

## Akış

```
POST /api/brief    → pano sabitlenir, briefId döner
POST /api/publish  → haber o panoya karşı ölçülür ve yayımlanır
```

İki adımın ayrılması kasıtlı. Pano yükün içinde gelseydi "panoda olmayan
aday" ve "çevrilmemiş başlık" kapıları, yayımlamak isteyen tarafın kendi
yazdığı referansa karşı ölçerdi. Aynı ajan ikisini de yapıyorken bile ayrım
kazandırır: aday listesi haber yazılmadan önce donar ve sonradan haberi haklı
çıkaracak şekilde şekillendirilemez. Pano bir kez tüketilir.

## Kimlik ve yetki

İki soru ayrı sorulur:

| soru | cevap veren |
|---|---|
| Bu istek kimden geliyor? | Orbit'in ES256 imzalı ID token'ı (JWKS ile doğrulanır) |
| O kimlik ne yapabilir? | haber'in kendi `publishers` tablosu |

Orbit ikinciyi cevaplamaz ve cevaplamaması bilinçlidir: site kapsamlarının
tamamı okumadır ve `site-authorization-scopes.ts` "ajan adına yazma yetkisi"
verilmediğini gerekçesiyle yazar — bir siteye giriş izni, o sitenin kullanıcı
adına konuşmasına dönüşemez. Yetkiyi Orbit'ten ithal etmek, Orbit'in kasten
kapattığı kapıyı arkadan açmak olurdu.

Bunun iki görünür sonucu var: kimliği doğrulanmış ama listede olmayan biri
**403** alır (401 değil — "kim olduğunu bilmiyorum" ile "biliyorum, yetkin
yok" farklı sorunlardır), ve yayın imzası token'ın `sub`'una bağlı tablo
satırından gelir, yükten değil. Yükte başka bir imza yazması sonucu
değiştirmez.

`ORBIT_ISSUER` tanımlıyken paylaşılan sır yolu kendiliğinden kapanır; unutulup
açık kalabilecek ayrı bir bayrak yok.

## Ölçülen

| | sonuç |
|---|---|
| tek haber yayımlama (metin + 100 KB görsel) | **39 ms**, HTTP 201 |
| saklanan `body_html` ile Astro'nun canlı çıktısı | 587/587 birebir |
| `token_set_ratio` / `ratio` ↔ rapidfuzz | 8609 vaka, sapma 7e-15 |
| dil kapısı ↔ Python | 741 gövde + 1170 başlık, sapma 0 |
| kabul sözleşmesi ↔ Python | 609 vaka, kod ve mesaj dahil birebir |
| slug ↔ Python `slugify` | 596 vaka birebir |
| uçlar ve pano yaşam döngüsü | 26 vaka |
| ID token doğrulama (gerçek kripto) | 22 vaka |
| Orbit kimliğiyle tam akış (gerçek ağ) | 10 vaka |
| **D1'den üretilen sayfa ↔ statik sayfa** | **587/587 birebir** |

Hepsi tek komut:

```bash
npm run parity          # çeviri ↔ Python  (5 takım)
npm run e2e             # uçlar, pano yaşam döngüsü, kapılar  (26 vaka)
npm run test:orbit      # ID token doğrulama, gerçek kripto  (22 vaka)
npm run test:orbit:e2e  # Orbit kimliğiyle tam akış, gerçek ağ  (10 vaka)
npm run parity:page     # D1 sayfası ↔ statik sayfa  (587 sayfa)
```

`parity` referanslarını Python tarafı üretir; karşılaştırma iki bağımsız
uygulamayı sınar, tek uygulamayı kendine karşı değil.

`test:orbit` anahtarı kendi üretir ve token'ı kendi imzalar: bozulmuş imza,
`alg:none`, algoritma değiştirme, süresi dolmuş token, başka site için
verilmiş token, bilinmeyen anahtar ve anahtar değişimi ayrı ayrı sınanır.
Sahte bir "doğrulandı" dönüşü yok — imza bozulunca test düşer.

`e2e` ve `test:orbit:e2e` çalışan bir Worker ister:

```bash
npm run migrate:local
npm run dev                                   # e2e için (8787)
```

Orbit takımı iki sunucu ister; ikisi de `.claude/launch.json` içinde tanımlı
(`orbit-fixture` → 8799, `haber-yayin-worker-orbit` → 8788).

## Site D1'den nasıl okuyor

Şablon D1 için ikinci kez YAZILMADI. `NewsLayout` (711 satır) ve
`[...slug].astro` (447 satır) olduğu gibi duruyor; Astro Cloudflare adaptörüyle
SSR koşuyor ve içerik kaynağı değişiyor:

```
sunucu modunda  → D1            (src/data/equinoxHaberD1.ts)
statik modda    → koleksiyon    (astro:content)
```

İki kaynak aynı girdi biçimini döndürüyor, o yüzden sayfanın hiçbir satırı
hangisinin konuştuğunu bilmiyor. Sonuç ölçüldü: **587 sayfanın 587'si bayt
bayt aynı** — şablon, ilgili haberler, önceki/sonraki, JSON-LD, meta etiketler
dahil.

Binding erişimi tek bir modülde (`#runtime-env`) ve mod başına takma adla
değişiyor. Takma adın ÇIPLAK bir tanımlayıcıya bağlı olması şart: Vite takma
adları içe aktarma dizesiyle eşleştiriyor, çözülmüş dosya yoluyla değil.
Mutlak yolu anahtar yapmak sessizce hiçbir şey eşleştirmiyor, dal budanıyor ve
sayfa farkına varmadan koleksiyona düşüyor. Bu tam olarak oldu ve yalnız
mutasyon testiyle görüldü — parity o sırada 587/587 "geçiyordu", çünkü
koleksiyonu kendisiyle karşılaştırıyordu.

## Renderer

Site bugün `satteri` kullanıyor (Astro 7 varsayılanı). Worker `unified()`
kullanıyor ve bu bir tercih değil zorunluluk: `satteri` bir napi native
modülü, Workers derlemesi `wasm32-wasi` varyantına düşüyor, o varyant da
paylaşımlı `WebAssembly.Memory`, çalışma anında `fetch` ile wasm yükleme ve
Web Worker istiyor — workerd'de üçü de yok. Ölçüldü: modül derleniyor, ilk
render'da `TypeError: createMdastHandle is not a function`.

Çıktı denkliği varsayılmadı, ölçüldü: 587 haberin 587'sinde HTML birebir aynı.
Tek fark URL'lerdeki `&` kaçış biçimi (`&amp;` / `&#x26;`) ve ikisi de geçerli
HTML.

**Site de `unified()`'a alındı** (`astro.config.mjs`). Sistemde artık tek
renderer var ve `&` farkı kaynağında yok oldu. Gerekçe: bugün anlaşan iki
işlemci yarın ayrışabilir, tek işlemci ayrışamaz.

Bu geçiş bir şeyi de öğretti. Site `satteri` iken saklanan HTML'de arşivin
tamamında bir satır sonu eksik görünüyordu ve renderer'a `+ "\n"` eklenmişti.
Ölçüm doğruydu ama yanlış şeyi söylüyordu: eksik satır sonu Astro'nun genel
davranışı değil, o zamanki işlemcinin davranışıydı. Site `unified`'a geçince
ekleme fazlalığa dönüştü ve kaldırıldı. Farkı KAPATMAK ile farkın NEDENİNİ
bulmak aynı şey değil; kapatmak, sebep değiştiğinde sessizce yanlış hale
gelir.

## Kapatılmamış olanlar

Bunlar bilerek açık ve canlıya çıkmadan önce kapanmalı:

1. **Orbit istemci kaydı.** Doğrulama kodu yazıldı ve sınandı, ama gerçek
   Orbit'te haber için bir istemci kaydı ve `sub` değerleri henüz yok —
   o Samet'in kararı. `publishers` tablosu bu yüzden boş; Selene'nin `sub`'u
   Orbit token verdiğinde eklenecek. Yapılandırılana kadar Worker yerel
   geliştirme sırrıyla çalışır.

2. **Şablon.** `GET /<slug>` çıplak HTML döndürüyor, `NewsLayout` değil.
   Bu dilimin sorusu "render-on-write uçtan uca çalışıyor mu" idi; şablon
   eşleştirmesi ayrı bir dilim.

3. **Göç — yerelde yapıldı, canlıda yapılmadı.** `npm run migrate:archive`
   587 haberi SQL'e çeviriyor (`body_html` göç anında üretiliyor, aynı
   renderer). Yerel D1'e uygulandı ve sayfa denkliği onun üzerinde ölçüldü.
   Canlı D1 henüz yok.

   Göç bir de içerik bulgusu çıkardı: **16 haber, 8 kaynağı ikişer kez
   kullanıyor** — her çift aynı haberin iki sürümü, biri İngilizce slug'la
   (kaynağın manşetinden türemiş), biri Türkçe. Eski sistemin bilinen
   davranışı. Göç ikisini de taşıyor; hangisinin kalacağı editoryal bir karar
   ve göç betiğinin vereceği bir karar değil.

4. **Git write-behind aynası.** Yayımlanan haberin `src/content/`'e yazılıp
   commit'lenmesi henüz yok. D1 gerçek kaynak olacaksa arşiv ve kurtarma yolu
   olarak bu gerekiyor.

## Yerel çalıştırma

```bash
npx wrangler d1 migrations apply haber --local
npm run dev
```

`.dev.vars` içinde `PUBLISH_TOKEN` gerekiyor (repoya girmez).
