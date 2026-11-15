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

## CI safety gates prior to any production migration

- The Haber PR quality workflow now checks Node Orbit identity, signed news
  actions, atomic owner/replay semantics, catalogue, RSS fallback, pagination
  and TypeScript. It also builds BOTH static Astro and production SSR Worker
  and performs a Wrangler SSR dry-run without deploying.
- A main push triggers Haber deploy independently of the PR quality workflow.
  Therefore the deploy job itself now repeats these critical checks and runs
  Python 3.12 editorial pytest BEFORE forward-only D1 migrations 0012-0016.
  If these checks fail, the job stops before touching production D1.
- Keep test steps ahead of 'Apply D1 migrations' and 'Deploy the Worker' in
  .github/workflows/deploy.yml. Always parse YAML and inspect this order after
  changing deploy automation.
- Tech feed and category query pagination MUST be bounded by actual published
  technology counts. First page exists when the feed is empty; /?sayfa=2
  must 404 until 51 published items exist; /kategori/yazilim/?sayfa=2
  must 404 until 21 Yazılım items exist. The separate 580-item legacy archive
  is not counted as technology news.

## Orbit agent authorization gate (local Worker)

Orbit's D1 publication Worker test now exercises the actual `/v1/me/technology-news`
HTTP route before Haber is configured: anonymous requests get 401, suspended
and retired agents get 403, and an active `read_only` agent reaches only the
unconfigured site-client boundary (503). Read-only publication mode must not
block technology news retrieval. A missing Haber test client returning 503
is NOT proof that live cross-service reads succeed; real staging acceptance
remains a release prerequisite. Do not use a production credential in tests.

Haber technology authors cannot supply Markdown headings `## Kaynaklar` or
`## Ek kaynaklar` in article bodies; only the server constructs citations from
validated source URLs. This prevents ambiguity between editorial body text
and the authoritative source list returned by the Orbit API.

## Post-migration D1 authority acceptance gate

Migration 0013 and 0014 deliberately fail closed when the existing Hemera
publisher is absent, disabled or disconnected from the verified Orbit sponsor.
Successful SQL migration alone does not prove that four agents can publish.

GitHub deployment now executes a READ-ONLY D1 SELECT after migrations 0012
through 0016 and BEFORE replacing the production Worker. The query file at
worker/queries/technology-release-readiness.sql checks four expected public
Orbit agent IDs, the exact author names, their shared active sponsor, one
separate human administrator, two request-receipt tables and the 580-article
historical baseline. Its output only contains counts; it does not expose
pairwise subject or authentication secrets.

The scripts/technology-release-d1-check.mjs parser fails closed on wrong
counts or malformed JSON. The query and parser were exercised using real
local Wrangler D1 JSON, including success with synthetic four-agent
registration and expected failure with no publisher or a mismatched author.

If the gate fails after a forward-only migration, stop before deploying the
Worker. Diagnose via authorized operations; do not enable the old publisher
keys or assume an automatic rollback can undo D1 schema migrations.

## Orbit-Haber first-party deployment handshake

After the Haber production Worker is deployed, the smoke job also executes
`scripts/orbit-technology-release-check.mjs` against the PUBLIC Orbit API:

- `GET /v1/openapi.json` must document both agent-authenticated technology
  news GET operations and all six categories.
- `GET /v1/me/technology-news?limit=1` WITHOUT Authorization must return 401.
- These checks send no credential, grant, article mutation or production D1
  query. If Orbit was not deployed first, Haber release acceptance fails.

Unit tests: `npm run test:orbit-release-check`. Run the LIVE smoke only after
coordinated deployment, not against the intentionally old production contract.

The Orbit read bridge now has an explicit 15-second HTTP timeout and 256 KiB
streaming response byte cap, converting malformed/oversized/failed Haber
responses to generic 502 without leaking upstream debug text. The
connected-site catalog fetch preceding the action has its own 12-second
HTTP timeout and 128 KiB streaming byte cap. The two read routes document
502 (transient upstream failure) and 503 (missing service/catalogue) in the
OpenAPI and skill guide. No unauthenticated agent read was introduced.

### Pre-release public-only negative verification

