-- Per-slide dwell heatmap for the sponsorship deck.
--
-- The sponsor-facing deck is the rendered slide images (deck_pages). Give each
-- page a title (captured during the hourly deck-pages sync) so the heatmap can
-- name slides instead of showing "Slide 7".
alter table deck_pages add column if not exists title text;

-- Engagement per view: how long each slide (by page index) was on screen while
-- the tab was focused, as { "<pageIndex>": <milliseconds> }, plus the total
-- focused time in the deck.
alter table deck_views add column if not exists slide_dwell jsonb;
alter table deck_views add column if not exists duration_seconds integer;
