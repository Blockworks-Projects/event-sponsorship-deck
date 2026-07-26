'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModuleCard } from '@/components/module-card';
import { TierIncluded, PriceBreakdown } from '@/components/tier-summary';
import { TierGrid } from '@/components/tier-grid';
import { DasWordmark } from '@/components/das-wordmark';
import { ContentSessionSection } from '@/components/content-session';
import type { Proposal, SponsorshipModule } from '@/lib/types';

const EVENT_FACTS: Record<string, { venue: string; dates: string }> = {
  asia: { venue: 'Marina Bay Sands, Singapore', dates: 'October 7, 2026' },
  london: { venue: 'Hilton Park Lane, London', dates: 'November 10-11, 2026' },
  nyc: { venue: 'New York', dates: 'TBD' },
};

/** How each event is named in prose. Not the venue city — Asia's venue is in
 * Singapore, but the event is "Digital Asset Summit Asia". */
const EVENT_NAME: Record<string, string> = {
  london: 'London',
  asia: 'Asia',
  nyc: 'New York',
};

const EVENT_SITE: Record<string, string> = {
  london: 'https://blockworks.com/event/digital-asset-summit-london',
  asia: 'https://blockworks.com/event/digital-asset-summit-asia',
};

// The drifting hero geometry, per event, matching the speaker portal. There's
// no NYC artwork, so those covers simply run without shapes.
const EVENT_SHAPES: Record<string, { left: string; right: string }> = {
  london: { left: '/brand/shapeLeftBlue.webp', right: '/brand/shapeRightBlue.webp' },
  asia: { left: '/brand/shapeLeftRed.webp', right: '/brand/shapeRightRed.webp' },
};

// Each DAS city has its own accent, sampled from the sales deck cover where
// the three wordmarks sit side by side in green, red and blue.
const EVENT_ACCENT: Record<string, string> = {
  nyc: 'var(--das-new-york)',
  asia: 'var(--das-asia)',
  london: 'var(--das-london)',
};

/**
 * "carolyn.wyatt@blockworks.co" → "Carolyn Wyatt".
 *
 * Only used for proposals created before reps were asked for their name.
 * Blockworks addresses are firstname.lastname, so it's a decent guess.
 */
function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** One fact in the hero row: the value, with its label beneath. */
function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <dd className="text-xl font-bold" style={accent ? { color: accent } : undefined}>{value}</dd>
      <dt className="mt-1 text-xs uppercase tracking-widest text-neutral-400">{label}</dt>
    </div>
  );
}

