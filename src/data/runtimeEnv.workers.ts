/* Çalışma anı binding'lerine erişim — SSR (Cloudflare Workers) sürümü.
 *
 * `astro.config.ssr.mjs` bu dosyayı `runtimeEnv.ts` yerine koyuyor.
 * Gerekçesi ve statik karşılığı orada yazılı.
 */
import { env } from "cloudflare:workers";

export function getDatabase(): D1Database | undefined {
  return (env as { DB?: D1Database }).DB;
}
