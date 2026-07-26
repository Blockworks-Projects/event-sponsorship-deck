import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
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
          <Link
            href={`/p/${proposal.slug}`}
            target="_blank"
            className="mt-3 inline-block text-sm underline"
          >
            /p/{proposal.slug}
          </Link>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            PDF
          </h2>
          <p className="mt-2 text-sm text-neutral-300">
            The same proposal as a file, for attaching to an email.
          </p>
          {/* A plain link, not fetch(): the browser handles the download and
              the wait, and headless Chrome takes a few seconds to render. */}
          <a
            href={`/api/proposals/${proposal.slug}/pdf`}
            className="mt-3 inline-block bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white"
          >
            Download PDF
          </a>
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
