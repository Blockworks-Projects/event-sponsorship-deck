// À la carte: selling individual items instead of a tier.
//
// Offered at every event (London, New York and Asia), and on a both-events
// proposal each city stands on its own — either can be sold à la carte while
// the other is on a tier, or both à la carte.
//
// The branding/activation items a city can be sold à la carte are simply that
// city's activations from the synced module library — anything listed under
// the event, resolved in the builder rather than fixed here. The only fixed
// part is the speaking slots below: they have no module of their own, since a
// session is described by the content proposal the rep fills in.

export interface MenuItem {
  key: string;
  label: string;
}

/** Events where items can be bought individually. */
export const A_LA_CARTE_EVENTS = ['london', 'asia', 'nyc'];

/**
 * Speaking slots. No module behind these — a session is described by the
 * content proposal the rep fills in, not by a card from the deck.
 */
export const SPEAKING_ITEMS: MenuItem[] = [
  { key: 'mainstage-20', label: '20 Minute Mainstage Session' },
  { key: 'track-20', label: '20 Minute Track Stage Session' },
  { key: 'track-5', label: '5 Minute Track Stage (Launch/Demo)' },
];

/** A line on an à la carte proposal. */
export interface MenuLine {
  key: string;
  label: string;
  event: string;
  moduleId?: string | null;
  /** Typed by the rep: every à la carte line is priced by hand. */
  price?: string | null;
}

/** Does picking this item mean a content proposal should be filled in? */
export function isSpeaking(key: string): boolean {
  return SPEAKING_ITEMS.some((item) => item.key === key);
}
