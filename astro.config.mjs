// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
  compressHTML: true,
});
