'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
      // A timed-out or crashed function returns an HTML error page, not JSON;
      // read the body as text first so that surfaces as a readable message
      // instead of "Unexpected token '<'".
      const text = await res.text();
      let data: { synced?: number; failed?: number; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          res.ok
            ? 'Sync returned an unexpected response — check the server logs.'
            : res.status === 504 || /timed?\s?out|FUNCTION_INVOCATION_TIMEOUT/i.test(text)
              ? 'Sync timed out — the deck has a lot of images. It may have partly completed; wait a moment and try again.'
              : `Sync failed (HTTP ${res.status}).`
        );
      }
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button
        type="button"
        className="bx-btn bx-btn-ghost"
        onClick={sync}
        disabled={status === 'syncing'}
      >
        {status === 'syncing' ? 'Syncing…' : 'Sync from Google Slides'}
      </button>
      {message && (
        <span
          className="bx-hint"
          style={{ margin: 0, color: status === 'error' ? '#F87171' : 'var(--bx-muted)' }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
