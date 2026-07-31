// The first step of making a proposal: which year / event set is it for?
// 2026 is Asia & London (single city or both); 2027 is New York only. Splitting
// here is what keeps New York from ever being mixed with Asia/London.
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NewProposalChooser() {
  return (
    <div className="px-6 py-10 text-neutral-50">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">New proposal</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Which year are you creating a proposal for?
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/builder/new/das"
            className="group block rounded-lg border border-neutral-800 bg-neutral-900 p-6 transition-colors hover:border-neutral-600"
          >
            <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              2026
            </div>
            <div className="mt-2 text-xl font-semibold text-neutral-100">Asia &amp; London</div>
          </Link>

          <Link
            href="/builder/new/nyc"
            className="group block rounded-lg border border-neutral-800 bg-neutral-900 p-6 transition-colors hover:border-neutral-600"
          >
            <div
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--das-new-york)' }}
            >
              2027
            </div>
            <div className="mt-2 text-xl font-semibold text-neutral-100">New York</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
