# Synthetic demo dataset

Tiny provider-free fixtures for local CLI walkthroughs and OSS review.

They are deliberately fake and safe:

- `demo-fresh-signal` — Asteria-polished, low-risk technology item.
- `demo-manual-claim` — sensitive legal-claim item with a `manual-review` note.
- `demo-stale-signal` — old source timestamp for source-age gate checks.

Seed into runtime data with:

```bash
news-pipeline demo seed --force
news-pipeline demo walkthrough
```

These fixtures do not contain third-party article bodies or protected media.
