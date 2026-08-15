// À la carte: selling individual items instead of a tier.
//
// Offered at London and Asia. On a both-events proposal each city stands on its
// own — either can be sold à la carte while the other is on a tier, or both à
// la carte. New York has no priced menu yet, so it is package-only.
//
// The menu is the priced catalogue below, one list per city. Each item links to
// its activation module (for the card on the sponsor page) by matching the
// deck's title, but the item and its price live here — the synced deck carries
// no per-activation price.

export interface MenuItem {
  key: string;
  label: string;
}

/** Events where items can be bought individually. */
export const A_LA_CARTE_EVENTS = ['london', 'asia'];

/**
 * A priced à la carte item. `price` is the default the checkout pre-fills, in
 * whole pounds/dollars; the rep can override it. `speaking` marks a session
 * slot, which drives a content proposal and has no activation card.
 */
export interface CatalogItem {
  key: string;
  label: string;
  price: number;
  speaking?: boolean;
}

/**
 * The à la carte menu per city, with the seller's set prices. Labels are used
 * to match the item to its synced activation module (normalised, in the
 * builder) so it shows the same card a tier proposal would.
 */
export const A_LA_CARTE_CATALOG: Record<string, CatalogItem[]> = {
  london: [
    { key: 'drinks-reception', label: 'Drinks Reception', price: 20000 },
    { key: 'restroom-mirror-clings', label: 'Restroom Mirror Clings', price: 20000 },
    { key: 'pillar-branding', label: 'Pillar Branding', price: 20000 },
    { key: 'large-mirror-branding', label: 'Large Mirror Branding', price: 20000 },
    { key: 'speciality-tea-station', label: 'Speciality Tea Station', price: 20000 },
    { key: 'espresso-bar', label: 'Espresso Bar', price: 20000 },
    { key: 'charging-station', label: 'Charging Station', price: 20000 },
    { key: 'travel-tech-bundle', label: 'Travel Tech Bundle', price: 20000 },
    { key: 'seat-drop', label: 'Seat Drop', price: 20000 },
    { key: 'led-screen-ad', label: 'LED Screen Ad', price: 20000 },
    { key: 'meet-up-zone', label: 'Meet Up Zone', price: 20000 },
    { key: 'hospitality-sponsor', label: 'Hospitality Sponsor', price: 30000 },
    { key: 'track-stage', label: 'Track Stage', price: 30000 },
    { key: 'private-meeting-room', label: 'Private Meeting Room', price: 30000 },
    { key: 'stairway-branding', label: 'Stairway Branding', price: 30000 },
    { key: 'hotel-key-cards', label: 'Hotel Key Cards', price: 30000 },
    { key: 'wristbands', label: 'Wristbands', price: 30000 },
    { key: 'event-app', label: 'Event App', price: 30000 },
    { key: 'livestream-sponsor', label: 'Livestream Sponsor', price: 30000 },
    { key: 'pub-crawl', label: 'Pub Crawl', price: 30000 },
    { key: 'investor-mixer', label: 'Investor Mixer', price: 50000 },
    { key: 'lanyard-sponsor', label: 'Lanyard Sponsor', price: 50000 },
    { key: 'vip-speaker-lounge', label: 'VIP & Speaker Lounge', price: 50000 },
    { key: 'vip-speaker-dinner', label: 'VIP & Speaker Dinner', price: 50000 },
    { key: 'main-stage-sponsor', label: 'Main Stage Sponsor', price: 50000 },
    { key: 'investor-stage-5', label: '5 Minute Investor Stage Session', price: 10000, speaking: true },
    { key: 'investor-stage-15', label: '15 Minute Investor Stage Session', price: 25000, speaking: true },
    { key: 'mainstage-20', label: '20 Minute Main Stage Session', price: 45000, speaking: true },
  ],
  asia: [
    { key: 'investor-stage-5', label: '5 Minute Investor Stage Session', price: 10000, speaking: true },
    { key: 'investor-stage-15', label: '15 Minute Investor Stage Session', price: 25000, speaking: true },
    { key: 'mainstage-20', label: '20 Minute Mainstage Session', price: 45000, speaking: true },
    { key: 'track-stage-sponsor', label: 'Track Stage Sponsor', price: 30000 },
    { key: 'welcome-gift-sponsor', label: 'Welcome Gift Sponsor', price: 30000 },
    { key: 'rollup-tv-livestream', label: 'Rollup TV Livestream Sponsor', price: 30000 },
    { key: 'wellness-bar', label: 'Wellness Bar', price: 30000 },
    { key: 'event-app-sponsor', label: 'Event App Sponsor', price: 30000 },
    { key: 'livestream-sponsor', label: 'Livestream Sponsor', price: 30000 },
    { key: 'meet-up-zone', label: 'Meet Up Zone', price: 30000 },
    { key: 'main-stage-sponsor', label: 'Main Stage Sponsor', price: 50000 },
    { key: 'investor-mixer', label: 'Investor Mixer', price: 50000 },
    { key: 'hospitality-sponsor', label: 'Hospitality Sponsor', price: 50000 },
    { key: 'lanyard-sponsor', label: 'Lanyard Sponsor', price: 50000 },
    { key: 'registration-sponsor', label: 'Registration Sponsor', price: 50000 },
    { key: 'vip-speaker-mixer', label: 'VIP & Speaker Mixer', price: 50000 },
    { key: 'vip-speaker-lounge', label: 'VIP & Speaker Lounge', price: 50000 },
  ],
};

/** The catalogue for one city, or an empty list where à la carte isn't sold. */
export function catalogFor(event: string): CatalogItem[] {
  return A_LA_CARTE_CATALOG[event] ?? [];
}

/**
 * Passes included in an à la carte package. A tier bundles these in; an à la
 * carte package has no tier, so the rep sets the counts by hand. The labels
 * match the tier tables' own rows so a mixed proposal (one city on a tier, one
 * à la carte) lines them up in the same comparison row.
 */
export const TICKET_ITEMS: MenuItem[] = [
  { key: 'ga-tickets', label: 'General Admission' },
  { key: 'vip-tickets', label: 'VIP Tickets' },
];

/** Is this key one of the included-pass counts rather than a priced item? */
export function isTicket(key: string): boolean {
  return TICKET_ITEMS.some((t) => t.key === key);
}

/** A line on an à la carte proposal. */
export interface MenuLine {
  key: string;
  label: string;
  event: string;
  moduleId?: string | null;
  /** The item's price, defaulted from the catalogue and overridable by the rep. */
  price?: string | null;
  /**
   * Included passes rather than a priced item: the count of General Admission
   * or VIP tickets in the package. Present only on ticket lines, which carry no
   * price and add nothing to the total.
   */
  qty?: number | null;
}

/** Does picking this item mean a content proposal should be filled in? A
 *  session slot does; an ordinary activation does not. */
export function isSpeaking(event: string, key: string): boolean {
  return catalogFor(event).some((item) => item.key === key && item.speaking);
}
