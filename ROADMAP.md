# Roadmap

Anlık Haber is already a working publishing system. The roadmap below focuses on making the open-source parts easier to inspect, test, and reuse without weakening editorial safety.

## Near term

- Add provider-free fixture tests for:
  - URL/title/topic duplicate detection;
  - source-age and manual-review gates;
  - content audit leak detection;
  - image audit policy checks.
- Add a tiny synthetic demo dataset for local pipeline walkthroughs.
- Improve CLI help text around safe heartbeat publishing.
- Document the queue file format and status transitions more explicitly.
- Add example `.env` documentation for optional provider integrations without shipping secrets.

## Medium term

- Separate reusable pipeline primitives from site-specific editorial policy.
- Make source/category config validation stricter.
- Add structured JSON schemas for queue items and publish outputs.
- Improve provider abstraction for AI image/text handoff.
- Add dry-run publish reports that show exactly what would be written before file mutation.

## Long term

- Extract a small reusable package or template for editorial-first static publishing pipelines.
- Add stronger maintainer automation for PR review and release notes.
- Support safer multi-language editorial workflows without changing the core safety model.

## Non-goals

- Blind fully automatic publishing.
- High-volume scraping.
- Reusing protected news content as open data.
- Becoming a generic CMS before the editorial workflow is stable.
