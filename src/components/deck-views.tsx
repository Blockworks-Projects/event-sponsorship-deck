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
      {/* Only worth showing tabs when there's more than one deck to split by. */}
      {decks.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {tabs.map((key) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                className={
                  'rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (isActive
                    ? 'border-neutral-500 bg-neutral-700 text-neutral-50'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200')
                }
              >
                {key === 'all' ? 'All decks' : label(key)}
                <span className="ml-1.5 text-neutral-500">{countFor(key)}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-sm text-neutral-300">
        {filtered.length} view{filtered.length === 1 ? '' : 's'} · {uniqueViewers} viewer
        {uniqueViewers === 1 ? '' : 's'}
      </p>

      <ul className="mt-3 space-y-2">
        {filtered.map((v) => (
          <li
            key={v.id}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-800 pb-2 text-sm last:border-b-0 last:pb-0"
          >
            <span className="text-neutral-200">
              {v.viewer_email}
              {v.deck_key && (
                <span className="ml-2 text-xs text-neutral-500">
                  {label(v.deck_key)}
                </span>
              )}
            </span>
            <span className="text-xs text-neutral-500">
              <ViewedAt iso={v.started_at} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
