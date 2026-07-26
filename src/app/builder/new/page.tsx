import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { ProposalForm } from '@/components/proposal-form';
import { SyncButton } from '@/components/sync-button';
import type { SponsorshipModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NewProposalPage() {
  // The signed-in address prefills "Your email", so a rep never types it —
  // which is also how an autofilled address ended up in the Company box.
  const signedInAs = readSessionToken((await cookies()).get(BUILDER_COOKIE_NAME)?.value ?? '');
  const { data: modules } = await supabase
    .from('sponsorship_modules')
    .select('*')
    .eq('status', 'published')
    .order('display_order', { ascending: true });

  return (
    <div className="px-6 py-10 text-neutral-50">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">New Proposal</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Pick sponsorship modules for this client, then generate a tracked proposal page.
            </p>
          </div>
          <SyncButton />
        </div>
        <ProposalForm signedInAs={signedInAs ?? undefined} modules={(modules ?? []) as SponsorshipModule[]} />
      </div>
    </div>
  );
}
