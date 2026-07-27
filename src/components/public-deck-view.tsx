'use client';

// The sales deck on its own, behind the same email gate a proposal uses.
//
// Deliberately not a proposal: there is no sponsor, no tier and no pricing,
// so nothing here is per-recipient. It exists for the case where a rep wants
// to send the deck before there's a deal to quote, and still know who opened
// it.
import { useState } from 'react';
import { Input } from '@/components/ui/input';

export function PublicDeckView({ pages, embedUrl }: { pages: string[]; embedUrl?: string }) {
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/deck-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No proposalId: this is the deck, so any address may open it. The
        // address is still recorded, which is the point of the link.
        body: JSON.stringify({ deckType: 'public', viewerEmail: email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Something went wrong.');
      }
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!unlocked) {
    // The both-events treatment: this deck covers London and Asia, so neither
    // city's colour is right and the tri-colour cluster is.
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafafa] px-6 text-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/shapes-both.svg" alt="" aria-hidden className="hero-shape hero-shape-both" />

        <div className="relative w-full max-w-xl text-center">
          <h1 className="whitespace-nowrap text-[clamp(1.5rem,5.2vw,2.5rem)] font-bold leading-[1.05] tracking-tight">
            Digital Asset Summit (DAS)
          </h1>
          <p className="mt-2 text-3xl tracking-tight text-neutral-700">Sponsorship Deck</p>

          <p className="mt-6 text-pretty leading-relaxed text-neutral-600">
            Enter your email address to view the deck.
          </p>

          <form onSubmit={handleGate} className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
            <Input
              placeholder="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-none border-neutral-300 bg-white text-center text-neutral-900"
            />
            {error && <p className="text-sm" style={{ color: 'var(--das-asia)' }}>{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-4 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--das-ink)' }}
            >
              {submitting ? 'Loading…' : 'View deck'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-[#fafafa]/95 px-6 py-3 backdrop-blur">
        <span
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: 'var(--das-ink)' }}
        >
          Digital Asset Summit
        </span>
      </div>
      {/* Our own rendered pages, scrolling — the same treatment a proposal's
          deck view uses, rather than Google's black-bar embed. */}
      {pages.length > 0 ? (
        <div className="mx-auto max-w-[1240px] py-8">
          {pages.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Slide ${i + 1}`}
              className="block w-full mix-blend-multiply"
              loading="lazy"
            />
          ))}
        </div>
      ) : embedUrl ? (
        <iframe
          src={embedUrl}
          title="Digital Asset Summit sponsorship deck"
          className="h-[calc(100vh-49px)] w-full border-0"
          allowFullScreen
        />
      ) : (
        <p className="px-6 py-20 text-center text-neutral-500">
          The deck isn&apos;t available just yet. Please check back shortly.
        </p>
      )}
    </div>
  );
}
