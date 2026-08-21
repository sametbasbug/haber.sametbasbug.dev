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
 * Takma ad ÇIPLAK bir tanımlayıcıya bağlı (`#runtime-env`), göreli yola değil:
 * Vite takma adları içe aktarma DİZESİYLE eşleştiriyor, çözülmüş dosya yoluyla
 * değil. Mutlak yolu anahtar yapmak sessizce hiçbir şey eşleştirmiyor — dal
 * budanıyor, `getDatabase()` sabit `undefined` dönüyor ve sayfa farkına
 * varmadan koleksiyona düşüyor. Bu tam olarak oldu ve yalnız mutasyon
 * testiyle görüldü.
 *
 * Astro v6 öncesinde bunun yolu `Astro.locals.runtime.env` idi; kaldırıldı.
 */
export function getDatabase(): D1Database | undefined {
  return undefined;
}

/** Yayın uçlarının ihtiyaç duyduğu binding kümesi.
 *
 * Statik derlemede API rotası zaten çalışmaz (`prerender = false`), ama tür
 * uyumu için aynı biçim döner. */
export function getWorkerEnv(): any {
  throw new Error('Yayın uçları yalnız sunucu modunda çalışır.');
}
