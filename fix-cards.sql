-- Repairs the 9 cards the indexer mis-reads, using the copy as authored in the
-- decks. Keyed on google_slide_id, so it is exact and safe to re-run.
--
-- Why these 9: the indexer takes a card's bullets to be whatever sits between
-- the WHAT'S INCLUDED label and the AVAILABILITY label in slide element order.
-- On 8 of these the AVAILABILITY label is stacked ABOVE WHAT'S INCLUDED, so
-- that range is empty and no bullets are read. On the 9th it is stacked last,
-- so the "NEW YORK" chip fell inside the range and arrived as a bullet.
--
-- The permanent fix is in the decks: select the AVAILABILITY label and its
-- chips, then Arrange -> Order -> Bring to front. This restores the copy now,
-- and the sync no longer overwrites a good row with an empty one, so these
-- values hold until the slides are corrected.

-- ── DAS New York 2027 ──────────────────────────────────────────────────────
update sponsorship_modules set
  bullets = '["Blockworks handles venue booking, catering & branding","Blockworks manages invitations & RSVPs","Mingle with hundreds of DAS participants (Night 2 only)"]'::jsonb,
  updated_at = now()
where google_slide_id = 'nyc-activation-g3f9383ae59e_2_55-right';        -- Wrap Party

update sponsorship_modules set
  bullets = '["Branding on the cart front, napkins & mini signage","Fresh bagels & spreads for all attendees","Place branded stickers, brochures, or promotional items at the station"]'::jsonb,
  updated_at = now()
where google_slide_id = 'nyc-activation-g3f9383ae59e_2_479-left';        -- Bagel Bar

update sponsorship_modules set
  bullets = '["Drinks reception for all attendees (beer, wine & soft drinks)","Branding on napkins, koozies & signage at catering points","Place branded stickers, brochures, or promotional items at the station"]'::jsonb,
  updated_at = now()
where google_slide_id = 'nyc-activation-g3f9383ae59e_2_686-right';       -- Drinks Reception Sponsor

update sponsorship_modules set
  bullets = '["8 branded window clings (sponsor to provide artwork)","Branding on all table number signs","Callouts in the networking app as the designated meeting space"]'::jsonb,
  updated_at = now()
where google_slide_id = 'nyc-activation-g3f5a1819b4b_3_159-right';       -- 1:1 Networking Area

update sponsorship_modules set
  bullets = '["3 rotunda seats with a screen","Display video content or a static logo on the screens"]'::jsonb,
  updated_at = now()
where google_slide_id = 'nyc-activation-g3f5a38cd9e2_1_0-left';          -- Sponsored Seating

-- Drops the "NEW YORK" availability chip that leaked in as a third bullet.
update sponsorship_modules set
  bullets = '["Branded clings on restroom mirrors floor-wide","Design provided by sponsor; produced & installed by Blockworks"]'::jsonb,
  updated_at = now()
where google_slide_id = 'nyc-activation-g3f9383ae59e_2_686-left';        -- Restroom Mirror Clings

-- ── DAS 2026 (London / Asia) ───────────────────────────────────────────────
update sponsorship_modules set
  bullets = '["Includes branding on a three-sided pillar","Design to be provided by Sponsor, produced and installed by Blockworks"]'::jsonb,
  updated_at = now()
where google_slide_id = 'activation-g3f5b1579e84_0_1315-right';          -- Pillar Branding

update sponsorship_modules set
  bullets = '["Exclusive branding on mirrors outside session rooms","Repeated exposure during session transitions","Design to be provided by Sponsor, produced and installed by Blockworks"]'::jsonb,
  updated_at = now()
where google_slide_id = 'activation-g3f5b1579e84_0_1385-right';          -- Pillar Mirror Branding

update sponsorship_modules set
  bullets = '["Drinks reception for all attendees (beer, wine & soft drinks)","Branding on napkins, koozies & signage at catering points","Place branded stickers, brochures, or promotional items at the station"]'::jsonb,
  updated_at = now()
where google_slide_id = 'activation-g3f5b1579e84_0_1349-right';          -- Drinks Reception Sponsor

-- Confirm nothing is left empty:
select title, region, jsonb_array_length(bullets) as n_bullets
from sponsorship_modules
where category = 'activation' and status = 'published'
order by n_bullets, title;
