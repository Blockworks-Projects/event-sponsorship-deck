import { headers } from 'next/headers';
import { CopyLink } from '@/components/copy-link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ViewedAt } from '@/components/viewed-at';
import type { SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  london: 'London',
  asia: 'Asia',
  nyc: 'New York',
  both: 'London + Asia',
};

export default async function BuilderProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!proposal) notFound();

  const { data: links } = await supabase
    .from('proposal_modules')
    .select('sort_order, sponsorship_modules(*)')
    .eq('proposal_id', proposal.id)
    .order('sort_order', { ascending: true });

  const modules = (links ?? [])
    .map((l) => l.sponsorship_modules)
    .filter(Boolean) as unknown as SponsorshipModule[];

  // Who has opened the link, newest first. Written by the email gate, so a
  // row here means someone got past it with the right address.
  const { data: viewRows } = await supabase
    .from('deck_views')
    .select('id, viewer_email, started_at')
    .eq('proposal_id', proposal.id)
    .order('started_at', { ascending: false })
    .limit(50);
  const views = viewRows ?? [];

  // The link a sponsor is sent. Shown short — without the random suffix that
  // proposals made before named slugs still carry — and copied in full.
  const host = (await headers()).get('host') ?? '';
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  const shareUrl = `${origin}/${proposal.slug}`;
  const shareDisplay = `${origin}/${proposal.slug.replace(/-[a-z0-9]{4}$/, '')}`;

  const uniqueViewers = new Set(views.map((v) => v.viewer_email)).size;
  const evClass = ['london', 'asia', 'nyc', 'both'].includes(proposal.event ?? '')
    ? proposal.event
    : '';

  return (
    <div className="bx-wrap bx-page" style={{ maxWidth: 900 }}>
      <div className="bx-page-head">
        <div>
          <h1 className="bx-h1">{proposal.company}</h1>
          <div className="bx-sub" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {proposal.event && <span className={`bx-ev ${evClass}`}>{EVENT_LABEL[proposal.event] ?? proposal.event}</span>}
            <span>{modules.length} item{modules.length === 1 ? '' : 's'}</span>
            {proposal.total_price && <span>· {proposal.total_price}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href={`/${proposal.slug}?print=1&autoprint=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="bx-btn bx-btn-ghost"
          >
            Save as PDF
          </a>
        </div>
      </div>

      {views.length > 0 && (
        <div className="bx-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="bx-stat">
            <div className="k">Views</div>
            <div className="v">{views.length}</div>
          </div>
          <div className="bx-stat accent">
            <div className="k">Unique viewers</div>
            <div className="v">{uniqueViewers}</div>
          </div>
        </div>
      )}

      <div className="bx-linkcard">
        <div className="lkl">Shareable link</div>
        <CopyLink url={shareUrl} display={shareDisplay} />
      </div>

      <div className="bx-views-head" style={{ marginTop: 6 }}>
        <h3>
          {views.length === 0
            ? 'Views'
            : `${views.length} view${views.length === 1 ? '' : 's'} · ${uniqueViewers} viewer${uniqueViewers === 1 ? '' : 's'}`}
        </h3>
      </div>
      {views.length === 0 ? (
        <div className="bx-card" style={{ padding: 24 }}>
          <p className="bx-empty" style={{ padding: 0 }}>
            Not opened yet. Every time someone enters their email to view this, it lands here.
          </p>
        </div>
      ) : (
        <ul className="bx-viewlist" style={{ marginBottom: 30 }}>
          {views.map((v) => (
            <li key={v.id} className="bx-vrow">
              <span className="bx-vemail">
                <span className="bx-vinit">{(v.viewer_email || '?').charAt(0).toUpperCase()}</span>
                <span className="addr">{v.viewer_email}</span>
              </span>
              <span className="bx-vtime">
                <ViewedAt iso={v.started_at} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="bx-card" style={{ padding: '18px 20px' }}>
        <div className="bx-flabel" style={{ marginBottom: 12 }}>
          Included · {modules.length} item{modules.length === 1 ? '' : 's'}
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {modules.map((m, i) => (
            <li
              key={m.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
                padding: '8px 0',
                borderBottom: i === modules.length - 1 ? 'none' : '1px solid var(--bx-border-soft)',
                fontSize: 13.5,
              }}
            >
              <span style={{ color: 'var(--bx-faint)', fontVariantNumeric: 'tabular-nums', minWidth: 18 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>{m.title}</span>
              {m.tier && <span className="bx-tier">{m.tier}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
