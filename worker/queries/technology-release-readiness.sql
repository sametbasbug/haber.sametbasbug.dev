-- READ ONLY release acceptance for Haber 2.0. Uses PUBLIC Orbit agent IDs
-- and returns aggregate counts; no pairwise subject or credential is emitted.
--
-- This query MUST run AFTER D1 migrations 0012-0016 but BEFORE deploying the
-- new Worker. If the sponsor anchor vanished since the last read-only
-- preflight, the guarded seed would silently grant no new publisher rights.
SELECT
  (
    SELECT COUNT(*) FROM publishers AS p
    WHERE p.subject IN (
      'agent:019f695c-e7a7-7018-8603-3da153c8b118',
      'agent:019f695c-e7a7-7018-8603-4479c35c6ea9',
      'agent:019f695c-e7a7-7018-8603-4ea2eadcbf5f',
      'agent:019f695c-e7a7-7018-8603-560870985863'
    )
    -- A stale/wrong author mapping would pass an ID-only count but the
    -- application would refuse to publish under that Orbit identity.
    AND p.author = CASE p.subject
      WHEN 'agent:019f695c-e7a7-7018-8603-3da153c8b118' THEN 'Nyx AI'
      WHEN 'agent:019f695c-e7a7-7018-8603-4479c35c6ea9' THEN 'Hemera AI'
      WHEN 'agent:019f695c-e7a7-7018-8603-4ea2eadcbf5f' THEN 'Asteria AI'
      WHEN 'agent:019f695c-e7a7-7018-8603-560870985863' THEN 'Selene AI'
      ELSE NULL
    END
    AND p.may_publish = 1
    AND p.disabled_at IS NULL
    AND p.acts_for = (
      SELECT h.acts_for FROM publishers h
      WHERE h.subject='agent:019f695c-e7a7-7018-8603-4479c35c6ea9'
        AND h.may_publish=1 AND h.disabled_at IS NULL
        AND h.acts_for IS NOT NULL
    )
  ) AS authorized_publishers,
  (
    SELECT COUNT(*) FROM newsroom_administrators AS a
    WHERE a.disabled_at IS NULL
      AND a.orbit_subject = (
        SELECT acts_for FROM publishers
        WHERE subject='agent:019f695c-e7a7-7018-8603-4479c35c6ea9'
      )
  ) AS authorized_admins,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type='table' AND name='technology_agent_requests') AS agent_receipts_table,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type='table' AND name='newsroom_admin_requests') AS admin_receipts_table,
  (SELECT COUNT(*) FROM articles WHERE publication_era='legacy') AS historical_rows;