On 15 November 2026, the same Orbit OpenAPI release probe was deliberately
run against the still-old live Orbit server with only anonymous GETs. It
correctly returned BLOCKED because the new credential-protected Haber
operations were absent in the live OpenAPI. This is an expected deployment
precondition, not a production incident. Never add a bypass to make the
pre-release response pass.

## D1 Time Travel and migration recovery (15 November 2026)

**Verified READ ONLY through the Cloudflare connector:** Haber D1 has
version=production; the Time Travel bookmark endpoint reports an available
current bookmark. No bookmark value or private sponsor was copied into code,
chat or a repository file.

Current docs: https://developers.cloudflare.com/d1/reference/time-travel/

Modern D1 automatically enables Time Travel. Retention is 7 days for Workers
Free and 30 days for Workers Paid; do not assume the account plan. Cloudflare
Time Travel RESTORE is destructive: it overwrites the *whole database* in
place. It is NOT a Worker code rollback, clone, or automatic deployment undo.

### Production pre-migration gate

Before every production D1 migration, the Haber GitHub Action now:

1. Records a UTC timestamp while publishing is frozen.
2. Calls the read-only Wrangler D1 time-travel info command with --json.
   A helper validates the returned bookmark shape; failure STOPS the run
   before D1 mutations.
3. Saves ONLY the UTC timestamp to the GitHub run summary. The bookmark
   is deliberately not printed, committed, or uploaded as an artifact.
   An authorized operator can resolve the bookmark from that timestamp.
4. Does not initiate any Time Travel restore under any circumstances.

Read-only command for the authorized recovery operator:

    npx wrangler d1 time-travel info DB --config wrangler.ssr.jsonc --timestamp="YYYY-MM-DDTHH:MM:SSZ"

Tests: npm run test:d1-recovery (13 positive and negative checks).

### Incident and recovery decision tree

- Migration fails BEFORE Worker deployment: leave old Worker running,
  inspect D1 migration history and old pages. Do not blindly reapply
  partial migrations or automatically restore production.
- Migration completes but publisher readiness fails: fail closed, keep
  old Worker and publishing frozen. Inspect authorized sponsor/admin data.
- New Worker is broken, but D1 remains sound: prefer an explicitly
  authorized Worker CODE rollback first. Additive schema migrations
  usually leave old article queries intact. Verify 580 legacy URLs.
- Actual D1 data corruption: freeze ALL writers, retrieve a current
  recovery bookmark, review whether any legitimate news, edits or
  sessions occurred since the recorded pre-migration UTC reference.
  A Time Travel restore would DELETE every later write, not just the
  faulty migration. Before a destructive restore, obtain an independently
  secured production export, a reconciliation plan and explicit approval.
  After restore, verify migration history, historic articles, actor
  bindings, session safety, site metadata and Orbit integrations.
- Never enable the retired publisher-key HTTP endpoints as an emergency
  workaround. Never automate destructive restore in CI.

### What the local restoration rehearsal proves

worker/tools/technology-local-recovery-tests.mjs reconstructs the actual
580 published Markdown archives with sources/tags in pre-0012 SQLite, saves
an in-memory SQLite snapshot, runs REAL migrations 0012-0016, creates
one synthetic technology row, and restores the prior snapshot into a fresh
in-memory database. It verifies unchanged historical content hash, sources,
tags, site version, legacy schema, disappearance of the synthetic row and
valid SQLite integrity/foreign keys.

This DOES NOT test Cloudflare Time Travel's remote restore implementation.
The bookmark preflight and a separately approved real recovery remain
necessary. The local test writes no production record and deletes temp SQL.

### Legacy publisher entrypoint: read-only verification

The connected Cloudflare API was queried read-only on 15 November 2026:
- active legacy publisher-key digests: 0
- legacy publisher-key digests of any status: 0
- active publisher rows whose subject is NOT an agent identity: 1

No key digest, OAuth pairwise subject, token or sensitive row was retrieved.
This confirms there is **no old publisher-key credential to revoke** at
present. Do not add an unnecessary irreversible key-revocation migration.

However the currently deployed *old* Worker still permits its former
human Orbit ID-token publication path. The publication freeze before
coordinated migrations therefore remains an actual operational
requirement until the new Worker explicitly returns HTTP 410 on both
old /api/brief and /api/publish. If the after-migration D1 readiness
gate blocks the Worker deployment, the old Worker's writes are not
automatically frozen by the existence of a Time Travel bookmark.
Do not infer a freeze from a green build or a successful SQL migration.

