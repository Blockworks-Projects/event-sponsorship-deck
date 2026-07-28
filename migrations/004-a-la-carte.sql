-- Selling individual items instead of a tier. Asia only for now, but stored
-- per line with its event so London can be switched on without a migration.
--
--   a_la_carte: [{"key","label","event","moduleId","price"}]
--
-- Presence of this array is what makes a proposal à la carte: there is no
-- tier, so the tier table and its benefits are not shown.
alter table proposals add column if not exists a_la_carte jsonb;
