import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ProposalView } from '@/components/proposal-view';
import type { Proposal, SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { slug } = await params;
  const { print } = await searchParams;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!proposal) notFound();

  const { data: links } = await supabase
    .from('proposal_modules')
    .select('sort_order, event, sponsorship_modules(*)')
    .eq('proposal_id', proposal.id)
    .order('sort_order', { ascending: true });

  // Carry the event each pick was made for, so a both-events proposal can
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

  // The whole content deck, rendered, for the "view sales deck" option.
  const { data: deckPages } = await supabase
    .from('deck_pages')
    .select('page_index, image_url')
    .order('page_index', { ascending: true });

  return (
    <ProposalView
      proposal={proposal as Proposal}
      deckPages={(deckPages ?? []).map((p) => p.image_url)}
      modules={modules}
      tierTable={tierTable}
      tierTables={(tierTables ?? []) as SponsorshipModule[]}
      skipGate={print === '1'}
    />
  );
}
