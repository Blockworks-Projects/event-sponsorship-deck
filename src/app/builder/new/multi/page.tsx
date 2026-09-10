// The multi-city side of the builder: a deal that spans years, such as London
// (DAS 2026) and New York (DAS 2027). Reached from the chooser at
// /builder/new. The same form as the single-year pages, with every city on
// offer — tick two or more and each one gets its own tier, activations and
// price. New York carries no priced menu, so it stays package-only wherever it
// appears.
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { ProposalForm } from '@/components/proposal-form';
import { SyncButton } from '@/components/sync-button';
import { EVENT_KEYS } from '@/lib/events';
import type { SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewMultiProposalPage() {
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
          <h1 className="bx-h1">New proposal · Multiple cities</h1>
          <div className="bx-sub">
            Digital Asset Summit across cities and years. Pick every city the sponsor is buying.
          </div>
        </div>
        <SyncButton />
      </div>
      <ProposalForm
        offers={EVENT_KEYS}
        signedInAs={signedInAs ?? undefined}
        modules={(modules ?? []) as SponsorshipModule[]}
      />
    </div>
  );
}