No production publisher permission or identity was modified while making
this read-only observation.

### Two-version cache window, locally verified

Orbit's real cached first-party site action discovery has a 600-second TTL.
The new isolated test scripts/orbit-haber-cutover-tests.ts covers:
new Orbit + old Haber catalogue -> 503 with ZERO signed read delegation;
new Haber catalogue within old cached TTL -> remains 503 until expiry;
refresh after TTL -> new read works; Haber catalogue rollback -> 503.
The test cannot observe the actual production isolate cache after deploy.
Keep the publication freeze until real operations appear in the agent MCP
catalogue and signed guest reads have been separately validated.

## Independent D1 SQL backup acceptance (checkpoint 13)

A Time Travel bookmark is necessary but **not** an independent copy.
Before approving production migration, an authorized operator must take a
recent whole-DB Cloudflare D1 SQL export, store it privately outside the
Git repository and verify it can be independently imported. Do NOT
extract, print, upload, commit, or retain this sensitive production
export without permission.

With approval, choose an encrypted/private destination outside the repo:

    npx wrangler d1 export DB --remote --config wrangler.ssr.jsonc --output /secure/private/haber-pre-migration.sql --skip-confirmation

Verify it locally with NO remote mutation:

    node scripts/d1-export-integrity.mjs /secure/private/haber-pre-migration.sql

The checker imports SQL into in-memory Node SQLite. It validates:
- SQLite integrity and foreign-key relationships;
- at least 580 published historical articles, each with >=1 source;
- no orphan source records and no duplicate article slug;
- D1 migration history present, with at least the 11 live migrations.

It prints only aggregate counts and schema era, never article contents,
private account identifiers, publisher hashes, the export path or SQL
parse errors. The SQLite authorizer denies ATTACH/DETACH to prevent an
unexpected export from creating auxiliary files on the local device.
Exports larger than 128 MiB require manual review. Keep backups outside
the Git repository and delete temporary exports after authorized retention.

Actual Wrangler **LOCAL** export format was tested on both old (migration
0011) and new (migration 0016) schemas, each containing 580 published
historical articles and 590 source records. These are not production
exports. No live data was copied or restored.

A remote production backup and a real remote restore remain separately
authorized release blockers, not automatic CI mutations.

### Coordinated release precondition: Orbit MUST go first

The Haber deploy workflow now checks the real live Orbit OpenAPI and anonymous
401 rejection BEFORE the Time Travel bookmark and D1 migrations, in addition
to the existing post-deploy check. If the Orbit feature is not already live,
Haber's production migration is blocked and the existing Haber Worker is
unchanged. This is deliberately fail-closed; do not bypass it merely to turn
the deployment green. When Orbit's public OpenAPI is stale, allow Cloudflare
cache to refresh, then retry after confirming the real Orbit deployment.

The durable release-order regression script tests the actual GitHub Actions
YAML and seven deliberate broken order/gate mutations. Run:

    npm run test:technology-deploy-order

The independent SQL backup verifier compares EVERY canonical historical slug,
not merely 580 total rows, verifies complete migration file names and checks
new-era receipt/admin/revision tables when migrations 0012-0016 are present.
Actual old/new Wrangler local SQL dumps both passed this strengthened gate.
The standalone verifier must be run on any separately authorized, privately
stored production export before merging the Haber feature.

## Checkpoint 14: pre-migration authorization gate

The Haber production workflow now checks the existing Hemera and Selene
publisher anchors BEFORE any forward-only D1 schema migration, after the
public Orbit API readiness probe and before the Time Travel bookmark gate.

The READ-ONLY worker/queries/technology-pre-migration-readiness.sql and
scripts/technology-pre-migration-check.mjs use public Orbit agent IDs and
return ONLY aggregate counts plus a public migration filename. They reject
wrong or disabled authors, missing/mismatched sponsor bindings, active legacy
publisher keys, orphan sources, too few historical published articles,
unexpected prior Nyx/Asteria rows and any unknown migration state.

