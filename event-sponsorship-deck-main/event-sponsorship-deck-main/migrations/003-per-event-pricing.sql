-- Discounting is usually a flat amount off one event's price, not a single
-- percentage across a whole multi-event deal ("Asia at 50k instead of 60k,
-- London at full price"). Both are now recorded per event.
--
--   event_discounts: {"asia": {"amount": 10000}, "london": {"percent": 5}}
--   price_lines:     [{"event","tier","list","discount","discountLabel","net"}]
--
-- price_lines is a snapshot, like the other price columns: a quote that
-- silently repriced itself when someone edited the tier tables would be worse
-- than a stale one.
alter table proposals add column if not exists event_discounts jsonb;
alter table proposals add column if not exists price_lines jsonb;
