-- Separate authority: a human Orbit identity may correct/withdraw/restore
-- tech stories by any author, but may never publish as one of the four agents.
-- Only the validated Orbit-OIDC browser session is accepted for this role.
CREATE TABLE newsroom_administrators (
  orbit_subject TEXT PRIMARY KEY,
  granted_at TEXT NOT NULL,
  disabled_at TEXT,
  note TEXT NOT NULL
);

-- Sponsor identity is pairwise: never embed it in public Git.
-- Seed only from a separately authorized existing Hemera publisher.
-- A missing or disabled anchor results in NO admin (fail closed).
INSERT INTO newsroom_administrators (orbit_subject,granted_at,note)
SELECT p.acts_for, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       'Verified Orbit sponsor of existing authorized Hemera publisher'
  FROM publishers AS p
 WHERE p.subject='agent:019f695c-e7a7-7018-8603-4479c35c6ea9'
   AND p.may_publish=1 AND p.disabled_at IS NULL
   AND p.acts_for IS NOT NULL
   AND NOT EXISTS(
     SELECT 1 FROM newsroom_administrators a
      WHERE a.orbit_subject=p.acts_for
   );
