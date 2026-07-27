import Link from 'next/link';
import { headers } from 'next/headers';
import { CopyLink } from '@/components/copy-link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatWhen } from '@/lib/format';
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

  return (
    <div className="px-6 py-10 text-neutral-50">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{proposal.company}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {modules.length} item{modules.length === 1 ? '' : 's'}
              {proposal.total_price ? ` · ${proposal.total_price}` : ''}
              {proposal.event ? ` · ${EVENT_LABEL[proposal.event] ?? proposal.event}` : ''}
            </p>
          </div>
          <Link
            href={`/builder/proposal/${proposal.slug}/edit`}
            className="bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white"
          >
            Edit proposal
          </Link>
        </div>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Shareable link
          </h2>
          <p className="mt-2 text-sm text-neutral-300">
            Tracked page. Viewers enter their details before seeing it, and every view is logged.
          </p>
          <CopyLink url={shareUrl} display={shareDisplay} />
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            PDF
          </h2>
          <p className="mt-2 text-sm text-neutral-300">
            Opens the proposal and raises your print dialog. Choose
            &ldquo;Save as PDF&rdquo; as the destination.
          </p>
          {/* Printed by your own browser rather than rendered on the server:
              headless Chrome in a serverless container runs out of memory on
              a proposal this image-heavy, and your machine never will. */}
          <a
            href={`/${proposal.slug}?print=1&autoprint=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white"
          >
            Save as PDF
          </a>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Views
          </h2>
          {views.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              Not opened yet. Every time someone enters their email to view this, it
              lands here.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-neutral-300">
                {views.length} view{views.length === 1 ? '' : 's'}
                {' · '}
                {new Set(views.map((v) => v.viewer_email)).size} viewer
                {new Set(views.map((v) => v.viewer_email)).size === 1 ? '' : 's'}
              </p>
              <ul className="mt-3 space-y-2">
                {views.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-800 pb-2 text-sm last:border-b-0 last:pb-0"
                  >
                    <span className="text-neutral-200">{v.viewer_email}</span>
                    <span className="text-xs text-neutral-500">
                      {formatWhen(v.started_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Included
          </h2>
          <ol className="mt-3 space-y-2">
            {modules.map((m, i) => (
              <li key={m.id} className="text-sm text-neutral-200">
                {i + 1}. {m.title}
                {m.tier ? <span className="ml-2 text-neutral-500">{m.tier}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
