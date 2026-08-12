'use client';

// A view timestamp, formatted in the browser so each person sees it in their
// own timezone. Formatting on the server would pin every viewer to the server
// clock (UTC on Vercel); rendering here uses whoever is logged in and looking.
import { useEffect, useState } from 'react';
import { formatWhen } from '@/lib/format';

export function ViewedAt({ iso }: { iso: string }) {
  // Empty until mounted on the client, and ONLY ever filled in the client
  // effect. The server must never emit a formatted time: its clock is UTC on
  // Vercel, and any time Next re-delivers the server-rendered node (initial
  // paint, a router revalidation, a tab refocus) that UTC string would show as
  // "someone else's timezone". Rendering the same empty placeholder on both
  // sides keeps hydration quiet; the effect then fills in the viewer's local
  // time, which is the only value that ever reaches the screen.
  const [label, setLabel] = useState('');
  useEffect(() => setLabel(formatWhen(iso)), [iso]);

  return <span suppressHydrationWarning>{label || '·····'}</span>;
}
