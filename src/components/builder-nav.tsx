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

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        {/* Not a link when you're already here, so it can't look like a
            dead click. */}
        {onHome ? (
          // Not "Proposals" — that's the page heading directly below, and the
          // same word twice reads as a broken duplicate.
          <span className="text-sm font-semibold text-neutral-500">Blockworks</span>
        ) : (
          <Link
            href="/builder"
            className="text-sm font-semibold text-neutral-400 hover:text-neutral-100"
          >
            ← All proposals
          </Link>
        )}
        <div className="flex items-center gap-3">
          <Link
            href="/builder/deck"
            className="text-sm font-semibold text-neutral-400 hover:text-neutral-100"
          >
            Deck link
          </Link>
          {!onHome && (
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
