/* Çalışma anı binding'lerine erişim — SSR (Cloudflare Workers) sürümü.
 *
 * `astro.config.ssr.mjs` bu dosyayı `runtimeEnv.ts` yerine koyuyor.
 * Gerekçesi ve statik karşılığı orada yazılı.
 */
import { env } from "cloudflare:workers";

export function getDatabase(): D1Database | undefined {
  return (env as { DB?: D1Database }).DB;
}

/** Yayın uçlarının binding kümesi: veritabanı, görsel deposu ve kimlik ayarı.
 *
 * `env` doğrudan geçiliyor; `worker/src/index.ts` hangi alanları okuduğunu
 * kendi `Env` arayüzünde tanımlıyor ve tek doğruluk kaynağı orası. */
export function getWorkerEnv() {
  return env as unknown as import("../../worker/src/index").Env;
}
