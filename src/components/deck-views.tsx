'use client';

// The deck views list with filter tabs, one per deck (plus "All"), so you can
// narrow the log to just the people who opened a given deck. Client-side
// because the filtering and per-viewer drill-down are interactive; the rows
// themselves come pre-fetched from the server page.
//
// Clicking a row opens that one person's slide-by-slide breakdown: how long
// they lingered on each slide, named from the synced deck. It's per-viewer on
// purpose — "what did *this* prospect actually read" is the question a rep
// asks, more than the deck-wide average.
import { useMemo, useState } from 'react';
import { ViewedAt } from '@/components/viewed-at';

type View = {
  id: string | number;
  viewer_email: string;
  started_at: string;
  deck_key: string | null;
  slide_dwell?: Record<string, number> | null;
  duration_seconds?: number | null;
};

type SlideMeta = { index: number; title: string | null };

const UNKNOWN = 'unknown';

function fmtSeconds(s: number): string {
  if (s >= 60) return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
  return `${Math.round(s)}s`;
}

export function DeckViews({
  views,
  deckLabels,
  slidesByDeck = {},
}: {
  views: View[];
  deckLabels: Record<string, string>;
  /** Slide titles per deck, from the sync, so a breakdown can name slides. */
  slidesByDeck?: Record<string, SlideMeta[]>;
}) {
  const [active, setActive] = useState<string>('all');
  // Which viewer row is expanded, by view id. Only one open at a time.
  const [open, setOpen] = useState<string | number | null>(null);

  const label = (key: string) =>
    key === UNKNOWN ? 'Other' : deckLabels[key] ?? key;

  // Distinct decks present in the data, in the order they first appear. Built
  // from the rows rather than a fixed list so a new deck shows up on its own.
  const decks = useMemo(() => {
    const seen: string[] = [];
    for (const v of views) {
      // Views with no deck recorded (older public opens from before deck
      // tracking) don't get their own tab — they still count under "All decks".
      if (!v.deck_key) continue;
      if (!seen.includes(v.deck_key)) seen.push(v.deck_key);
    }
    return seen;
  }, [views]);

  const filtered =
    active === 'all'
      ? views
      : views.filter((v) => (v.deck_key ?? UNKNOWN) === active);

  const countFor = (key: string) =>
    key === 'all'
      ? views.length
      : views.filter((v) => (v.deck_key ?? UNKNOWN) === key).length;

  const uniqueViewers = new Set(filtered.map((v) => v.viewer_email)).size;

  const tabs = ['all', ...decks];

  /** The per-slide seconds for one view, in slide order, named where the deck
   * has been synced. */
  function breakdown(
    v: View
  ): { index: number; title: string | null; seconds: number }[] {
    const dwell = v.slide_dwell ?? {};
    const known = slidesByDeck[v.deck_key ?? ''] ?? [];
    if (known.length) {
      return known.map((s) => ({
        index: s.index,
        title: s.title,
        seconds: (Number(dwell[String(s.index)]) || 0) / 1000,
      }));
    }
    // Deck not synced yet: fall back to whatever slide numbers were recorded.
    return Object.entries(dwell)
      .map(([k, ms]) => ({ index: Number(k), title: null, seconds: (Number(ms) || 0) / 1000 }))
      .sort((a, b) => a.index - b.index);
  }

  return (
    <>
      <div className="bx-views-head">
        <h3>
          {filtered.length} view{filtered.length === 1 ? '' : 's'} · {uniqueViewers} viewer
          {uniqueViewers === 1 ? '' : 's'}
        </h3>
        {/* Only worth showing tabs when there's more than one deck to split by. */}
        {decks.length > 1 && (
          <div className="bx-tabs">
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                className={`bx-tab${key === active ? ' on' : ''}`}
              >
                {key === 'all' ? 'All decks' : label(key)} <span>{countFor(key)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="bx-viewlist">
        {filtered.map((v) => {
          const hasSlides = !!v.slide_dwell && Object.keys(v.slide_dwell).length > 0;
          const isOpen = open === v.id;
          // Only the slides they actually spent time on — skipped slides add
          // noise to "what did this person read".
          const rows = isOpen ? breakdown(v).filter((r) => r.seconds > 0) : [];
          const max = Math.max(1, ...rows.map((r) => r.seconds));

          return (
            <li key={v.id} className="bx-vitem">
              <div
                className={`bx-vrow${hasSlides ? ' clickable' : ''}${isOpen ? ' open' : ''}`}
                role={hasSlides ? 'button' : undefined}
                tabIndex={hasSlides ? 0 : undefined}
                aria-expanded={hasSlides ? isOpen : undefined}
                onClick={hasSlides ? () => setOpen(isOpen ? null : v.id) : undefined}
                onKeyDown={
                  hasSlides
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpen(isOpen ? null : v.id);
                        }
                      }
                    : undefined
                }
              >
                {hasSlides && <span className={`bx-vcaret${isOpen ? ' open' : ''}`}>›</span>}
                <span className="bx-vemail">
                  <span className="bx-vinit">{(v.viewer_email || '?').charAt(0).toUpperCase()}</span>
                  <span className="addr">{v.viewer_email}</span>
                </span>
                {v.deck_key && (
                  <span className={`bx-deckchip ${v.deck_key === 'nyc' ? 'nyc' : 'das'}`}>
                    {label(v.deck_key)}
                  </span>
                )}
                <span className="bx-vtime">
                  <ViewedAt iso={v.started_at} />
                </span>
              </div>

              {isOpen && (
                <div className="bx-vpanel">
                  <div className="bx-vpanel-head">
                    Slides {v.viewer_email} spent time on
                    {typeof v.duration_seconds === 'number' && v.duration_seconds > 0 && (
                      <span> · {fmtSeconds(v.duration_seconds)} total</span>
                    )}
                  </div>
                  {rows.length > 0 ? (
                    rows.map((r) => {
                      const ratio = r.seconds / max;
                      const tier = ratio >= 0.66 ? 'hot' : ratio >= 0.33 ? 'warm' : 'cool';
                      return (
                        <div key={r.index} className="bx-heat-row">
                          <span className="n">{r.index}</span>
                          <span className="name">{r.title || `Slide ${r.index}`}</span>
                          <span className="bx-heat-track">
                            <span
                              className={`bx-heat-fill ${tier}`}
                              style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
                            />
                          </span>
                          <span className={`t${tier === 'hot' ? ' hot' : ''}`}>{fmtSeconds(r.seconds)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="bx-vpanel-empty">
                      No per-slide time recorded for this open.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
