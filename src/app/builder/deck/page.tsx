// The sponsorship deck link and who has opened it.
//
// Separate from proposals on purpose: this is one link shared with many
// people, so it has one page of its own rather than a row in a list.
import { headers } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { CopyLink } from '@/components/copy-link';

export const dynamic = 'force-dynamic';

/** "Today, 16:12" / "24 Jul, 16:12" — recency is what a rep is reading for. */
function formatWhen(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay =
    at.getDate() === today.getDate() &&
    at.getMonth() === today.getMonth() &&
    at.getFullYear() === today.getFullYear();
  if (sameDay) return `Today, ${time}`;
  return `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

export default async function DeckLinkPage() {
  const host = (await headers()).get('host') ?? '';
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  const url = `${origin}/deck`;

  const [{ data: pages }, { data: viewRows }] = await Promise.all([
    supabase.from('deck_pages').select('page_index').order('page_index', { ascending: true }),
    supabase
      .from('deck_views')
      .select('id, viewer_email, started_at')
      .eq('deck_type', 'public')
      .order('started_at', { ascending: false })
      .limit(200),
  ]);

  const views = viewRows ?? [];
  const uniqueViewers = new Set(views.map((v) => v.viewer_email)).size;

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
            <>
              <p className="mt-2 text-sm text-neutral-300">
                {views.length} view{views.length === 1 ? '' : 's'} · {uniqueViewers} viewer
                {uniqueViewers === 1 ? '' : 's'}
              </p>
              <ul className="mt-3 space-y-2">
                {views.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-800 pb-2 text-sm last:border-b-0 last:pb-0"
                  >
                    <span className="text-neutral-200">{v.viewer_email}</span>
                    <span className="text-xs text-neutral-500">{formatWhen(v.started_at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Deck
          </h2>
          <p className="mt-2 text-sm text-neutral-300">
            {(pages ?? []).length > 0
              ? `${(pages ?? []).length} pages, from the last sync of the master deck.`
              : 'No pages synced yet. Run Sync from a proposal page first.'}
          </p>
        </section>
      </div>
    </div>
  );
}
