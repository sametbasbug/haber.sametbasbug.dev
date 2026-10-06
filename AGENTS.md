# Repository instructions

## Deployment

- Production deployment is automatic on every push/merge to `main` via `.github/workflows/deploy.yml`.
- After a normal PR merge, **do not run an additional manual production deploy**. Wait for the `Deploy Haber to Cloudflare` workflow and verify its result instead.
- Manual deployment is only for an explicit request, a failed/missing automatic deploy, or a deliberate recovery operation.
- The production Worker uses the custom SSR pipeline: `npm run build:ssr` with `wrangler.ssr.jsonc`. Do not use generic `cf deploy` auto-detection for this repo; it may choose the standard Astro build instead of the custom SSR build.

## Dependency constraints

- Keep TypeScript on `6.0.3` until the Astro toolchain used by this repo officially supports TypeScript 7. Do not bump to TypeScript 7 just because `npm outdated` reports it.
