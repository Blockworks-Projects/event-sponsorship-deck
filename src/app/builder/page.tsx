// The builder's home: every proposal the team has made, newest first.
//
// Deliberately not filtered to the signed-in rep — deals get picked up and
// covered for, so seeing a colleague's is the point.
import Link from 'next/link';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import { SignOutButton } from '@/components/sign-out-button';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  london: 'London',
  asia: 'Asia',
  nyc: 'New York',
  both: 'London + Asia',
};

export default async function BuilderHomePage() {
  const email = readSessionToken((await cookies()).get(BUILDER_COOKIE_NAME)?.value ?? '');

  const { data: proposals } = await supabase
    .from('proposals')
    .select('slug, company, event, tier, tiers, total_price, created_by_name, created_by, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-50">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Proposals</h1>
            {email && <p className="mt-1 text-sm text-neutral-400">Signed in as {email}</p>}
          </div>
          <div className="flex items-center gap-3">
            <SignOutButton />
            <Link
              href="/builder/new"
              className="bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white"
            >
              New proposal
            </Link>
          </div>
        </div>

        <div className="mt-8 border border-neutral-800">
          {(proposals ?? []).length === 0 && (
            <p className="p-6 text-sm text-neutral-500">
              Nothing yet. Make the first one.
            </p>
          )}
          {(proposals ?? []).map((p) => (
            <Link
              key={p.slug}
              href={`/builder/proposal/${p.slug}`}
              className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-800 p-4 last:border-b-0 hover:bg-neutral-900"
            >
              <div>
                <div className="font-medium">{p.company}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {EVENT_LABEL[p.event ?? ''] ?? p.event ?? '—'}
                  {' · '}
                  {p.tiers
                    ? Object.entries(p.tiers as Record<string, string>)
                        .map(([k, v]) => `${EVENT_LABEL[k] ?? k} ${v}`)
                        .join(', ')
                    : p.tier ?? '—'}
                  {p.created_by_name || p.created_by
                    ? ` · ${p.created_by_name ?? p.created_by}`
                    : ''}
                </div>
              </div>
              <div className="text-sm text-neutral-400">{p.total_price ?? ''}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
