import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ProposalForm } from '@/components/proposal-form';
import type { Proposal, SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [{ data: proposal }, { data: modules }] = await Promise.all([
    supabase.from('proposals').select('*').eq('slug', slug).single(),
    supabase
      .from('sponsorship_modules')
      .select('*')
      .eq('status', 'published')
      .order('display_order', { ascending: true }),
  ]);

  if (!proposal) notFound();

  const { data: links } = await supabase
    .from('proposal_modules')
    .select('module_id, sort_order')
    .eq('proposal_id', proposal.id)
    .order('sort_order', { ascending: true });

  return (
    <div className="px-6 py-10 text-neutral-50">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            href={`/builder/proposal/${slug}`}
            className="text-sm text-neutral-400 underline hover:text-neutral-200"
          >
            ← Back to {proposal.company}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Edit proposal</h1>
          <p className="mt-1 text-sm text-neutral-400">
            The shareable link stays the same, so anything already sent keeps working.
            The page and PDF update as soon as you save.
          </p>
        </div>

        <ProposalForm
          modules={(modules ?? []) as SponsorshipModule[]}
          existing={proposal as Proposal}
          existingModuleIds={(links ?? []).map((l) => l.module_id)}
        />
      </div>
    </div>
  );
}
