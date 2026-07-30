// The à la carte menu, from the "A La Carte Overview" slide in the builder
// deck. Selling individual items instead of a tier.
//
// Asia only at the moment. The list lives here rather than being read off the
// slide because the slide is a picture of a list — the items themselves are
// already in the module library, and what's needed is which of them are sold
// this way.

export interface MenuItem {
  key: string;
  label: string;
  /**
   * Finds this item in the synced module library, so the proposal shows the
   * same card a tier proposal would. Matched loosely on purpose: the slide
   * says "Meetup Zone" where the deck says "Meet-up Zone", and "Roll-up TV"
   * against "Rollup TV".
   */
  match?: RegExp;
}

/** Events where items can be bought individually. */
export const A_LA_CARTE_EVENTS = ['asia'];

export const BRANDING_ITEMS: MenuItem[] = [
  { key: 'welcome-gift', label: 'Welcome Gift', match: /welcome gift/i },
  { key: 'meetup-zone', label: 'Meetup Zone', match: /meet-?up zone/i },
  { key: 'livestream', label: 'Livestream', match: /^livestream/i },
  { key: 'event-app', label: 'Event App', match: /event app/i },
  { key: 'wellness-bar', label: 'Wellness Bar', match: /wellness bar/i },
  { key: 'track-stage', label: 'Track Stage', match: /track stage/i },
  { key: 'hospitality', label: 'Hospitality Sponsor', match: /hospitality/i },
  { key: 'rollup-tv', label: 'Roll-up TV Livestream', match: /roll-?up tv/i },
];

/**
 * Speaking slots. No module behind these — a session is described by the
 * content proposal the rep fills in, not by a card from the deck.
 */
export const SPEAKING_ITEMS: MenuItem[] = [
  { key: 'mainstage-20', label: '20 Minute Mainstage Session' },
  { key: 'track-20', label: '20 Minute Track Stage Session' },
  { key: 'track-5', label: '5 Minute Track Stage (Launch/Demo)' },
];

export const MENU_ITEMS = [...BRANDING_ITEMS, ...SPEAKING_ITEMS];

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
