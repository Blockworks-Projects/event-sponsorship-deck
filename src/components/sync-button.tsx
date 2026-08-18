'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Pulls the latest content from Google Slides into the module library on
 * demand. The same sync also runs automatically on a schedule (see
 * vercel.json) — this is for when someone edits the deck and wants it live
 * right now. */
export function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'partial' | 'error'>(
    'idle'
  );
  const [message, setMessage] = useState<string | null>(null);
  // A full sync renders and re-hosts every image on both decks and routinely
  // runs for minutes. Without a clock the button looks hung, so people click
  // it again — which starts a second run competing for the same render quota.
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (status !== 'syncing') return;
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [status]);

  async function sync() {
    setStatus('syncing');
    setMessage(null);
    startedAt.current = Date.now();
    setElapsed(0);

    // The route caps itself at 300s. Give it a little beyond that so a
    // connection dropped without a response still lands here, rather than
    // leaving the button spinning with nothing to resolve it.
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), 310_000);

    try {
      const res = await fetch('/api/sync', { method: 'POST', signal: controller.signal });
      // A timed-out or crashed function returns an HTML error page, not JSON;
      // read the body as text first so that surfaces as a readable message
      // instead of "Unexpected token '<'".
      const text = await res.text();
      let data: {
        synced?: number;
        failed?: number;
        notReturned?: number;
        partialDecks?: string[];
        error?: string;
      };
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

      // A run cut short by the Slides render quota still returns 200 with a
      // healthy-looking count — the modules it couldn't render are simply
      // absent, and keep whatever Supabase already had. Saying so is the
      // difference between "the deck is formatted wrong" and "sync again".
      const short = (data.notReturned ?? 0) > 0 || (data.partialDecks?.length ?? 0) > 0;
      setStatus(short ? 'partial' : 'done');
      setMessage(
        `Synced ${data.synced} module${data.synced === 1 ? '' : 's'}` +
          (data.failed ? ` · ${data.failed} failed` : '') +
          (data.notReturned ? ` · ${data.notReturned} not returned by the deck` : '') +
          (data.partialDecks?.length
            ? ` · ${data.partialDecks.join(' & ')} deck pages incomplete`
            : '') +
          (short ? ' — the deck hit its render limit; sync again in a minute.' : '')
      );
      router.refresh();
    } catch (err) {
      setStatus('error');
      setMessage(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Sync ran past 5 minutes with no response. It may have partly completed — check the module list before running it again.'
          : err instanceof Error
            ? err.message
            : String(err)
      );
    } finally {
      clearTimeout(giveUp);
    }
  }

  /** "2:07" — a sync that has been going four minutes should look like it. */
  function clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button
        type="button"
        className="bx-btn bx-btn-ghost"
        onClick={sync}
        disabled={status === 'syncing'}
      >
        {status === 'syncing' ? `Syncing… ${clock(elapsed)}` : 'Sync from Google Slides'}
      </button>
      {status === 'syncing' && !message && (
        <span className="bx-hint" style={{ margin: 0 }}>
          Rendering both decks — this usually takes a few minutes.
        </span>
      )}
      {message && (
        <span
          className="bx-hint"
          style={{
            margin: 0,
            color:
              status === 'error' ? '#F87171' : status === 'partial' ? '#FBBF24' : 'var(--bx-muted)',
          }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