Every future main push runs this gate, even AFTER first launch. Therefore it
intentionally accepts exactly two reviewed states: pristine 0011 with two
authorized old publisher anchors and zero new schema tables, OR complete
0016 with four authorized agents and four required new schema tables.
Partially migrated 0012-0015 and unreviewed future 0017+ are fail-closed.
Update the preflight and its tests deliberately before any future migration.

The postmigration SQL now counts PUBLISHED historical legacy articles,
not archived rows that were quietly withdrawn and no longer have working
public URLs. An isolated real SQL test confirms withdrawn legacy content
does not count toward the minimum 580 working legacy permalinks.

Validation: 27 SQLite preflight cases, real local Wrangler 0011 to 0016
and a second no-op deployment. Both normal releases passed; partial schema
and wrong sponsor were rejected. Read-only Cloudflare connector SELECT of
the current live 0011 schema confirmed two aligned enabled Hemera/Selene
publisher anchors, zero active legacy keys, zero unexpected Nyx/Asteria
records, 580 published historical articles, 11 migrations and no orphan
article sources. No private OAuth ID, token, row body, or write was used.

## Checkpoint 15: enforce the EXACT 580 historical permalinks

The old release gate only counted at least 580 published historical rows. A
database with 579 original articles plus one unrelated replacement could
still pass that aggregate gate, even though one real permalink disappeared.

The new read-only production checks generate SQL dynamically from the
exact 580 public Markdown filenames in src/content/equinoxHaber:

- scripts/technology-legacy-permalinks.mjs --sql=historical (pre-migration
  schema, no publication_era column);
- scripts/technology-legacy-permalinks.mjs --sql=technology (postmigration,
  each URL must also be in the legacy era);
- scripts/technology-legacy-permalinks.mjs --check (verifies Wrangler D1
  aggregate JSON, never exposes individual database rows).

The generated SQL has 580 explicit public slugs but returns ONLY three
counts: expected_permalinks, published_permalinks, sourced_permalinks.
All three MUST equal 580. This protects each original URL, its published
status, source association and correct new-era classification. It uses
no credential, private sponsor, article body or unexpected mutation.

The checks run in GitHub Actions BEFORE migrations and AFTER migration
but BEFORE the new Worker deploy. SQL is generated into a temporary
file with an EXIT trap and is deleted even if an intermediate command
fails. Any missing link prevents migration/release.

Verified with real Wrangler LOCAL D1 using the actual 580-item archive:
- pre-0012 SQL query: 580/580 READY;
- after applying 0012-0016: 580/580 READY;
- deliberately withdrawing ONE old article in isolated D1: 579/580
  BLOCKED as intended.
- 32 in-memory SQLite, invalid manifest, wrong era, malformed response
  and CLI leak tests green; 14 workflow gate mutation/ordering checks green.
- READ ONLY Cloudflare plugin execution of the same generated pre-migration
  SQL against current real Haber production D1 returned 580 expected,
  580 published, 580 sourced, with no errors. No article text, private row,
  token or database mutation was used.

This adds a strict invariant: changing the legacy Markdown manifest from
exactly 580 files requires a reviewed change to these tests and the D1
migration plan. Never silently loosen it to accept missing historical URLs.

### Postdeploy smoke resilience

Both retired legacy HTTP writer endpoints MUST return 410:
POST /api/brief and POST /api/publish. The old workflow checked only
/api/publish. An unknown article URL must return 404 instead of silently
falling back to a generic success page. The postdeploy curl probes now
include 5-second connection and 15-second total timeouts to avoid hanging
indefinitely on a broken runtime.

Public Orbit OpenAPI and Haber action-catalog smoke responses are now
size-bounded during streaming, not *after* Response.json()/text() has
allocated an arbitrary upstream payload. Invalid UTF-8, oversized streams,
unexpected JSON and parsing errors fail closed with sanitized error messages.
These checks do not publish content or use real agent credentials.

## Checkpoint 16: strict agent authentication and signing-key resilience

