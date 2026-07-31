// The Asia & London side of the builder (DAS 2026). Reached from the year
// chooser at /builder/new — its own page so the year is a deliberate first
// choice and NYC can't be mixed with Asia/London.
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { ProposalForm } from '@/components/proposal-form';
import { SyncButton } from '@/components/sync-button';
import type { SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewDasProposalPage() {
  const signedInAs = readSessionToken((await cookies()).get(BUILDER_COOKIE_NAME)?.value ?? '');
  const { data: modules } = await supabase
    .from('sponsorship_modules')
    .select('*')
    .eq('status', 'published')
    .order('display_order', { ascending: true });

  return (
    <div className="bx-wrap bx-page">
      <div className="bx-page-head">
        <div>
          <h1 className="bx-h1">New proposal · Asia &amp; London</h1>
          <div className="bx-sub">Digital Asset Summit 2026 — one city or both.</div>
        </div>
        <SyncButton />
      </div>
      <ProposalForm signedInAs={signedInAs ?? undefined} modules={(modules ?? []) as SponsorshipModule[]} />
    </div>
  );
}
