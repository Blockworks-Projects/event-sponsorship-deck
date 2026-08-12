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
    <div className="bx-wrap bx-page">
      <div style={{ marginBottom: 22 }}>
        <Link href={`/builder/proposal/${slug}`} className="bx-chip">
          ← Back to {proposal.company}
        </Link>
        <h1 className="bx-h1" style={{ marginTop: 14 }}>Edit proposal</h1>
        <div className="bx-sub">
          The shareable link stays the same, so anything already sent keeps working. The page
          and PDF update as soon as you save.
        </div>
      </div>

      <ProposalForm
        modules={(modules ?? []) as SponsorshipModule[]}
        existing={proposal as Proposal}
        existingModuleIds={(links ?? []).map((l) => l.module_id)}
        nycOnly={(proposal as Proposal).event === 'nyc'}
      />
    </div>
  );
}
