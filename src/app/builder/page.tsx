// The builder's home: every proposal the team has made, newest first.
//
// Deliberately not filtered to the signed-in rep — deals get picked up and
// covered for, so seeing a colleague's is the point.
import Link from 'next/link';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { parsePrice } from '@/lib/pricing';
import { DeleteProposalButton } from '@/components/delete-proposal-button';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  london: 'London',
  asia: 'Asia',
  nyc: 'New York',
  both: 'London + Asia',
};

/** Compact time-since, e.g. "6m" / "3h" / "2d", then a date once it's old. */
function ago(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** $4.31M / $175K — pipeline totals want a glanceable magnitude, not every digit. */
function compactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`bx-chip${active ? ' on' : ''}`}>
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
  const { by } = await searchParams;
  const filterBy = (by ?? '').toLowerCase();

  const COLUMNS =
    'id, slug, company, event, tier, tiers, total_price, created_by_name, created_by, updated_at';

  let { data: proposals } = await supabase
    .from('proposals')
    .select(`${COLUMNS}, a_la_carte`)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (!proposals) {
    const { data } = await supabase
      .from('proposals')
      .select(COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(100);
    proposals = (data ?? []).map((row) => ({ ...row, a_la_carte: null }));
  }

  const { data: viewRows } = await supabase
    .from('deck_views')
    .select('proposal_id, started_at')
    .eq('deck_type', 'proposal')
    .order('started_at', { ascending: false });

  const creators = new Map<string, string>();
  for (const p of proposals ?? []) {
    if (!p.created_by) continue;
    creators.set(p.created_by.toLowerCase(), p.created_by_name || p.created_by);
  }
  const all = proposals ?? [];
  const visible = all.filter((p) => !filterBy || (p.created_by ?? '').toLowerCase() === filterBy);

  const viewsByProposal = new Map<string, { count: number; last: string }>();
  for (const row of viewRows ?? []) {
    if (!row.proposal_id) continue;
    const seen = viewsByProposal.get(row.proposal_id);
    if (seen) seen.count += 1;
    else viewsByProposal.set(row.proposal_id, { count: 1, last: row.started_at });
  }

  const openedCount = all.filter((p) => viewsByProposal.has(p.id)).length;
  const pipeline = all.reduce((sum, p) => sum + (parsePrice(p.total_price) ?? 0), 0);

  const tierText = (p: (typeof all)[number]) =>
    Array.isArray(p.a_la_carte) && p.a_la_carte.length
      ? 'À la carte'
      : p.tiers
        ? Object.entries(p.tiers as Record<string, string>)
            .map(([k, v]) => `${EVENT_LABEL[k] ?? k} ${v}`)
            .join(', ')
        : (p.tier ?? '—');

  return (
    <div className="bx-wrap bx-page">
      <div className="bx-page-head">
        <div>
          <h1 className="bx-h1">Proposals</h1>
          <div className="bx-sub">Everything the team has built</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/builder/deck" className="bx-btn bx-btn-ghost">
            Sponsorship deck
          </Link>
          <Link href="/builder/new" className="bx-btn bx-btn-primary">
            + New proposal
          </Link>
        </div>
      </div>

      <div className="bx-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="bx-stat">
          <div className="k">Proposals</div>
          <div className="v">{all.length}</div>
        </div>
        <div className="bx-stat">
          <div className="k">Opened by sponsors</div>
          <div className="v">{openedCount}</div>
        </div>
        <div className="bx-stat purple">
          <div className="k">Pipeline</div>
          <div className="v">{pipeline > 0 ? compactMoney(pipeline) : '—'}</div>
        </div>
      </div>

      {creators.size > 1 && (
        <div className="bx-filters">
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

      {visible.length === 0 ? (
        <div className="bx-card" style={{ padding: 28 }}>
          <p className="bx-empty" style={{ padding: 0 }}>
            {filterBy ? 'No proposals from this person yet.' : 'Nothing yet. Make the first one.'}
          </p>
        </div>
      ) : (
        <div className="bx-plist">
          <div className="bx-plist-head">
            <span>Company</span>
            <span>Event</span>
            <span className="col-hide">Tier</span>
            <span className="num">Investment</span>
            <span className="num col-hide">Opened</span>
            <span className="num col-hide">Updated</span>
          </div>
          {visible.map((p) => {
            const views = viewsByProposal.get(p.id);
            const evClass = ['london', 'asia', 'nyc', 'both'].includes(p.event ?? '')
              ? p.event
              : '';
            return (
              <div key={p.slug} style={{ position: 'relative' }}>
                <Link href={`/builder/proposal/${p.slug}`} className="bx-prow">
                  <div className="bx-co">
                    <span className="logo">{(p.company ?? '?').charAt(0).toUpperCase()}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="cn">{p.company}</div>
                      <div className="cs">{p.created_by_name ?? p.created_by ?? '—'}</div>
                    </div>
                  </div>
                  <span>
                    <span className={`bx-ev ${evClass}`}>
                      {EVENT_LABEL[p.event ?? ''] ?? p.event ?? '—'}
                    </span>
                  </span>
                  <span className="bx-tier col-hide">{tierText(p)}</span>
                  <span className="num money">{p.total_price ?? '—'}</span>
                  <span className="num col-hide">
                    <span className={`bx-opened${views ? '' : ' none'}`}>
                      {views ? `${views.count}×` : '—'}
                    </span>
                  </span>
                  <span className="num bx-ago col-hide">{ago(p.updated_at)}</span>
                </Link>
                <DeleteProposalButton slug={p.slug} company={p.company ?? 'this sponsor'} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
