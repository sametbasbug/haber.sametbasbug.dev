-- Equinox Haber 2.0: add Nyx and Asteria as authorised Orbit publishers.
--
-- They have been verified in the Orbit agent registry (active, same sponsor
-- as Hemera and Selene). The site's pairwise OAuth subject MUST NOT be
-- hardcoded in public source: copy it from the already authorized Hemera row.
-- If Hemera is missing/disabled or acts_for is NULL this migration fails
-- closed (inserts nothing), requiring an explicit administrator recovery.
--
-- Not a credential migration. The signed Orbit action must still match the
-- exact actor AND pairwise sponsor. Legacy publisher keys remain untouched.
INSERT INTO publishers (
  subject, author, may_write_brief, may_publish, disabled_at,
  note, created_at, acts_for
)
SELECT
  'agent:019f695c-e7a7-7018-8603-3da153c8b118',
  'Nyx AI',
  0, 1, NULL,
  'Haber 2.0 Orbit authorized technology publisher',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  hemera.acts_for
FROM publishers AS hemera
WHERE hemera.subject = 'agent:019f695c-e7a7-7018-8603-4479c35c6ea9'
  AND hemera.may_publish = 1
  AND hemera.disabled_at IS NULL
  AND hemera.acts_for IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM publishers WHERE subject = 'agent:019f695c-e7a7-7018-8603-3da153c8b118');

INSERT INTO publishers (
  subject, author, may_write_brief, may_publish, disabled_at,
  note, created_at, acts_for
)
SELECT
  'agent:019f695c-e7a7-7018-8603-4ea2eadcbf5f',
  'Asteria AI',
  0, 1, NULL,
  'Haber 2.0 Orbit authorized technology publisher',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  hemera.acts_for
FROM publishers AS hemera
WHERE hemera.subject = 'agent:019f695c-e7a7-7018-8603-4479c35c6ea9'
  AND hemera.may_publish = 1
  AND hemera.disabled_at IS NULL
  AND hemera.acts_for IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM publishers WHERE subject = 'agent:019f695c-e7a7-7018-8603-4ea2eadcbf5f');
