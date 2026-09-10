import type { CSSProperties } from 'react';

// The DAS cities, and how a proposal names the ones it covers.
//
// A proposal's `event` is one city ('london'), or several joined with '+' in
// the order the events happen ('london+nyc'). Asia + London keeps the spelling
// it had when it was the only pair — 'both' — so every proposal for those two
// carries the same value whenever it was made. Nothing reads `event` directly:
// eventsOf() resolves either spelling, so the difference stays in here.

/** Every city, chronological: Asia is October 2026, London November 2026, New
 *  York March 2027. This is the order cities read in everywhere. */
export const EVENT_KEYS = ['asia', 'london', 'nyc'];

/** How each city is named in prose. Not the venue city — Asia's venue is in
 *  Singapore, but the event is "Digital Asset Summit Asia". */
export const EVENT_LABEL: Record<string, string> = {
  asia: 'Asia',
  london: 'London',
  nyc: 'New York',
};

/** The city set lowercase, as the deck's own headings set it. */
export const EVENT_LOWER: Record<string, string> = {
  asia: 'asia',
  london: 'london',
  nyc: 'new york',
};

/** Asia + London's original spelling, kept so old rows and new ones match. */
const ASIA_LONDON = 'both';

/** The cities a proposal's `event` covers, chronological. Empty when unset. */
export function eventsOf(event?: string | null): string[] {
  const raw = (event || '').toLowerCase().trim();
  if (!raw) return [];
  if (raw === ASIA_LONDON) return ['asia', 'london'];
  const picked = raw.split('+').map((key) => key.trim());
  // Filtered through EVENT_KEYS rather than returned as split, so the order is
  // always chronological and an unknown key can't reach the rest of the app.
  return EVENT_KEYS.filter((key) => picked.includes(key));
}

/** The `event` value for a set of cities — the inverse of eventsOf(). */
export function eventKeyFor(cities: string[]): string {
  const ordered = EVENT_KEYS.filter((key) => cities.includes(key));
  if (!ordered.length) return '';
  if (ordered.length === 2 && ordered[0] === 'asia' && ordered[1] === 'london') {
    return ASIA_LONDON;
  }
  return ordered.join('+');
}

/** Does this proposal span more than one city? */
export function isMultiEvent(event?: string | null): boolean {
  return eventsOf(event).length > 1;
}

/** "London", or "London + New York" — for a chip or a heading. */
export function eventLabel(event?: string | null): string {
  return eventsOf(event)
    .map((key) => EVENT_LABEL[key])
    .join(' + ');
}

/** "London and New York" — for a sentence. */
export function eventProse(event?: string | null): string {
  const names = eventsOf(event).map((key) => EVENT_LABEL[key]);
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The swatch on an event chip: the city's colour, or one band per city on a
 *  multi-city deal, in the same chronological order. */
function eventSwatch(event?: string | null): string {
  const colors = eventsOf(event).map((key) => `var(--bx-${key})`);
  if (!colors.length) return 'var(--bx-faint)';
  if (colors.length === 1) return colors[0];
  const stops = colors.map(
    (color, i) =>
      `${color} ${((i / colors.length) * 100).toFixed(2)}% ${(((i + 1) / colors.length) * 100).toFixed(2)}%`
  );
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** The `style` for an event chip — its swatch, as the custom property the
 *  chip's CSS reads. One helper, because a CSS custom property has to be
 *  asserted past React's style type and that is worth doing in a single place. */
export function eventChipStyle(event?: string | null): CSSProperties {
  return { '--bx-e': eventSwatch(event) } as CSSProperties;
}
