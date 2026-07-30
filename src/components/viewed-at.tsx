'use client';

// A view timestamp, formatted in the browser so each person sees it in their
// own timezone. Formatting on the server would pin every viewer to the server
// clock (UTC on Vercel); rendering here uses whoever is logged in and looking.
import { useEffect, useState } from 'react';
import { formatWhen } from '@/lib/format';

export function ViewedAt({ iso }: { iso: string }) {
  // Null until mounted, so the first client render matches the server HTML and
  // hydration stays quiet; the effect then swaps in the local-timezone value.
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => setLabel(formatWhen(iso)), [iso]);

  return <span suppressHydrationWarning>{label ?? formatWhen(iso)}</span>;
}
