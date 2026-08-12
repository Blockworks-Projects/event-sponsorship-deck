// The New York (DAS 2027) side of the builder. Reached from the year chooser
// at /builder/new. Same form as a normal proposal, but locked to the NYC event
// — no Asia/London/Both picker, and no à la carte (which is Asia-only).
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { ProposalForm } from '@/components/proposal-form';
import { SyncButton } from '@/components/sync-button';
import type { SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewNycProposalPage() {
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
          <h1 className="bx-h1">New proposal · New York</h1>
          <div className="bx-sub">Digital Asset Summit NYC.</div>
        </div>
        <SyncButton />
      </div>
      <ProposalForm
        nycOnly
        signedInAs={signedInAs ?? undefined}
        modules={(modules ?? []) as SponsorshipModule[]}
      />
    </div>
  );
}
