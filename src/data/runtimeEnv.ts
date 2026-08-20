/* Çalışma anı binding'lerine erişim — STATİK derleme sürümü.
 *
 * Statik derlemede Cloudflare binding'i yoktur ve olmaması normaldir: içerik
 * o modda içerik koleksiyonundan gelir.
 *
 * SSR derlemesinde bu dosya `runtimeEnv.workers.ts` ile değiştiriliyor
 * (`astro.config.ssr.mjs` içindeki takma ad). İki dosya olmasının sebebi
 * `cloudflare:workers` modülünün yalnız Worker çalışma anında var olması —
 * statik derlemede içeri alınırsa Vite onu çözemez ve derleme düşer.
 *
 * Astro v6 öncesinde bunun yolu `Astro.locals.runtime.env` idi; kaldırıldı.
 */
export function getDatabase(): D1Database | undefined {
  return undefined;
}
