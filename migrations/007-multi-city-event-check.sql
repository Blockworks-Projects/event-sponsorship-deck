-- The `event` check constraint predated multi-city proposals.
--
-- A proposal's `event` is one city ('london'), several joined with '+' in
-- chronological order ('london+nyc', 'asia+london+nyc'), or 'both' — Asia +
-- London's original spelling, kept so old rows and new ones match (see
-- src/lib/events.ts, which is the only place that spelling lives).
--
-- The original constraint listed the single cities plus 'both' and nothing
-- else, so saving any other pairing failed with:
--   new row for relation "proposals" violates check constraint "proposals_event_check"
--
-- Replaced with a rule rather than a list: every '+'-separated part has to be
-- a city we know. A new PAIRING then needs no migration — only a new CITY
-- does, and that is one edit here alongside EVENT_KEYS.
alter table proposals drop constraint if exists proposals_event_check;

alter table proposals add constraint proposals_event_check check (
  event is null
  or event = 'both'
  or string_to_array(event, '+') <@ array['asia', 'london', 'nyc']
);
