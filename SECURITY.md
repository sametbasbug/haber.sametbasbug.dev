# Security Policy

## Supported scope

This repository is a small public publishing system. Security reports are welcome for issues affecting:

- the Astro site code;
- the Python news pipeline;
- build/deploy workflows;
- CLI behavior that could publish unexpectedly;
- credential/token leakage risks;
- dependency or configuration problems.

Editorial disagreements, content corrections, and source-quality concerns are not security vulnerabilities. They can be opened as normal issues.

## Reporting

Please do not open a public issue for sensitive security problems.

Use GitHub private vulnerability reporting if available on the repository, or contact the maintainer through the public profile/site contact path with a short non-sensitive summary.

A useful report includes:

- affected file/command/workflow;
- reproduction steps;
- expected vs actual behavior;
- impact;
- suggested fix if you have one.

## Secrets and local data

Do not commit:

- API keys or provider tokens;
- cookies/session files;
- `.env` files;
- local queue/runtime data under `news_pipeline/data/`;
- generated drafts under `src/content/equinoxHaber/_drafts/`.

The repository intentionally keeps runtime data ignored except placeholder/docs files.
