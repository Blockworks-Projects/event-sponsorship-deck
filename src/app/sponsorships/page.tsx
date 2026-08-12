// /deck — the sponsorship deck on its own, behind the email gate.
//
// Public in the sense that anyone holding the link may open it, unlike a
// proposal which only opens for the address it was addressed to. Every unlock
// is still logged, which is the reason the link exists rather than sending
// the Drive file.
import { supabase } from '@/lib/supabase';
import { PublicDeckView, type Deck } from '@/components/public-deck-view';

export const dynamic = 'force-dynamic';

/** The decks on offer, in the order the buttons should read. */
const DECKS = [
  { key: 'das', label: 'DAS 2026' },
  { key: 'nyc', label: 'DAS 2027' },
];

export default async function PublicDeckPage() {
  // deck_key arrived with the second deck. If the column isn't there yet the
  // whole query errors and the page renders a chooser with nothing under it,
  // so fall back to reading the pages without it and treat them as the
  // London/Asia deck — which is what they are.
  let { data: pages } = await supabase
    .from('deck_pages')
    .select('deck_key, page_index, image_url')
    .order('page_index', { ascending: true });

  if (!pages) {
    const { data: legacy } = await supabase
      .from('deck_pages')
      .select('page_index, image_url')
      .order('page_index', { ascending: true });
    pages = (legacy ?? []).map((row) => ({ ...row, deck_key: 'das' }));
  }

  const decks: Deck[] = DECKS.map((deck) => ({
    ...deck,
    pages: (pages ?? [])
      // Rows written before there were two decks have no key; they are the
      // London/Asia deck.
      .filter((row) => (row.deck_key ?? 'das') === deck.key)
      .map((row) => row.image_url as string),
  }))
    // A deck with nothing synced yet shouldn't offer an empty button.
    .filter((deck) => deck.pages.length > 0);

  return <PublicDeckView decks={decks} embedUrl={process.env.NEXT_PUBLIC_DECK_EMBED_URL} />;
}
