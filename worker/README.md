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

## Ölçülen

| | sonuç |
|---|---|
| tek haber yayımlama (metin + 100 KB görsel) | **39 ms**, HTTP 201 |
| saklanan `body_html` ile Astro'nun canlı çıktısı | 587/587 birebir |
| `token_set_ratio` / `ratio` ↔ rapidfuzz | 8609 vaka, sapma 7e-15 |
| dil kapısı ↔ Python | 741 gövde + 1170 başlık, sapma 0 |
| kabul sözleşmesi ↔ Python | 609 vaka, kod ve mesaj dahil birebir |
| slug ↔ Python `slugify` | 596 vaka birebir |

Hepsi tek komut:

```bash
npm run parity
```

Referansları Python tarafı üretir, karşılaştırma iki bağımsız uygulamayı
sınar — tek uygulamayı kendine karşı değil.

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

**Açık karar:** site de `unified()` işlemcisine alınabilir. O zaman sistemde
tek renderer kalır ve bu kozmetik fark da kaybolur. Bugün agree eden iki
işlemci yarın ayrışabilir; tek işlemci ayrışamaz. Bu 587 sayfada görünmeyen
ama gerçek bir diff üretir, o yüzden ayrı bir karar.

## Kapatılmamış olanlar

Bunlar bilerek açık ve canlıya çıkmadan önce kapanmalı:

1. **Kimlik.** `authorize()` şu an paylaşılan bir sır karşılaştırıyor.
   Tasarlanan şey Orbit'in ES256 imzalı ID token'ının JWKS üzerinden
   doğrulanması ve `author`'ın token'ın `sub`'undan türetilmesi. Orbit'te
   istemci kaydı gerektiriyor. Buraya sahte bir Orbit doğrulaması yazılmadı:
   çalışıyormuş gibi duran bir kimlik katmanı, hiç olmayanından tehlikelidir.

2. **Pano güveni.** `brief` yükün içinde geliyor, yani "panoda olmayan aday"
   ve "çevrilmemiş başlık" kapıları ajanın kendi beyan ettiği panoya karşı
   ölçüyor. Kapılar duruyor ama kandırılabilir. Doğrusu: `prepare` panoyu
   sunucuya yazsın, `publish` yalnız `briefId` göndersin.

3. **Şablon.** `GET /<slug>` çıplak HTML döndürüyor, `NewsLayout` değil.
   Bu dilimin sorusu "render-on-write uçtan uca çalışıyor mu" idi; şablon
   eşleştirmesi ayrı bir dilim.

4. **Göç.** 587 haber henüz D1'de değil. Kasıtlı: tasarım oturmadan göç etmek
   göçü iki kez yapmak demek.

5. **Git write-behind aynası.** Yayımlanan haberin `src/content/`'e yazılıp
   commit'lenmesi henüz yok. D1 gerçek kaynak olacaksa arşiv ve kurtarma yolu
   olarak bu gerekiyor.

## Yerel çalıştırma

```bash
npx wrangler d1 migrations apply haber --local
npm run dev
```

`.dev.vars` içinde `PUBLISH_TOKEN` gerekiyor (repoya girmez).