The release acceptance previously checked that *some* OpenAPI security
requirement on the new Orbit technology-news GET operations included
agentCredential. OpenAPI security requirements are OR alternatives:
[{},{agentCredential:[]}] incorrectly satisfies a "some" check even though
the first entry advertises anonymous access. The gate now demands exactly
one authorization requirement with exactly the empty-scoped agentCredential
key, and validates the declared scheme is HTTP bearer. Both list AND
detail endpoints must return HTTP 401 without an agent credential.
Regression tests deliberately add an anonymous alternative, extra scope,
unrelated scheme and unprotected detail endpoint: each is rejected.

Haber independently verifies Orbit ES256 documents against JWKS. OIDC
discovery and JWKS fetch are now restricted to HTTPS and configured Orbit
issuer origin, with manual redirects, 8-second timeouts per fetch, 32 KiB
discovery and 64 KiB JWKS streaming limits and at most 16 signing keys.
Invalid or inaccessible documents return a sanitized HTTP 503 rather than
leaking upstream response fragments. Cached keys continue to work and
unknown signing key IDs can be refreshed, preserving planned rotation.
The live public Orbit discovery metadata was checked read-only: issuer
and JWKS origin both match https://orbit.sametbasbug.dev. No token,
account record or production D1 mutation was involved.

The technology layout theme toggle now initializes aria-pressed from saved
or operating-system theme and updates it when an unoverridden system theme
changes. scripts/technology-theme-tests.mjs executes the REAL Astro inline
controller in deterministic DOM/MediaQuery mocks and checks initial dark,
initial light, OS changes, user overrides and unavailable browser storage.

These safeguards are local feature-branch work. They do not prove that
live production agent credentials or upgraded two-Worker staging have
already been accepted. Do not bypass live-read, issuer or publisher checks.

Checkpoint 16 final validation: the live public Orbit discovery response was
842 bytes and the public JWKS was 193 bytes containing one signing key, below
both newly enforced streaming and key-count limits. This was an anonymous
GET only and did not access any private signing key or bearer credential.

Negative mutation proof: each of the three key regression checks was
intentionally weakened in a disposable local edit, and its real test
FAILED as expected: allowing multiple OpenAPI security alternatives,
removing the JWKS issuer-origin constraint, and skipping initial dark-mode
aria-pressed synchronization. After restoration, the real tests passed.
This confirms the red/green signal instead of merely relying on green-only
fixtures. All temporary mutation copies were deleted.

Additional checkpoint 16 input boundary: a signed site-action JWT never
contains the 25,000-character article body, only short identity claims.
The signature verifier now rejects tokens above 8 KiB before Base64/JSON
decoding; only the 64-byte raw P-256 ECDSA signature form is accepted.
Malformed Base64URL, empty/truncated/oversized signatures and WebCrypto
verification exceptions return a normal HTTP 401, never an uncaught
server error. Five new genuine WebCrypto negative checks were added to
worker/tools/orbit-token-tests.mjs (65/65 total). Correctly signed
documents and key rotation remain accepted.

## Checkpoint 17: malformed signed claims and concurrent signing-key lookups

A public malformed JWT containing a JSON null header used to throw an
unhandled TypeError when Haber dereferenced header.alg, potentially
returning HTTP 500 instead of rejecting an unauthenticated caller.
The actual before-fix regression reproduced the exception. The common
Orbit token verifier now rejects null, primitive and array header/claims
before property access, with HTTP 401. The public /api/orbit-eylem entrypoint
also has an explicit test that malformed JWTs return 401 without database
writes or denial-audit rows. Correctly signed normal ID tokens continue to
work, and the release does not bypass ES256 verification.

The Orbit signed site-action contract grants exactly 60 seconds of authority.
The action verifier now requires integral issued-at and expiry claims, an
expiry not earlier than issuance, and exp-iat no greater than 60 seconds.
This restriction applies to *site-action* documents, NOT ordinary Orbit
ID tokens, which can legitimately have a longer lifetime. Local true-ES256
tests include a valid 60-second document, an invalid 61-second document,
missing/wrong issue times and a far-future expiry.

Malformed ECDSA signature shapes are now checked BEFORE a potential network
fetch for unknown JWKS key IDs. Untrusted invalid signatures cannot force
a signing-key rediscovery merely by supplying an unpublished kid.

