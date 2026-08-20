// @ts-check
// SSR yapılandırması — YALNIZ Worker dağıtımı için.
//
// `astro.config.mjs` dokunulmadan duruyor ve GitHub Pages'e giden statik
// derleme aynen çalışmaya devam ediyor. İki config'in ayrı olması kasıtlı:
// D1 yolu kanıtlanana kadar canlı dağıtımın tek satırı bile değişmemeli.
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import cloudflare from '@astrojs/cloudflare';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://haber.sametbasbug.dev',
  // Ayrı çıktı dizini şart: iki config aynı `dist/`'i paylaşırsa biri
  // diğerinin çıktısını siler ve CI'daki statik derleme sessizce SSR
  // çıktısının üstüne yazar.
  outDir: './dist-ssr',

  output: 'server',
  adapter: cloudflare(),
  /*
   * Markdown işlemcisi: `unified`, Astro 7 varsayılanı olan `satteri` değil.
   *
   * Gerekçe teknik bir zorunluluktan geliyor. `satteri` bir napi native
   * modülü; Cloudflare Workers derlemesinde `wasm32-wasi` varyantına düşüyor
   * ve o varyant paylaşımlı `WebAssembly.Memory`, çalışma anında `fetch` ile
   * wasm yükleme ve Web Worker istiyor — workerd'de üçü de yok. Yani yayın
   * Worker'ı markdown'ı `satteri` ile render EDEMEZ.
   *
   * İki işlemci bırakılabilirdi: site `satteri`, Worker `unified`. Çıktıları
   * ölçüldü ve 587 haberin 587'sinde aynıydı, tek fark URL'lerdeki `&`
   * kaçışının biçimi (`&amp;` / `&#x26;`, ikisi de geçerli HTML). Ama bugün
   * anlaşan iki işlemci yarın ayrışabilir; tek işlemci ayrışamaz. Sitenin de
   * `unified` kullanması, D1'den gelen haberle arşivdeki haberin bayt bayt
   * aynı sayfayı üretmesini yapısal olarak garantiliyor.
   *
   * `unified` Astro'nun desteklediği ikinci işlemcidir, bir geçici çözüm
   * değil.
   */
  markdown: { processor: unified() },

  compressHTML: true,

  vite: {
    resolve: {
      alias: {
        /*
         * Binding erişimi tek bir modülde ve mod başına değişiyor.
         *
         * Takma ad ÇIPLAK bir tanımlayıcıya bağlı (`#runtime-env`), göreli
         * yola değil: Vite takma adları içe aktarma DİZESİYLE eşleştiriyor,
         * çözülmüş dosya yoluyla değil. Mutlak yolu anahtar yapmak sessizce
         * hiçbir şey eşleştirmiyor — dal budanıyor, `getDatabase()` sabit
         * `undefined` dönüyor ve sayfa farkına varmadan koleksiyona düşüyor.
         * Bu tam olarak başıma geldi ve ancak mutasyon testiyle görüldü.
         */
        "#runtime-env": fileURLToPath(new URL("./src/data/runtimeEnv.workers.ts", import.meta.url)),
      },
    },
  },
});
