/**
 * Build ONLY the validated, isolated Haber staging SSR bundle.
 *
 * Requires an explicitly reviewed staging Wrangler file. Does NOT create
 * D1/R2, deploy, read production data, manage credentials, or run migrations.
 * Production build and source public/robots.txt remain untouched.
 */
import { spawnSync } from 'node:child_process';
import {readFileSync,openSync,closeSync,fstatSync,ftruncateSync,writeSync,constants} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseWranglerJsonc,
  readHaberProductionConfig,
  validateHaberStagingConfig,
} from './technology-staging-config-check.mjs';

const OUT = new URL('../dist-ssr-staging/client/', import.meta.url);

export function finalizeStagingAssets(root, stageOrigin) {
  if (stageOrigin !== 'https://haber-site-staging.samett33710.workers.dev') {
    throw new Error('Unexpected Haber staging site origin');
  }
  const robots = resolve(root, 'robots.txt');
  const robotPolicy = 'User-agent: *\nDisallow: /\n';
  // Open the existing file ONCE without following symlinks. Validation,
  // truncation and replacement all target the same inode.
  let robotsFd;
  try {
    robotsFd=openSync(robots,constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  } catch(error) {
    if(error.code==='ENOENT') throw new Error('Staging build missing source robots.txt');
    throw error;
  }
  try {
    if(!fstatSync(robotsFd).isFile()) throw new Error('Staging robots.txt must be a regular file');
    ftruncateSync(robotsFd,0);
    if(writeSync(robotsFd,robotPolicy,0,'utf8')!==Buffer.byteLength(robotPolicy)){
      throw new Error('Failed to completely write staging robots policy');
    }
  }finally{
    closeSync(robotsFd);
  }

  const headers = resolve(root, '_headers');
  const headersFd=openSync(headers,
    constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o644);
  let resultHeaders;
  try {
    if(!fstatSync(headersFd).isFile())throw new Error('Staging _headers must be a regular file');
    const existing=readFileSync(headersFd,'utf8');
    const block='\n/*\n  X-Robots-Tag: noindex, nofollow\n';
    if(existing.includes('X-Robots-Tag:')){
      throw new Error('Existing staging _headers robot policy requires explicit review');
    }
    resultHeaders=existing.trimEnd()+block;
    ftruncateSync(headersFd,0);
    if(writeSync(headersFd,resultHeaders,0,'utf8')!==Buffer.byteLength(resultHeaders)){
      throw new Error('Failed to completely write staging headers');
    }
  }finally{
    closeSync(headersFd);
  }
  return {robots:robotPolicy,headers:resultHeaders};
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
