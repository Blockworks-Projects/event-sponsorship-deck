-- What an à la carte city says under "Tier" on the cover.
--
-- A city sold item by item has no tier, so its cover card read "Tier: —". The
-- rep now types that line per city in the builder — "Custom Package", "Track
-- Stage Partner", whatever the deal is called — and it shows where a tier
-- would. Stored as { [event]: label }; null / absent leaves the dash.
alter table proposals add column if not exists a_la_carte_labels jsonb;
