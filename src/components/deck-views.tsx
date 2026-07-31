'use client';

// The deck views list with filter tabs, one per deck (plus "All"), so you can
// narrow the log to just the people who opened a given deck. Client-side
// because the filtering is interactive; the rows themselves come pre-fetched
// from the server page.
import { useMemo, useState } from 'react';
import { ViewedAt } from '@/components/viewed-at';

type View = {
  id: string | number;
  viewer_email: string;
  started_at: string;
  deck_key: string | null;
};

const UNKNOWN = 'unknown';

export function DeckViews({
  views,
  deckLabels,
}: {
  views: View[];
  deckLabels: Record<string, string>;
}) {
  const [active, setActive] = useState<string>('all');

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
        {filtered.map((v) => (
          <li key={v.id} className="bx-vrow">
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
          </li>
        ))}
      </ul>
    </>
  );
}
