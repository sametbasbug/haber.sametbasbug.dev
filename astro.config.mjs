// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://haber.sametbasbug.dev',
  integrations: [sitemap()],

  // Astro 7 varsayılanı 'jsx' oldu: satır içi öğeler arasındaki boşluk JSX
  // kurallarına göre siliniyor. Sitede bu boşluğa bel bağlayan bir yer olup
  // olmadığını 585 sayfada tek tek doğrulayamayız; doğrulayamadığımız şeyi
  // sürüm yükseltmesinin yan etkisi olarak kabul etmiyoruz.
  //
  // Eski davranış açıkça sabitlendi. 'jsx'e geçmek ayrı ve ölçülerek verilecek
  // bir karar; o zaman kazanılan birkaç kilobayt karşılığında ne kaybedildiği
  // görsel olarak karşılaştırılmalı.
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
        // Statik derlemede binding yoktur; içerik koleksiyondan gelir.
        // Karşılığı `astro.config.ssr.mjs` içinde gerekçesiyle yazılı.
        '#runtime-env': fileURLToPath(new URL('./src/data/runtimeEnv.ts', import.meta.url)),
        '#news-source': fileURLToPath(new URL('./src/data/newsSource.ts', import.meta.url)),
      },
    },
  },
});
