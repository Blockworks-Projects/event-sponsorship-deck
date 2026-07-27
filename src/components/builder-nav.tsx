'use client';

// The one bar every builder page gets, so there is always a way back to the
// list. Lives in the layout rather than being repeated per page.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/sign-out-button';

export function BuilderNav() {
  const pathname = usePathname();

  // Nothing to navigate to or sign out of before you're signed in.
  if (pathname?.startsWith('/builder/login')) return null;

  const onHome = pathname === '/builder';
  // Offering "New proposal" while you're making one names the page you're on
  // and does nothing when clicked.
  const onNew = pathname?.startsWith('/builder/new') ?? false;

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        {/* Nothing on the left on the list itself — a label naming the page
            you're already looking at is just noise. Elsewhere it's the way
            back, which is the bar's whole reason for existing. */}
        {onHome ? (
          <span />
        ) : (
          <Link
            href="/builder"
            className="text-sm font-semibold text-neutral-400 hover:text-neutral-100"
          >
            ← All proposals
          </Link>
        )}
        <div className="flex items-center gap-3">
          {!onHome && !onNew && (
            <Link
              href="/builder/new"
              className="text-sm font-semibold text-neutral-400 hover:text-neutral-100"
            >
              New proposal
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
