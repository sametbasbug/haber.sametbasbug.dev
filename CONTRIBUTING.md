# Contributing

Thanks for taking a look at Equinox Haber.

This repository is a working publishing system, so contribution discipline matters more than speed. The safest contributions are small, reviewable, and focused on the reusable code/workflow layer.

## What is in scope

Good contribution areas:

- newsroom documentation and setup clarity;
- provider-free tests for parsing, dedupe, scoring, audits, and queue behavior;
- safer CLI ergonomics and clearer error messages;
- RSS/source normalization improvements;
- Astro UI fixes that do not change the editorial identity;
- accessibility, metadata, RSS, sitemap, and build/deploy improvements;
- example fixtures that do not copy third-party article text.

## What is usually out of scope

Please avoid PRs that:

- republish or copy protected news content from this repository;
- add scraping behavior that violates source terms or robots expectations;
- bypass manual-review/editorial gates;
- enable blind autopublish as a default;
- add credentials, tokens, cookies, private feeds, or local runtime data;
- make broad redesigns without an issue/plan first.

## Local setup

```bash
python3 -m venv newsroom/.venv
newsroom/.venv/bin/pip install -e "newsroom[test]"
npm install
```

## Before opening a PR

Run the provider-free gates:

```bash
newsroom/.venv/bin/python -m pytest newsroom/tests
npm run build
```

Or, if your local venv is already wired into npm scripts:

```bash
npm run quality
```

Do not run commands that publish, push generated news, call AI providers, or mutate live queue data unless the PR is explicitly about that operation and the maintainer has agreed.

## Commit style

Prefer small commits with plain titles, for example:

- `Document provider-free quality gates`
- `Add duplicate-topic fixture test`
- `Clarify manual-review policy`

## Content and license boundary

Code is licensed under AGPL-3.0; contributions are accepted under the same licence. Editorial content, generated/published images, media, and brand identity are not part of that grant. See [`CONTENT_LICENSE.md`](CONTENT_LICENSE.md).

If you add fixtures, use synthetic examples or short metadata-only samples. Do not paste full third-party article bodies into the repository.
