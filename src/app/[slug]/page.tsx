import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { SPONSOR_COOKIE_NAME, readSponsorToken } from '@/lib/sponsor-auth';
import { emailList, isAddressedTo } from '@/lib/contacts';
import { proposalsFor, type SponsorProposalOption } from '@/lib/sponsor-proposals';
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
  const jar = await cookies();
  const teamEmail = readSessionToken(jar.get(BUILDER_COOKIE_NAME)?.value ?? '');
  const isTeam = print !== '1' && !!teamEmail;
  // A sponsor who has already given their address at one gate: the session
  // says which address, and this proposal still has to be addressed to it.
  const sponsorEmail = readSponsorToken(jar.get(SPONSOR_COOKIE_NAME)?.value ?? '');

  const { data: proposal } = await supabase
    .from('proposals')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!proposal) notFound();

  // Skips the gate, not the check: the proposal opens only for an address it
  // was sent to, exactly as typing it would.
  const unlockedAs =
    sponsorEmail && isAddressedTo(proposal.contact_email, sponsorEmail)
      ? sponsorEmail
      : null;

  // The rep who wrote it, opening their own link. A builder session already
  // opens every proposal in the tool, so a gate in front of the same content
  // asks a signed-in colleague to prove something they've already proved.
  // Their visit is a preview and is deliberately not logged as a sponsor open,
  // which would otherwise show up as the sponsor having read it.
  const teamPreview = isTeam && !unlockedAs;

  // What the welcome screen offers. A sponsor sees every proposal their own
  // address may open; a rep previewing sees the same list the sponsor will,
  // read from the address this proposal is addressed to.
  const forAddress = unlockedAs ?? (teamPreview ? emailList(proposal.contact_email)[0] : null);
  let options: SponsorProposalOption[] = [];
  if (forAddress) {
    try {
      options = await proposalsFor(forAddress);
    } catch {
      // The welcome screen falls back to this proposal alone.
    }
  }

  const { data: links } = await supabase
    .from('proposal_modules')
    .select('sort_order, event, sponsorship_modules(*)')
    .eq('proposal_id', proposal.id)
    .order('sort_order', { ascending: true });

  // Carry the event each pick was made for, so a multi-city proposal can
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
        unlockedAs={unlockedAs}
        teamPreview={teamPreview}
        options={options}
        autoPrint={autoprint === '1'}
      />
    </>
  );
}
