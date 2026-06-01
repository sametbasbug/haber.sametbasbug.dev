# Anlık Haber

[![Quality Checks](https://github.com/sametbasbug/haber.sametbasbug.dev/actions/workflows/quality.yml/badge.svg)](https://github.com/sametbasbug/haber.sametbasbug.dev/actions/workflows/quality.yml)
[![Deploy](https://github.com/sametbasbug/haber.sametbasbug.dev/actions/workflows/deploy.yml/badge.svg)](https://github.com/sametbasbug/haber.sametbasbug.dev/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/code%20license-MIT-blue.svg)](LICENSE)

Anlık Haber is an editorial-first, AI-assisted news publishing system for [`haber.sametbasbug.dev`](https://haber.sametbasbug.dev/).

The project explores a practical question: can a small public news surface be maintained with a transparent pipeline where software handles ingestion, deduplication, queueing, audits, build/deploy discipline, and image generation, while an editorial agent/human-in-the-loop keeps the final news judgment?

The live site is Turkish and global-focused. The code and pipeline are documented in English/Turkish because the reusable part is the workflow, not only the content.

## What is open source here?

This repository is intentionally split into two layers:

- **Source code and workflow tooling** are MIT licensed. This includes the Astro site, Python news pipeline, CLI, audits, queue logic, and build/deploy workflow.
- **Editorial content, generated/published images, brand identity, and protected media** are not included in the MIT license. See [`CONTENT_LICENSE.md`](CONTENT_LICENSE.md).

In short: the system can be studied, reused, forked, and adapted; the published news archive and brand layer should not be treated as open content.

## Why this repository exists

Most small publishing projects eventually hit the same maintenance wall:

- collecting sources is easy, but selecting responsibly is hard;
- automation is fast, but blind autopublish is risky;
- duplicate stories and repeated angles quietly lower quality;
- AI-generated drafts can help, but they must not become the editor;
- publishing needs boring guardrails: audits, build checks, narrow commits, and rollback-friendly history.

Anlık Haber is a working experiment around those constraints.

## Architecture

The repository has two main parts:

- **Astro publishing surface** — static news pages, RSS, sitemap, category UI, author/site shell, and GitHub Pages deployment.
- **Python news pipeline** — RSS collection, normalization, duplicate reduction, editorial queue, scoring/filtering, quality gates, AI hero generation handoff, markdown generation, audits, and controlled publish workflow.

```text
haber-project/
  src/
    components/news/          # News UI components
    content/anlikHaber/       # Published markdown news items
    pages/                    # Astro routes, RSS, sitemap
  public/images/generated/    # Generated hero images
  news_pipeline/
    news_pipeline/
      collectors/             # RSS/source ingestion
      normalize/              # Raw item cleanup
      dedupe/                 # Similarity and duplicate checks
      editorial/              # Filtering, scoring, autonomy gates
      queue/                  # Editorial queue state
      publish/                # Markdown/frontmatter/hero helpers
      cli/                    # Typer CLI commands
    data/                     # Runtime data, ignored except placeholders/docs
```

## Editorial model

The project is **editorial-first**.

Python is not the editor. It is the technical rail: it collects, normalizes, scores, queues, audits, builds, and publishes only after the editorial handoff is present.

Asteria AI is the narrow editorial agent used in this project. Its role is to inspect candidates, read selected source URLs, write the Turkish article body, prepare facts/tags, and produce the hero image brief. The pipeline then validates and carries that work into the Astro site.

Current category set:

- **Siyaset**
- **Ekonomi**
- **Teknoloji**
- **Bilim**

Turkey-related stories are included only when the global context is strong enough for one of those categories.

## Core workflow

```bash
# Collect source items
news-pipeline collect

# Normalize raw items and update the queue
news-pipeline process

# Prepare a board for editorial selection
news-pipeline heartbeat prepare-one --json

# After editorial review/polish, publish through the technical rail
news-pipeline heartbeat publish-one --execute --no-collect --json

# Local quality gates
news-pipeline audit-content
news-pipeline audit-images
npm run build
```

The direct `publish` path is intentionally disabled in public CLI help. Production publishing should go through the heartbeat/editorial-polish route so the editorial handoff, hero brief, audits, and build checks are preserved.

## Quality and safety gates

The pipeline is designed to reduce common publishing failure modes:

- source age checks;
- URL/title/description/topic duplicate guards;
- manual-review separation for sensitive legal/political/personal-risk stories;
- required editorial polish before production publish;
- Turkish title/body/fact checks;
- required hero prompt and alt text;
- AI hero generation with WebP optimization;
- image/content audits before build;
- Astro build before deploy;
- narrow commit/push scope for published items.

CI runs provider-free checks only: Python compile, pipeline audits, and Astro build. It does not call external source collection, AI providers, or production publish commands.

## Installation

Requirements:

- Python 3.12+
- Node.js 24+
- npm

```bash
python3 -m venv news_pipeline/.venv
source news_pipeline/.venv/bin/activate
pip install -e news_pipeline
npm install
```

## Development commands

```bash
# Run the Astro dev server
npm run dev

# Build the static site
npm run build

# Run provider-free local quality checks
npm run quality

# Compile Python pipeline
python -m compileall news_pipeline/news_pipeline
```

## Documentation

- [`news_pipeline/README.md`](news_pipeline/README.md) — pipeline CLI and workflow details
- [`news_pipeline/OPERATIONS.md`](news_pipeline/OPERATIONS.md) — operational runbook
- [`news_pipeline/HEARTBEAT_RUNBOOK.md`](news_pipeline/HEARTBEAT_RUNBOOK.md) — heartbeat cycle notes
- [`news_pipeline/AUTONOMOUS_PUBLISH_POLICY.md`](news_pipeline/AUTONOMOUS_PUBLISH_POLICY.md) — autonomy boundaries
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution guidelines
- [`ROADMAP.md`](ROADMAP.md) — maintainability roadmap
- [`SECURITY.md`](SECURITY.md) — security reporting and scope

## Current status

This is a working public project, not a polished framework package. It currently powers the live Anlık Haber site and contains real operational history.

The near-term OSS goal is to make the reusable parts easier for others to study and adapt:

- clearer setup and example data;
- stronger tests around dedupe/scoring/audit gates;
- more provider-agnostic interfaces for AI image/text handoff;
- safer documentation for human-in-the-loop editorial automation.

## License

- Code and workflow tooling: [`MIT License`](LICENSE)
- Content, images, media, and brand layer: [`CONTENT_LICENSE.md`](CONTENT_LICENSE.md)
- Third-party materials remain subject to their original owners and terms.
