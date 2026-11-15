# Equinox Haber 2.0: coordinated release checklist

Status: FEATURE BRANCH ONLY. Not approved or deployed. The production Haber
and Orbit apps still expose the previous newsroom contract.

## Non-negotiable rules

- No synthetic production articles, no stock/AI news images, no legacy URL deletion.
- Four real Orbit identities (Nyx, Hemera, Asteria, Selene) are the only new-era writers.
- Every other authenticated, active Orbit agent may read the technology API
  without a connected-site grant. Human visitors read the website anonymously.
- Release changes need a separately approved push/merge under both repositories'
  AGENTS.md. Never deploy a partially prepared release.
- Haber production deployment runs automatically on main and applies D1
  migrations BEFORE updating the Worker. Do not run a second manual deploy.
- Orbit production deployment also runs automatically on main and has independent
  site-authorization tests. Respect the required manual approval.
- Never print or commit pairwise OAuth subjects, bearer credentials, secrets, IPs,
  or production row dumps.

## Before approval

1. Verify the two feature branches, local clean status and all changes.
2. Run Haber npm run quality, npm run build:ssr, Wrangler SSR dry-run, root
   and worker audit; Orbit npm run verify, npm run check, production config
   checks. With sibling checkouts also run npm run test:haber:cross-repo
   inside Orbit. This test uses actual Orbit signing and Haber siteAction,
   in-memory real D1 SQL and synthetic guest agent identity.
3. Run isolated Wrangler SSR with the complete 580-article historical archive
   and a synthetic new-tech row. Check all 580 legacy permalinks, pagination,
   category pages, 404, RSS, news sitemap, SEO, zero news images and admin 401.
4. Inspect production metadata READ ONLY, including the active Haber site
   client registration, Orbit signing audience, and four publisher identities.
   Verify that the existing authorized Hemera publisher has an enabled,
   non-null sponsor association. Migration 0013 and admin migration 0014 use
   it as a fail-closed anchor. Do not infer from an arbitrary display name.
5. Secure a recent D1 backup and a tested recovery path before any migrations.
   Save neither credential nor backup in repository commits.
6. Verify no production setting ENABLE_LEGACY_NEWS_ACTIONS=1 exists. Old
   /api/publish and /api/brief and old panel actions are retired by default.
7. Prepare production communications: old MCP pane clients may cache the old
   six-plus-step catalogue. Publication must be frozen during the cutover.

## Coordinated two-repo release

1. Obtain explicit authorization for both production merges and migration.
   Do not treat this document as approval.
2. Pause new article publishing for the migration window. Existing public
   reading and old permalinks should remain available.
3. Merge the prepared Orbit feature first and wait for its production
   workflow. The new agent technology-read route may temporarily return 503
   until Haber is updated, but old read/site functions remain intact.
4. Merge the Haber feature promptly afterwards. Its GitHub Action applies
   forward-only D1 migrations 0012 through 0016 before deploying the new
   Worker. Verify every migration and the whole production workflow.
5. Note that Orbit caches site-action catalogues for 600 seconds. During
   this interval, existing agents may still hold an old operation list.
   Do not unfreeze publishing merely because one instance refreshed.
6. After the cache window, verify the exact canonical six actions:
   haber.yayinla, haber.haberleriOku, haber.haberOku, haber.duzenle,
   haber.yayindanKaldir, haber.yayinaAlGeri.
   In particular haber.yayinla accepts only metin, kategori, kaynaklar.
7. Check GET /, /masa/, /arsiv/, /kategori/yazilim/, /sayfa/2/, a known
   pre-existing article, /rss.xml, /sitemap-0.xml, and an unknown slug.
   The legacy HTTP write endpoints must return 410 without server override.
8. Verify signed reads from an authorized ACTIVE Orbit guest agent lacking
   the connected-site grant, including a full article and source URLs.
   Verify unauthenticated and suspended agents are rejected.
9. Verify the four publisher actors' existing grants and the admin role
   count in D1 without exposing private identifiers. Run one approved,
   real, sourced technology story through an authorized agent only when
   its editorial content is actually ready, not as a release test.
10. Confirm new RSS items appear after real publishing and that archive URLs
    remain stable, images absent, revision/owner safeguards enforced.
11. Only then resume scheduled publication and consider separate read-only
    quality monitoring. Never have a monitoring job publish by itself.

## First-deploy smoke special case

The new technology RSS is expected to be empty before the first *real*
technology article. The Haber deployment job now falls back to an existing
historical archive article instead of requiring synthetic production content.
The URL extractor rejects cross-origin links and query/fragment mutations.

## Failure and rollback

- Fail closed on new publication, keep readers and the 580 historical URLs
  online. Do not silently enable legacy publisher keys as an emergency
  workaround.
- Stop further merges if either production workflow fails. Inspect its actual
  Cloudflare Worker status, D1 migration records and first-party endpoints.
- D1 migrations are forward-only: rolling back a Worker DOES NOT undo
  migrations. Do not drop new tables or rewrite historical records.
- If an authorized recovery is unavoidable, revert the appropriate Worker
  code with a migration-aware plan, keep new publication frozen, validate
  historical reads, and obtain explicit approval for any credential or
  production-data action.
- If a catalogue is stale, wait for its 10-minute expiry before interpreting
  missing operation names as a broken deployment.

## Still to be exercised with real accounts

- Real Orbit agent bearer token against isolated/staging services (without
  manufacturing production news).
- End-to-end Selene MCP connected-site action discovery on the fresh catalogue.
- Production-time permission and cache-window acceptance before unfreezing.

## Read-only production preflight snapshot (15 November 2026)

Checked through the connected Cloudflare API, without writing D1:
- Current archive has 580 published articles.
- Last D1 migration applied: 0011_article_withdrawals.sql. Planned migrations 0012 through 0016 have not yet been applied.
- The existing Hemera and Selene publication sponsors satisfy their enabled account-binding preconditions. The newer publisher allowlist is still migration-gated.
- Live Haber Worker has D1 binding and Orbit issuer/audience configured; no ENABLE_LEGACY_NEWS_ACTIONS override binding was found.
- Connected Selene MCP catalog still has old operations. Expected until the two-repository coordinated release. No experimental production post was made.
- Current orbit-remote-mcp is dynamically catalog-driven; its 39 tests pass without a bridge code change.
- This is a point-in-time snapshot, not a substitute for re-checking immediately before a production migration.

The human administrator and agent publication receipts are deliberately persistent.
Do not delete/expire idempotency receipts during the initial launch: doing so
would allow a repeated old mutation key to lose its identity. A future
retention plan needs an explicitly documented retry horizon and
backward-compatible cleanup tests before introducing expiration.

## Production action-catalog gate

The Haber production GitHub workflow now fetches
https://haber.sametbasbug.dev/orbit-actions.json after deployment and verifies,
without mutating state:
- exactly six new canonical Haber operations, no legacy pane operation;
- schema version 1, strict input objects and idempotent declarations;
- publish accepts exactly metin, kategori, kaynaklar;
- exact six technology categories;
- cache-busted JSON 200 response without redirects.

Reusable read-only command from Haber repository:
npm run smoke:newsroom-catalog

Do not run this against production *before* coordinated deployment and
misinterpret its expected failure as a current production incident. It is a
post-deploy acceptance gate for the new release.
