/**
 * Build ONLY the validated, isolated Haber staging SSR bundle.
 *
 * Requires an explicitly reviewed staging Wrangler file. Does NOT create
 * D1/R2, deploy, read production data, manage credentials, or run migrations.
 * Production build and source public/robots.txt remain untouched.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseWranglerJsonc,
  readHaberProductionConfig,
  validateHaberStagingConfig,
} from './technology-staging-config-check.mjs';

const OUT = new URL('../dist-ssr/client/', import.meta.url);

export function finalizeStagingAssets(root, stageOrigin) {
  if (stageOrigin !== 'https://haber-site-staging.samett33710.workers.dev') {
    throw new Error('Unexpected Haber staging site origin');
  }
  const robots = resolve(root, 'robots.txt');
  if (!existsSync(robots)) {
    throw new Error('Staging build missing source robots.txt');
  }
  // Cloudflare serves public/robots.txt as a static asset before middleware.
  // Replace ONLY the built copy. The live source remains Allow:/.
  writeFileSync(robots, 'User-agent: *\nDisallow: /\n', 'utf8');

  // Static assets and cached prerendered pages can bypass SSR middleware.
  // Cloudflare Workers static assets support _headers in the asset root.
  const headers = resolve(root, '_headers');
  const existing = existsSync(headers) ? readFileSync(headers, 'utf8') : '';
  const block = '\n/*\n  X-Robots-Tag: noindex, nofollow\n';
  if (existing.includes('X-Robots-Tag:')) {
    throw new Error('Existing staging _headers robot policy requires explicit review');
  }
  writeFileSync(headers, existing.trimEnd() + block, 'utf8');

  return { robots: readFileSync(robots, 'utf8'), headers: readFileSync(headers, 'utf8') };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !process.argv[2].startsWith('--config=')) {
      throw new Error('Explicit approved staging Wrangler path required');
    }
    const configPath = resolve(process.argv[2].slice('--config='.length));
    if (configPath === fileURLToPath(new URL('../wrangler.ssr.jsonc', import.meta.url))) {
      throw new Error('Production Wrangler configuration cannot be used for staging');
    }
    const candidate = parseWranglerJsonc(readFileSync(configPath, 'utf8'));
    const target = validateHaberStagingConfig(candidate, readHaberProductionConfig());
    const proc = spawnSync('npm', ['run', 'build:ssr'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PUBLIC_SITE_URL: target.siteOrigin,
        PUBLIC_NEWS_SITE_URL: target.siteOrigin,
        PUBLIC_HABER_STAGING: 'true',
      },
    });
    if (proc.error || proc.status !== 0) throw new Error('Staging SSR build failed');
    finalizeStagingAssets(fileURLToPath(OUT), target.siteOrigin);
    console.log('Isolated Haber staging SSR built with stage canonical, robots Disallow and noindex headers.');
  } catch {
    console.error('Haber staging build BLOCKED: unsafe config or incomplete noindex assets.');
    process.exitCode = 1;
  }
}