Concurrent requests for an unknown kid previously triggered separate
discovery+JWKS downloads per caller. A shared per-isolate in-flight promise
now coalesces simultaneous refreshes while keeping cached known keys
available. The regression was red before the fix (six discoveries and six
JWKS fetches), green after (one discovery and one JWKS fetch). Tests also
cover a temporary provider outage (all callers get sanitized 503, only one
fetch attempted), and a successful later retry after the failed in-flight
promise is cleared. Serial unknown-kid probing remains subject to existing
Worker/HTTP protections; single-flight is NOT a network-wide rate limiter.

No production JWT, account, key material, or D1 mutation is used in these
tests. Actual Orbit ES256-signed cross-repo read requests must still pass
before a coordinated production release.

Checkpoint 17 local HTTP acceptance: the actual built Haber SSR Worker was
started with local Wrangler on loopback, isolated /tmp D1 persistence and
a PUBLIC issuer URL supplied only to that test server. A synthetic malformed
JWT with JSON null as its header was POSTed to /api/orbit-eylem. The Worker
returned HTTP 401 with the expected sanitized invalid-token message,
not HTTP 500. No D1 query or write was required on that path. The first
probe correctly returned 503 because the default local Wrangler
configuration lacks ORBIT_ISSUER; retesting with an explicit PUBLIC local
issuer binding produced 401. This is not evidence of a real Orbit credential
being authenticated, and the live deployment was not touched. Local Worker
process and isolated D1 state were removed on exit.

## Checkpoint 18: signed action expiration is NOT OIDC expiration grace

The shared Orbit ID-token validator accepts up to 60 seconds of clock skew
after exp. This is appropriate for longer-lived interactive OIDC flows,
but the Haber action delegation is deliberately valid for only 60 seconds.
Checkpoint 17 verified exp - iat <= 60 and therefore appeared to enforce
the short lifetime. That condition alone did NOT prevent the common verifier
from accepting an action with exp 1-20 seconds in the past, effectively
extending the credential to approximately 120 seconds after issuance.

The Haber action verifier now ALSO enforces exp > current UTC second with
NO expiration grace. Only the start of the signed action permits a small
five-second positive clock lead (iat <= now+5), to avoid false failures
between the Orbit issuer and Haber worker clocks. Ordinary Orbit ID tokens
retain their pre-existing OIDC clock skew semantics. The signed action still
must declare integral iat/exp, exp >= iat and exp - iat <= 60.

Real ES256/WebCrypto regression proof:
- Before the fix, a correctly signed action expired by 1 second, one expired
  by 20 seconds and one issued 30 seconds in the future were all ACCEPTED.
- After the fix, all three are rejected with HTTP 401; a 60-second action and
  an action with three seconds of issuer clock lead still pass.
- Temporarily removing only the strict-expiration branch made both
  expired-action tests fail RED. Restoring the branch returned 92/92 GREEN.
- The actual technology publication E2E remains successful.

The release gate remains blocked until the updated Orbit API is live.
Do not infer a successful local signed-action test is a real active-agent
credential acceptance or a production deployment.

### Checkpoint 18: prevent hidden articles at reserved Astro URLs

The new technology publisher originally checked new titles against existing
D1 article slugs but did not check URLs already owned by the WEBSITE.
A valid three-field story with the short title "İletişim" passed all
publication checks and was written under the slug /iletisim/. However that
address is an existing static contact page, which has priority over the
dynamic article route: an article could be successfully committed yet not
be reachable by readers.

New technology publication now rejects first-level reserved Astro and
server-injected route slugs with HTTP 422 BEFORE any D1 article insert.
The existing live historical articles are not rewritten and old archival
URLs remain unchanged. The specific reservation set covers root static
pages and the server-side route namespaces (such as /api, /yonetim,
/profil, /giris, /arsiv, /kategori, /masa and /yeni).

The real publisher regression test also parses src/pages root entries and
the actual injectRoute declarations in astro.config.ssr.mjs. Every current
static root page and SSR first-level route must be in the reserved-slug
set. A future site route addition without a corresponding reservation
therefore breaks the pre-migration publication tests rather than allowing
an unreachable article to be published later.

Two deliberate mutation tests were RED as required: disabling the live
publication guard let "İletişim" publish (expected test status 422 was
201), and deleting "iletisim" from the reservation set caused the
real Astro-route coverage test to fail. Restoring the source returned
the full D1 publication test to GREEN. No production content was changed.
