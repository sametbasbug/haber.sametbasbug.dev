# Environment variables

This repository should run its provider-free checks without private secrets. The variables below are optional operational knobs used by production builds or local publishing runs.

Do not commit real tokens, API keys, cookies, private feed URLs, local queue data, or generated runtime artifacts. Keep local overrides in `.env` or your shell environment.

## Astro/site variables

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `PUBLIC_SITE_URL` | No | Canonical Astro site URL. Defaults to the live Haber URL. | `https://haber.sametbasbug.dev` |
| `PUBLIC_NEWS_SITE_URL` | No | Public news subdomain used by site links and metadata. | `https://haber.sametbasbug.dev` |
| `PUBLIC_MAIN_SITE_URL` | No | Main site URL used for ecosystem links. | `https://sametbasbug.dev` |
| `PUBLIC_NEWS_SUBDOMAIN_ENABLED` | No | Enables subdomain-style public news links when `true`. | `true` |

## News pipeline variables

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `NEWS_PIPELINE_DISABLE_AI_HERO` | No | Set to `1`/`true` to skip AI hero image generation, useful for tests and provider-free runs. | `1` |
| `NEWS_PIPELINE_REQUIRE_AI_HERO` | No | Set to `1`/`true` when publish should fail instead of falling back if AI hero generation is unavailable. | `0` |
| `NEWS_PIPELINE_AI_HERO_MODEL` | No | Overrides the configured AI image model for hero generation. | `openai/gpt-image-2` |
| `NEWS_PIPELINE_AI_HERO_TIMEOUT_MS` | No | Hero generation timeout in milliseconds. | `300000` |
| `NEWS_PIPELINE_AI_HERO_ATTEMPTS` | No | Maximum AI hero generation attempts. | `2` |
| `NEWS_PIPELINE_VERBOSE` | No | Enables extra pipeline logging when set to `1`/`true`. | `1` |
| `STALE_RAW_SECONDS` | No | Heartbeat helper threshold for stale raw RSS/source data. | `10800` |
| `PEXELS_API_KEY` | No | Optional fallback image provider key. Prefer generated/local hero images for Equinox Haber. | `pexels_...` |

## Local-only files

Ignored local/runtime paths include:

- `.env` and `.env.production`;
- `newsroom/.venv/`;
- `newsroom/data/`;
- `src/content/equinoxHaber/_drafts/`.

If a new provider or deployment integration needs more variables, document the variable name and safe purpose here, not the secret value.