export function ProposalView({
  proposal,
  modules,
  tierTable,
  tierTables = [],
  deckPages = [],
  skipGate,
}: {
  proposal: Proposal;
  modules: (SponsorshipModule & { pickedFor?: string | null })[];
  tierTable?: SponsorshipModule;
  tierTables?: SponsorshipModule[];
  deckPages?: string[];
  skipGate?: boolean;
}) {
  const [unlocked, setUnlocked] = useState(!!skipGate);
  // After the gate a viewer picks a destination: their own proposal, or the
  // current sales deck. The PDF path goes straight to the proposal.
  const [view, setView] = useState<'choose' | 'proposal' | 'deck'>(
    skipGate ? 'proposal' : 'choose'
  );
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
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
        body: JSON.stringify({
          deckType: 'proposal',
          proposalId: proposal.id,
          viewerName: name,
          viewerCompany: company,
          viewerEmail: email,
        }),
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <form onSubmit={handleGate} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-50">A partnership proposal for {proposal.company}</h1>
            <p className="mt-1 text-sm text-neutral-400">Enter your details to view it.</p>
          </div>
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Loading…' : 'Continue'}
          </Button>
        </form>
      </div>
    );
  }

  const facts = proposal.event ? EVENT_FACTS[proposal.event] : undefined;
  // A section spanning both cities can't take either city's colour, so it's
  // set in the brand's near-black. Per-event sections keep their own.
  const accent =
    proposal.event === 'both'
      ? 'var(--das-ink)'
      : (proposal.event && EVENT_ACCENT[proposal.event]) || 'var(--das-london)';
  // Browsing the deck is a permanent part of the experience, so the button is
  // always there. Our own rendered pages are preferred; the embed is the
  // fallback for before a sync has run.
  const embedUrl = process.env.NEXT_PUBLIC_DECK_EMBED_URL;
  const hasPages = deckPages.length > 0;

  if (view === 'choose') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-6 text-neutral-900">
        {proposal.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proposal.logo_url} alt={proposal.company}
            className="mb-10 h-16 w-auto max-w-[260px] object-contain" />
        )}
        <h1 className="max-w-2xl text-center text-4xl font-bold tracking-tight">
          Welcome, {proposal.company}
        </h1>
        <p className="mt-3 max-w-lg text-center text-neutral-500">
          Your proposal is ready. You can also browse the full Digital Asset Summit
          sales deck, which is always the current version.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <button onClick={() => setView('proposal')}
            className="px-8 py-4 text-sm font-semibold text-white"
            style={{ backgroundColor: accent }}>
            Your proposal
          </button>
          <button onClick={() => setView('deck')}
            className="border border-neutral-300 px-8 py-4 text-sm font-semibold text-neutral-900 hover:bg-white">
            View sales deck
          </button>
        </div>
      </div>
    );
  }

  if (view === 'deck') {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-[#fafafa]/95 px-6 py-3 backdrop-blur">
          <span className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>
            Digital Asset Summit
          </span>
          <button onClick={() => setView('proposal')} className="text-sm font-semibold underline">
            Back to your proposal
          </button>
        </div>
        {/* Preferred: our own rendered pages. They scroll instead of clicking
            slide by slide, sit on our background rather than a black letterbox,
            and keep the deck behind the email gate. */}
        {hasPages ? (
          <div className="mx-auto max-w-[1240px] py-8">
            {deckPages.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`Slide ${i + 1}`}
                className="block w-full mix-blend-multiply" loading="lazy" />
            ))}
          </div>
        ) : embedUrl ? (
          <iframe src={embedUrl} title="Digital Asset Summit sales deck"
            className="h-[calc(100vh-49px)] w-full border-0" allowFullScreen />
        ) : (
          <p className="px-6 py-20 text-center text-neutral-500">
            The deck isn&apos;t available just yet. Please check back shortly.
          </p>
        )}
      </div>
    );
  }

  // Context slides describe the event; activations are what's being bought.
  // Mixing them under one heading left a reader with no signpost between
  // "here's DAS" and "here's your deal".
  const context = modules.filter((m) => m.category !== 'activation');
  const activations = modules.filter((m) => m.category === 'activation');
  const price = proposal.discounted_price || proposal.list_price;
  const shapes = EVENT_SHAPES[(proposal.event || '').toLowerCase()];
  // Across two cities, which activation belongs to which is the one thing a
  // sponsor can't infer, so the availability badges come back.
  const bothEvents = proposal.event === 'both';
  // Chronological: Asia is October, London is November. Not alphabetical, and
  // not whatever order the tiers happen to be stored in.
  const EVENTS_IN_ORDER = ['asia', 'london'];
  const sessions =
    proposal.content_sessions ?? (proposal.content_session ? [proposal.content_session] : []);

  return (
    <div className="bg-[#fafafa] text-neutral-900">
      {/* Cover. Shapes sit inside it and are clipped by it, so they never
          bleed over the content below — the same arrangement the speaker
          portal uses for its hero. */}
      <section className="pdf-cover relative flex min-h-[70vh] flex-col justify-center overflow-hidden border-b border-neutral-200 px-10 py-24">
        {bothEvents ? (
          // One tri-colour cluster: neither city's pair would be right here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/shapes-both.svg" alt="" aria-hidden className="hero-shape hero-shape-both" />
        ) : (
          shapes && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shapes.left} alt="" aria-hidden className="hero-shape hero-shape-left" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shapes.right} alt="" aria-hidden className="hero-shape hero-shape-right" />
            </>
          )
        )}

        {bothEvents ? (
          // Two cities: ranged left on the same column as every section below,
          // with the links up top and the cities as cards under the intro.
          <div className="relative mx-auto w-full max-w-6xl px-10">
            <div className="flex gap-3">
              <a
                href="https://blockworks.com/event/digital-asset-summit-london"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-white"
              >
                Event website
              </a>
              <button
                onClick={() => setView('deck')}
                className="border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-white"
              >
                Sales deck
              </button>
            </div>

            <h1 className="mt-16 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight">
              Digital Asset Summit <span className="whitespace-nowrap">(DAS)</span>
            </h1>
            <p className="mt-2 text-4xl tracking-tight text-neutral-700">Partnership Proposal</p>

            <p className="mt-10 max-w-2xl text-pretty text-lg leading-relaxed text-neutral-700">
              <strong className="font-semibold text-neutral-900">Hosted by Blockworks</strong>{' '}
              since 2019, DAS gives participants unprecedented exposure to the world&apos;s leading
              financial institutions and institutional investors.
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:max-w-4xl">
              {EVENTS_IN_ORDER.map((key) => {
                const f = EVENT_FACTS[key];
                if (!f) return null;
                return (
                  <div key={key} className="border border-neutral-200 px-8 py-6">
                    <div
                      className="text-lg font-bold lowercase tracking-[0.35em]"
                      style={{ color: EVENT_ACCENT[key] }}
                    >
                      {key === 'nyc' ? 'new york' : key}
                    </div>
                    <dl className="mt-4 space-y-1 text-sm">
                      <div>
                        <dt className="inline font-semibold">Dates: </dt>
                        <dd className="inline text-neutral-600">{f.dates}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Location: </dt>
                        <dd className="inline text-neutral-600">{f.venue}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Tier: </dt>
                        <dd className="inline text-neutral-600">{proposal.tiers?.[key] ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // One city: the portal's centred hero.
          <div className="relative mx-auto flex w-full max-w-[880px] flex-col items-center text-center">
            <DasWordmark event={proposal.event} accent={accent} />

            <h1 className="mt-8 text-3xl font-bold tracking-tight">Partnership Proposal</h1>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href={EVENT_SITE[(proposal.event || '').toLowerCase()] ?? 'https://blockworks.com/event'}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-white"
              >
                Event website
              </a>
              <button
                onClick={() => setView('deck')}
                className="border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-white"
              >
                Sales deck
              </button>
            </div>

            <dl className="mt-14 flex flex-wrap items-start justify-center gap-x-14 gap-y-8">
              {facts && (
                <>
                  <HeroStat label="Dates" value={facts.dates} />
                  <HeroStat label="Venue" value={facts.venue} />
                </>
              )}
              {proposal.tier && <HeroStat label="Tier" value={proposal.tier} />}
              {price && <HeroStat label="Investment" value={price} accent={accent} />}
            </dl>
          </div>
        )}
      </section>

      {context.length > 0 && (
        <section className="py-16">
          <h2 className="mx-auto mb-6 max-w-6xl px-10 text-sm font-bold uppercase tracking-widest"
            style={{ color: accent }}>
            About Digital Asset Summit
          </h2>
          {/* Full-bleed, and butted together. Inside the padded content column
              these read as screenshots pasted into a document; edge to edge
              with their own generous margins they read as sections. */}
          <div>
            {context.map((m) => (
              <div key={m.id} className="pdf-block">
                <ModuleCard module={m} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Who this is for, in their own words. Sitting here rather than in the
          hero means the personal note lands right before the offer it's
          introducing, instead of competing with the event branding. */}
      {/* max-w-6xl to line up with Your Partnership below it. */}
      <section className="mx-auto max-w-6xl px-10 py-20">
        {/* Copy left, their mark right. No rule of its own — the cover's
            bottom border already separates this from what precedes it. */}
        <div className="pdf-block flex flex-wrap items-center justify-between gap-10">
          <div className="min-w-[16rem] flex-1">
            <div className="mb-4 text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
              Sponsorship Proposal
            </div>
            <h2 className="text-4xl font-bold tracking-tight">
              Welcome, {proposal.company}!
            </h2>
            {/* Always the standard welcome. Anything the rep wants to add
                lands after the pricing, where it can speak to the numbers. */}
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-neutral-700">
              We&apos;ve curated this proposal exclusively for{' '}
              <strong className="font-semibold text-neutral-900">
                Digital Asset Summit{' '}
                {bothEvents ? 'London and Asia' : EVENT_NAME[(proposal.event || '').toLowerCase()] ?? ''}
              </strong>
              , showcasing the sponsorship opportunities we believe will deliver the
              greatest impact for your brand. Explore your recommended sponsorship tier,
              custom activations, investment, and everything included in your package.
            </p>
          </div>
          {proposal.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proposal.logo_url} alt={proposal.company}
              className="h-28 w-auto max-w-[360px] shrink-0 object-contain" />
          )}
        </div>
      </section>

      {bothEvents ? (
        <TierGrid proposal={proposal} tierTables={tierTables} accent={accent} />
      ) : (
        <TierIncluded proposal={proposal} tierTable={tierTable} accent={accent} />
      )}

      <section className="mx-auto max-w-6xl px-10 pb-8 pt-8">
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
          Your Partnership
        </h2>
        {/* Across two cities the activations are grouped under each, which
            says which is which once per group rather than tagging every
            single card. */}
        {bothEvents ? (
          EVENTS_IN_ORDER.map((key) => {
            const items = activations.filter((m) => m.pickedFor === key);
            if (!items.length) return null;
            return (
              <div key={key} className="mt-8">
                <h3
                  className="pdf-keep-with-next text-lg font-bold lowercase tracking-[0.35em]"
                  style={{ color: EVENT_ACCENT[key] }}
                >
                  {key === 'nyc' ? 'new york' : key}
                </h3>
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {items.map((m) => (
                    <div key={`${key}-${m.id}`} className="pdf-block h-full">
                      <ModuleCard module={m} />
                    </div>
                  ))}
                </div>

                {/* That city's session sits with its activations, so each city
                    reads as one block rather than the sessions all landing
                    together after both. */}
                {sessions
                  .filter((session) => session.event === key)
                  .map((session, i) => (
                    <ContentSessionSection
                      key={i}
                      session={session}
                      accent={EVENT_ACCENT[key] ?? accent}
                      nested
                    />
                  ))}
              </div>
            );
          })
        ) : (
          activations.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              {activations.map((m) => (
                <div key={m.id} className="pdf-block h-full">
                  <ModuleCard module={m} />
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* On a both-events proposal these have already been rendered inside
          their city's group above. */}
      {(bothEvents ? sessions.filter((s) => !s.event || !EVENTS_IN_ORDER.includes(s.event)) : sessions)
        .map((session, i) => (
          <ContentSessionSection
            key={i}
            session={session}
            // A session belongs to one city, so it keeps that city's colour
            // even on a proposal whose other sections are black.
            accent={(session.event && EVENT_ACCENT[session.event]) || accent}
          />
        ))}

      <PriceBreakdown proposal={proposal} accent={accent} />

      {/* Optional and personal, sitting under the numbers so it can speak to
          them — a note about what's flexible, or why this shape was chosen. */}
      {proposal.intro_note && (
        <section className="pdf-block mx-auto max-w-6xl px-10 pb-4">
          <div className="border-l-2 pl-6" style={{ borderColor: accent }}>
            <p className="max-w-2xl text-lg leading-relaxed text-neutral-700">
              {proposal.intro_note}
            </p>
            {proposal.created_by && (
              <p className="mt-3 text-sm text-neutral-500">
                {proposal.created_by_name || nameFromEmail(proposal.created_by)}, Blockworks
              </p>
            )}
          </div>
        </section>
      )}

      {/* Close. The price lives in the tier block above. */}
      <section className="pdf-block mx-auto max-w-6xl px-10 pb-28 pt-8">
        <div className="border-t border-neutral-200 pt-16">
          <h2 className="text-5xl font-bold tracking-tight">Thank You</h2>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-neutral-600">
            We&apos;d love to partner with you at{' '}
            <strong className="font-semibold text-neutral-900">
              Digital Asset Summit{' '}
              {bothEvents ? 'London and Asia' : EVENT_NAME[(proposal.event || '').toLowerCase()] ?? ''}
            </strong>
            . If you have any questions or would like to tailor your sponsorship package,
            simply reply to the email that included this proposal and a member of the
            Blockworks team will be in touch.
          </p>

          {/* Just the rep. The sponsor knows their own name and the dates are
              already in the hero — repeating both here was noise. */}
          {proposal.created_by && (
            <div className="mt-10 text-sm">
              <div className="font-semibold uppercase tracking-widest text-neutral-400" style={{ fontSize: '0.7rem' }}>
                Your contact
              </div>
              <div className="mt-1 text-neutral-900">{proposal.created_by_name || nameFromEmail(proposal.created_by)}</div>
              <a href={`mailto:${proposal.created_by}`} className="text-neutral-500 underline">
                {proposal.created_by}
              </a>
            </div>
          )}

          {!skipGate && (
            <a
              href={`/api/proposals/${proposal.slug}/pdf`}
              className="mt-12 inline-block px-5 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              Download PDF
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
