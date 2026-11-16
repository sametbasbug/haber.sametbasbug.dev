-- Legacy news was safely archived privately before removal.
-- A restored historical snapshot must never put it back on the live site.
DELETE FROM articles WHERE publication_era='legacy';
