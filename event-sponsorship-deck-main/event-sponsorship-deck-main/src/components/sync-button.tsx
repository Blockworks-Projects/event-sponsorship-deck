'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** Pulls the latest content from Google Slides into the module library on
 * demand. The same sync also runs automatically on a schedule (see
 * vercel.json) — this is for when someone edits the deck and wants it live
 * right now. */
export function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setStatus('syncing');
    setMessage(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed.');
      setStatus('done');
      setMessage(
        `Synced ${data.synced} module${data.synced === 1 ? '' : 's'}` +
          (data.failed ? ` · ${data.failed} failed` : '')
      );
      router.refresh();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={sync} disabled={status === 'syncing'}>
        {status === 'syncing' ? 'Syncing…' : 'Sync from Google Slides'}
      </Button>
      {message && (
        <span className={`text-sm ${status === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
          {message}
        </span>
      )}
    </div>
  );
}
