'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Generates a real Google Slides version of this proposal, built from the
 * template deck. Same content as the web page — just the other format, for
 * when a rep wants something they can hand-edit in Slides or attach. */
export function GenerateSlidesButton({ slug }: { slug: string }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ slidesUrl?: string; pdfUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setStatus('working');
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${slug}/slides`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to build the deck.');
      setResult(data);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={generate} disabled={status === 'working'}>
        {status === 'working' ? 'Building deck…' : 'Generate Slides version'}
      </Button>
      {result?.slidesUrl && (
        <a href={result.slidesUrl} target="_blank" rel="noreferrer" className="text-sm underline">
          Open in Slides
        </a>
      )}
      {result?.pdfUrl && (
        <a href={result.pdfUrl} target="_blank" rel="noreferrer" className="text-sm underline">
          Download PDF
        </a>
      )}
      {error && <span className="text-sm text-red-500">{error}</span>}
    </div>
  );
}
