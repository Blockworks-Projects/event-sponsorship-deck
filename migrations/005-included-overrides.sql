-- Add-on step: per-event tweaks to a tier's included list.
--
-- A rep can drop benefits the tier normally includes, and add on others from
-- the same chart. Stored as { [event]: { removed: [...], added: [...] } } of
-- benefit labels. Null / absent means the tier's standard included list stands.
alter table proposals add column if not exists included_overrides jsonb;
