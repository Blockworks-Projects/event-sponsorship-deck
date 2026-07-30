-- Two sponsorship decks: the London/Asia master deck and New York.
--
-- deck_pages was keyed on page_index alone, which allowed exactly one deck.
-- Existing rows are the London/Asia deck, so they default to 'das'.
alter table deck_pages add column if not exists deck_key text not null default 'das';
alter table deck_pages drop constraint if exists deck_pages_pkey;
alter table deck_pages add primary key (deck_key, page_index);

-- Which deck a viewer opened. Null on views recorded before this existed.
alter table deck_views add column if not exists deck_key text;
