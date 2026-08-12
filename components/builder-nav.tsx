'use client';

// The one bar every builder page gets: the Blockworks mark and a link home
// on the left, the way out on the right. Lives in the layout rather than
// being repeated per page.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/sign-out-button';

export function BuilderNav() {
  const pathname = usePathname();

  // Nothing to navigate to or sign out of before you're signed in.
  if (pathname?.startsWith('/builder/login')) return null;

  const onHome = pathname === '/builder';
  // Offering "New proposal" while you're already in the new-proposal flow
  // names the page you're on and does nothing when clicked.
  const onNew = pathname?.startsWith('/builder/new') ?? false;

  return (
    <header className="bx-appbar">
      {/* The mark is the way back to the list — a labelled link, not a bare
          "← All proposals", so it reads the same on every page. */}
      <Link href="/builder" className="bx-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/blockworks-symbol.svg" alt="Blockworks" className="bx-mark" />
        <span className="bx-name">Proposal Builder</span>
      </Link>

      <div className="bx-right">
        {!onHome && !onNew && (
          <Link href="/builder/new" className="bx-btn bx-btn-ghost">
            New proposal
          </Link>
        )}
        <SignOutButton />
      </div>
    </header>
  );
}
