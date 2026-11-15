-- READ ONLY production preflight against Haber D1 *historical* schema 0011.
-- Executed before applying migrations on EVERY release, including after
-- Haber 2.0 has already reached migration 0016. No private OAuth pairwise
-- subject, key digest, token or publisher record is included in the output.
--
-- Accept only the known safe eras: historical 0011 (initial cutover) or
-- fully migrated 0016 (future no-op deploys). A partial 0012-0015 migration
-- needs explicit human recovery, not an automatic repeat.
SELECT
  (
    SELECT COUNT(*) FROM publishers AS p
    WHERE (
      (p.subject='agent:019f695c-e7a7-7018-8603-4479c35c6ea9' AND p.author='Hemera AI')
      OR (p.subject='agent:019f695c-e7a7-7018-8603-560870985863' AND p.author='Selene AI')
    )
    AND p.may_publish=1
    AND p.disabled_at IS NULL
    AND p.acts_for IS NOT NULL
    AND p.acts_for=(
      SELECT h.acts_for FROM publishers h
      WHERE h.subject='agent:019f695c-e7a7-7018-8603-4479c35c6ea9'
        AND h.author='Hemera AI'
        AND h.may_publish=1 AND h.disabled_at IS NULL
        AND h.acts_for IS NOT NULL
    )
  ) AS valid_publisher_anchors,
  (
    SELECT COUNT(*) FROM publishers AS p
    WHERE p.subject IN (
      'agent:019f695c-e7a7-7018-8603-3da153c8b118',
      'agent:019f695c-e7a7-7018-8603-4479c35c6ea9',
      'agent:019f695c-e7a7-7018-8603-4ea2eadcbf5f',
      'agent:019f695c-e7a7-7018-8603-560870985863'
    )
    AND p.author = CASE p.subject
      WHEN 'agent:019f695c-e7a7-7018-8603-3da153c8b118' THEN 'Nyx AI'
      WHEN 'agent:019f695c-e7a7-7018-8603-4479c35c6ea9' THEN 'Hemera AI'
      WHEN 'agent:019f695c-e7a7-7018-8603-4ea2eadcbf5f' THEN 'Asteria AI'
      WHEN 'agent:019f695c-e7a7-7018-8603-560870985863' THEN 'Selene AI'
    END
    AND p.may_publish=1 AND p.disabled_at IS NULL
    AND p.acts_for=(
      SELECT h.acts_for FROM publishers h
      WHERE h.subject='agent:019f695c-e7a7-7018-8603-4479c35c6ea9'
        AND h.may_publish=1 AND h.disabled_at IS NULL
        AND h.acts_for IS NOT NULL
    )
  ) AS authorized_publishers,
  (
    SELECT COUNT(*) FROM publishers
    WHERE subject IN (
      'agent:019f695c-e7a7-7018-8603-3da153c8b118',
      'agent:019f695c-e7a7-7018-8603-4ea2eadcbf5f'
    )
  ) AS seeded_new_agent_rows,
  (
    SELECT COUNT(*) FROM sqlite_master
    WHERE type='table' AND name IN (
      'article_revisions','newsroom_administrators',
      'newsroom_admin_requests','technology_agent_requests'
    )
  ) AS technology_schema_tables,
  (SELECT COUNT(*) FROM publishers WHERE key_digest IS NOT NULL AND disabled_at IS NULL)
    AS active_legacy_keys,
  (SELECT COUNT(*) FROM d1_migrations) AS applied_migrations,
  (SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1) AS latest_migration,
  (SELECT COUNT(*) FROM articles WHERE is_draft=0) AS historical_published,
  (
    SELECT COUNT(*) FROM article_sources s
    LEFT JOIN articles a ON a.slug=s.slug
    WHERE a.slug IS NULL
  ) AS orphan_sources;
