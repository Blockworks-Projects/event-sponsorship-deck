// The sponsorship deck link and who has opened it.
//
// Separate from proposals on purpose: this is one link shared with many
// people, so it has one page of its own rather than a row in a list.
import { headers } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { DeckViews } from '@/components/deck-views';
import { CopyLink } from '@/components/copy-link';

export const dynamic = 'force-dynamic';

/** Same labels the sponsor sees on the buttons. */
const DECK_LABEL: Record<string, string> = {
  das: 'DAS 2026',
  nyc: 'DAS 2027',
};

export default async function DeckLinkPage() {
  const host = (await headers()).get('host') ?? '';
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  const url = `${origin}/sponsorships`;

  const { data: viewRows } = await supabase
    .from('deck_views')
    .select('id, viewer_email, started_at, deck_key')
    .eq('deck_type', 'public')
    .order('started_at', { ascending: false })
    .limit(200);

  const views = viewRows ?? [];

  return (
    <div className="px-6 py-10 text-neutral-50">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Sponsorship deck</h1>
          <p className="mt-1 text-sm text-neutral-400">
            One link, shareable with anyone. They enter an email, then read the deck.
          </p>
        </div>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Shareable link
          </h2>
          <p className="mt-2 text-sm text-neutral-300">
            Unlike a proposal link, this opens for any address. Every view is logged below.
          </p>
          <CopyLink url={url} display={url} />
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Views
          </h2>
          {views.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              Not opened yet. Everyone who enters their email to read the deck lands here.
            </p>
          ) : (
            <DeckViews views={views} deckLabels={DECK_LABEL} />
          )}
        </section>

      </div>
    </div>
  );
}
