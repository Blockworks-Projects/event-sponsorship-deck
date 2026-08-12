import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { ProposalView } from '@/components/proposal-view';
import type { Deck } from '@/components/public-deck-view';
import type { Proposal, SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** The decks on offer, in the order the picker should read — same set and
 *  order as the public /sponsorships page. */
const DECKS = [
  { key: 'das', label: 'DAS 2026' },
  { key: 'nyc', label: 'DAS 2027' },
];

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ print?: string; autoprint?: string }>;
}) {
  const { slug } = await params;
  const { print, autoprint } = await searchParams;

  // A signed-in Blockworks rep previewing their own work gets a way back to
  // the builder. A sponsor has no cookie, so they never see it — and it isn't
  // in the PDF either, which renders with print=1.
  const isTeam =
    print !== '1' &&
    !!readSessionToken((await cookies()).get(BUILDER_COOKIE_NAME)?.value ?? '');

  const { data: proposal } = await supabase
    .from('proposals')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!proposal) notFound();

  const { data: links } = await supabase
    .from('proposal_modules')
    .select('sort_order, event, sponsorship_modules(*)')
    .eq('proposal_id', proposal.id)
    .order('sort_order', { ascending: true });

  // Carry the event each pick was made for, so a both-events proposal can
  // say which city an activation belongs to rather than inferring it from
  // where it happens to be available.
  const modules = (links ?? [])
    .filter((l) => l.sponsorship_modules)
    .map((l) => ({
      ...(l.sponsorship_modules as unknown as SponsorshipModule),
      pickedFor: l.event as string | null,
    }));

  // The tier table is never one of the picked modules — it's chosen by the
  // tier picker — so it's fetched separately to render the tier summary.
  const { data: tierTables } = await supabase
    .from('sponsorship_modules')
    .select('*')
    .eq('category', 'tier-table');
  const tierTable = (tierTables ?? []).find(
    (m) => (m.region || '').toLowerCase() === (proposal.event || '').toLowerCase()
  ) as SponsorshipModule | undefined;

  // The sales decks, rendered, for the "view sales deck" option — grouped by
  // deck so the sponsor can pick DAS 2026 or 2027, the same as the public
  // /sponsorships page. Fetching without the deck_key filter used to return
  // both decks interleaved by page number, so the two read as one jumbled deck.
  //
  // Skipped when printing: that view can't be reached in a PDF, and shipping
  // the slide URLs into a render that will never show them is weight the
  // headless browser has to carry.
  let decks: Deck[] = [];
  if (print !== '1') {
    // deck_key arrived with the second deck. If the column isn't there yet the
    // whole query errors, so fall back to reading the pages without it and
    // treat them as the London/Asia ('das') deck — which is what they are.
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

    decks = DECKS.map((deck) => ({
      ...deck,
      pages: (pages ?? [])
        .filter((row) => (row.deck_key ?? 'das') === deck.key)
        .map((row) => row.image_url as string),
    }))
      // A deck with nothing synced yet shouldn't offer an empty button.
      .filter((deck) => deck.pages.length > 0);
  }

  return (
    <>
      {isTeam && (
        // Fixed, so it survives the view's own switching between gate, deck
        // and proposal without being threaded through each of them.
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 border border-neutral-800 bg-neutral-950 p-1 text-sm text-neutral-300 shadow-lg print:hidden">
          <Link href="/builder" className="px-3 py-1.5 hover:text-white">
            All proposals
          </Link>
        </div>
      )}
      <ProposalView
        proposal={proposal as Proposal}
        decks={decks}
        modules={modules}
        tierTable={tierTable}
        tierTables={(tierTables ?? []) as SponsorshipModule[]}
        skipGate={print === '1'}
        autoPrint={autoprint === '1'}
      />
    </>
  );
}
