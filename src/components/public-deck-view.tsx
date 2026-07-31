'use client';

// The sales deck on its own, behind the same email gate a proposal uses.
//
// Deliberately not a proposal: there is no sponsor, no tier and no pricing,
// so nothing here is per-recipient. It exists for the case where a rep wants
// to send the deck before there's a deal to quote, and still know who opened
// it.
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface Deck {
  key: string;
  label: string;
  pages: string[];
}

export function PublicDeckView({ decks, embedUrl }: { decks: Deck[]; embedUrl?: string }) {
  const [unlocked, setUnlocked] = useState(false);
  // Which deck they're reading. Null after the gate means "still choosing".
  const [openDeck, setOpenDeck] = useState<Deck | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The logged view for the deck currently open, so slide-dwell can be attached
  // to it. Null while a fresh open is still being recorded.
  const [viewId, setViewId] = useState<string | null>(null);

  // Per-slide engagement accumulators for the open deck. Refs, not state — they
  // change every second and must not trigger re-renders.
  const dwellRef = useRef<Record<number, number>>({});
  const focusedMsRef = useRef(0);
  const visibleRef = useRef<Set<number>>(new Set());
  const pagesRef = useRef<HTMLDivElement | null>(null);

  // Opening or switching a deck is a page change in spirit: start it at the
  // top rather than leaving the reader wherever the last deck was scrolled.
  useEffect(() => {
    if (openDeck) window.scrollTo(0, 0);
  }, [openDeck]);

  // Measure how long each slide is actually on screen (and the tab focused),
  // reporting it against the current view so the builder can draw a heatmap.
  useEffect(() => {
    const container = pagesRef.current;
    if (!viewId || !openDeck || openDeck.pages.length === 0 || !container) return;

    // Fresh accumulators for this view.
    dwellRef.current = {};
    focusedMsRef.current = 0;
    visibleRef.current = new Set();

    const slides = Array.from(container.querySelectorAll<HTMLElement>('[data-slide]'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.slide);
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) visibleRef.current.add(idx);
          else visibleRef.current.delete(idx);
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    slides.forEach((el) => io.observe(el));

    // Only count time while the tab is focused, so a deck left open in a
    // background tab doesn't read as an hour of rapt attention.
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      focusedMsRef.current += 1000;
      visibleRef.current.forEach((idx) => {
        dwellRef.current[idx] = (dwellRef.current[idx] ?? 0) + 1000;
      });
    }, 1000);

    const flush = (beacon = false) => {
      const payload = JSON.stringify({
        viewId,
        slideDwell: dwellRef.current,
        durationSeconds: Math.round(focusedMsRef.current / 1000),
      });
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon('/api/deck-views/track', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/deck-views/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }
    };

    const heartbeat = window.setInterval(() => flush(false), 15000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => flush(true));

    return () => {
      window.clearInterval(tick);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onHide);
      io.disconnect();
      flush(true);
    };
  }, [viewId, openDeck]);

  async function handleGate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    // The view is recorded when a deck is opened, not here — otherwise
    // passing the gate and then picking a deck logs the same person twice and
    // the counts read double.
    setUnlocked(true);
    // One deck needs no choosing.
    if (decks.length === 1) openOne(decks[0]);
  }

  /** Records which deck was opened, then shows it. */
  async function openOne(deck: Deck) {
    setOpenDeck(deck);
    // Stop attributing dwell to the previous deck until the new view is logged.
    setViewId(null);
    try {
      const res = await fetch('/api/deck-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckType: 'public', viewerEmail: email, deckKey: deck.key }),
      });
      const body = await res.json().catch(() => ({}));
      // Attach dwell tracking to this view once it's logged.
      if (body?.viewId) setViewId(body.viewId as string);
    } catch {
      // A failed log shouldn't stand between them and the deck.
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
              className="px-8 py-4 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--das-ink)' }}
            >
              View deck
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Past the gate, before a deck: which one do they want.
  if (!openDeck) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafafa] px-6 text-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/shapes-both.svg" alt="" aria-hidden className="hero-shape hero-shape-both" />
        <div className="relative w-full max-w-xl text-center">
          <h1 className="whitespace-nowrap text-[clamp(1.5rem,5.2vw,2.5rem)] font-bold leading-[1.05] tracking-tight">
            Digital Asset Summit (DAS)
          </h1>
          <p className="mt-6 text-pretty text-lg text-neutral-600">
            Click which Sponsorship Deck you would like to view
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            {decks.map((deck) => (
              <button
                key={deck.key}
                onClick={() => openOne(deck)}
                className="px-8 py-4 text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--das-ink)' }}
              >
                {deck.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pages = openDeck.pages;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-[#fafafa]/95 px-6 py-3 backdrop-blur">
        <span
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: 'var(--das-ink)' }}
        >
          {openDeck.label}
        </span>
        {/* Named, not "other deck": with two decks the name is shorter than
            the description, and it says where the click goes. */}
        <div className="flex gap-2">
          {decks
            .filter((deck) => deck.key !== openDeck.key)
            .map((deck) => (
              <button
                key={deck.key}
                onClick={() => openOne(deck)}
                className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
              >
                {deck.label}
              </button>
            ))}
        </div>
      </div>
      {/* Our own rendered pages, scrolling — the same treatment a proposal's
          deck view uses, rather than Google's black-bar embed. */}
      {pages.length > 0 ? (
        <div className="mx-auto max-w-[1240px] py-8" ref={pagesRef}>
          {pages.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              // 1-based to match how the pages are numbered in deck_pages.
              data-slide={i + 1}
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
