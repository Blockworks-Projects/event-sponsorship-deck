// The builder's home: every proposal the team has made, newest first.
//
// Deliberately not filtered to the signed-in rep — deals get picked up and
// covered for, so seeing a colleague's is the point.
import Link from 'next/link';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  london: 'London',
  asia: 'Asia',
  nyc: 'New York',
  both: 'London + Asia',
};

/** One option in the "made by" row. A link, not a button: the filter is a
 * URL, so it works without JavaScript and can be shared. */
function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-sm ${
        active
          ? 'bg-neutral-100 font-semibold text-neutral-900'
          : 'border border-neutral-800 text-neutral-400 hover:text-neutral-100'
      }`}
    >
      {label}
    </Link>
  );
}

export default async function BuilderHomePage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  const email = readSessionToken((await cookies()).get(BUILDER_COOKIE_NAME)?.value ?? '');
  // Filtering lives in the URL rather than component state, so a filtered
  // list can be linked and survives a refresh.
  const { by } = await searchParams;
  const filterBy = (by ?? '').toLowerCase();

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, slug, company, event, tier, tiers, total_price, created_by_name, created_by, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);

  // One query for every proposal's views, counted here — a per-row query
  // would be a hundred round trips to render one list.
  const { data: viewRows } = await supabase
    .from('deck_views')
    .select('proposal_id, started_at')
    .eq('deck_type', 'proposal')
    .order('started_at', { ascending: false });

  // Everyone who has made a proposal, for the filter row. Taken from the
  // rows on screen rather than a separate query — a rep with no proposals
  // has nothing to filter to anyway.
  const creators = new Map<string, string>();
  for (const p of proposals ?? []) {
    if (!p.created_by) continue;
    creators.set(p.created_by.toLowerCase(), p.created_by_name || p.created_by);
  }
  const visible = (proposals ?? []).filter(
    (p) => !filterBy || (p.created_by ?? '').toLowerCase() === filterBy
  );

  const viewsByProposal = new Map<string, { count: number; last: string }>();
  for (const row of viewRows ?? []) {
    if (!row.proposal_id) continue;
    const seen = viewsByProposal.get(row.proposal_id);
    // Rows arrive newest first, so the first one seen is the latest.
    if (seen) seen.count += 1;
    else viewsByProposal.set(row.proposal_id, { count: 1, last: row.started_at });
  }

  return (
    <div className="px-6 py-10 text-neutral-50">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Proposals</h1>
            {email && <p className="mt-1 text-sm text-neutral-400">Signed in as {email}</p>}
          </div>
          <div className="flex items-center gap-3">
            {/* Secondary next to the primary: making a proposal is the usual
                job here; the deck link is the occasional one. */}
            <Link
              href="/builder/deck"
              className="border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Deck link
            </Link>
            <Link
              href="/builder/new"
              className="bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white"
            >
              New proposal
            </Link>
          </div>
        </div>

        {creators.size > 1 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <FilterChip href="/builder" active={!filterBy} label="Everyone" />
            {[...creators.entries()].map(([address, name]) => (
              <FilterChip
                key={address}
                href={`/builder?by=${encodeURIComponent(address)}`}
                active={filterBy === address}
                label={address === email?.toLowerCase() ? `${name} (you)` : name}
              />
            ))}
          </div>
        )}

        <div className="mt-6 border border-neutral-800">
          {visible.length === 0 && (
            <p className="p-6 text-sm text-neutral-500">
              {filterBy
                ? 'No proposals from this person yet.'
                : 'Nothing yet. Make the first one.'}
            </p>
          )}
          {visible.map((p) => (
            <Link
              key={p.slug}
              href={`/builder/proposal/${p.slug}`}
              className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-800 p-4 last:border-b-0 hover:bg-neutral-900"
            >
              <div>
                <div className="font-medium">{p.company}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {EVENT_LABEL[p.event ?? ''] ?? p.event ?? '—'}
                  {' · '}
                  {p.tiers
                    ? Object.entries(p.tiers as Record<string, string>)
                        .map(([k, v]) => `${EVENT_LABEL[k] ?? k} ${v}`)
                        .join(', ')
                    : p.tier ?? '—'}
                  {p.created_by_name || p.created_by
                    ? ` · ${p.created_by_name ?? p.created_by}`
                    : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-neutral-400">{p.total_price ?? ''}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {viewsByProposal.get(p.id)
                    ? `Opened ${viewsByProposal.get(p.id)!.count}×`
                    : 'Not opened'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
