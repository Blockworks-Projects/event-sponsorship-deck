// À la carte: selling individual items instead of a tier.
//
// Offered at every city. On a multi-city proposal each city stands on its own —
// one can be sold à la carte while another is on a tier, or all of them à la
// carte. A city sold as a package is unaffected by this file: the tier price
// covers it and its activations come bundled.
//
// The menu is the priced catalogue below, one list per city. Each item links to
// its activation module (for the card on the sponsor page) by matching the
// deck's title, but the item and its price live here — the synced deck carries
// no per-activation price.
//
// Prices come from the Events view of the SKU Registry in Notion, which is the
// source of truth. Labels do NOT: a branding item's label is what matches it to
// its card in the synced deck, so renaming one silently drops the card from the
// proposal. Change a price freely; change a label only alongside the deck.

export interface MenuItem {
  key: string;
  label: string;
}

/** Events where items can be bought individually. */
export const A_LA_CARTE_EVENTS = ['london', 'asia', 'nyc'];

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
  // Branding by ascending price, then the session slots in duration order —
  // with ten of them, reading down by length beats reading down by price.
  london: [
    { key: 'led-screen-ad', label: 'LED Screen Ad', price: 10000 },
    { key: 'charging-station', label: 'Charging Station', price: 20000 },
    { key: 'drinks-reception', label: 'Drinks Reception', price: 20000 },
    { key: 'large-mirror-branding', label: 'Large Mirror Branding', price: 20000 },
    { key: 'meet-up-zone', label: 'Meet Up Zone', price: 20000 },
    { key: 'pillar-branding', label: 'Pillar Branding', price: 20000 },
    { key: 'restroom-mirror-clings', label: 'Restroom Mirror Clings', price: 20000 },
    { key: 'seat-drop', label: 'Seat Drop', price: 20000 },
    { key: 'travel-tech-bundle', label: 'Travel Tech Bundle', price: 20000 },
    { key: 'event-app', label: 'Event App', price: 30000 },
    { key: 'hospitality-sponsor', label: 'Hospitality Sponsor', price: 30000 },
    { key: 'hotel-key-cards', label: 'Hotel Key Cards', price: 30000 },
    { key: 'livestream-sponsor', label: 'Livestream Sponsor', price: 30000 },
    { key: 'private-meeting-room', label: 'Private Meeting Room', price: 30000 },
    { key: 'pub-crawl', label: 'Pub Crawl', price: 30000 },
    { key: 'stairway-branding', label: 'Stairway Branding', price: 30000 },
    { key: 'track-stage', label: 'Track Stage', price: 30000 },
    { key: 'wristbands', label: 'Wristbands', price: 30000 },
    { key: 'lanyard-sponsor', label: 'Lanyard Sponsor', price: 50000 },
    { key: 'main-stage-sponsor', label: 'Main Stage Sponsor', price: 50000 },
    { key: 'vip-speaker-dinner', label: 'VIP & Speaker Dinner', price: 50000 },
    { key: 'vip-speaker-lounge', label: 'VIP & Speaker Lounge', price: 50000 },
    { key: 'mainstage-5', label: '5 Minute Main Stage Fireside Chat or Keynote', price: 15000, speaking: true },
    { key: 'track-stage-5', label: '5 Minute Track Stage Fireside Chat or Keynote', price: 10000, speaking: true },
    { key: 'mainstage-10', label: '10 Minute Main Stage Fireside Chat or Keynote', price: 25000, speaking: true },
    { key: 'track-stage-10', label: '10 Minute Track Stage Fireside Chat or Keynote', price: 15000, speaking: true },
    { key: 'mainstage-15', label: '15 Minute Main Stage Fireside Chat or Keynote', price: 30000, speaking: true },
    { key: 'track-stage-15', label: '15 Minute Track Stage Session', price: 15000, speaking: true },
    { key: 'mainstage-20', label: '20 Minute Main Stage Fireside Chat or Keynote', price: 40000, speaking: true },
    { key: 'track-stage-20', label: '20 Minute Track Stage Fireside Chat or Keynote', price: 25000, speaking: true },
    { key: 'mainstage-panel', label: 'Main Stage Panel Participation', price: 30000, speaking: true },
    { key: 'track-stage-panel', label: 'Track Stage Panel Participation', price: 20000, speaking: true },
  ],
  // Asia sells no 15-minute Track Stage slot, and its 20-minute Track Stage
  // has no price in the registry — so neither is offered here.
  asia: [
    { key: 'event-app-sponsor', label: 'Event App Sponsor', price: 30000 },
    { key: 'livestream-sponsor', label: 'Livestream Sponsor', price: 30000 },
    { key: 'rollup-tv-livestream', label: 'Rollup TV Livestream Sponsor', price: 30000 },
    { key: 'track-stage-sponsor', label: 'Track Stage Sponsor', price: 30000 },
    { key: 'welcome-gift-sponsor', label: 'Welcome Gift Sponsor', price: 30000 },
    { key: 'wellness-bar', label: 'Wellness Bar', price: 30000 },
    { key: 'hospitality-sponsor', label: 'Hospitality Sponsor', price: 50000 },
    { key: 'investor-mixer', label: 'Investor Mixer', price: 50000 },
    { key: 'lanyard-sponsor', label: 'Lanyard Sponsor', price: 50000 },
    { key: 'main-stage-sponsor', label: 'Main Stage Sponsor', price: 50000 },
    { key: 'registration-sponsor', label: 'Registration Sponsor', price: 50000 },
    { key: 'vip-speaker-lounge', label: 'VIP & Speaker Lounge', price: 50000 },
    { key: 'vip-speaker-mixer', label: 'VIP & Speaker Mixer', price: 50000 },
    { key: 'mainstage-5', label: '5 Minute Main Stage Fireside Chat or Keynote', price: 15000, speaking: true },
    { key: 'track-stage-5', label: '5 Minute Track Stage Fireside Chat or Keynote', price: 10000, speaking: true },
    { key: 'mainstage-10', label: '10 Minute Main Stage Fireside Chat or Keynote', price: 20000, speaking: true },
    { key: 'track-stage-10', label: '10 Minute Track Stage Fireside Chat or Keynote', price: 15000, speaking: true },
    { key: 'mainstage-15', label: '15 Minute Main Stage Fireside Chat or Keynote', price: 30000, speaking: true },
    { key: 'mainstage-20', label: '20 Minute Main Stage Fireside Chat or Keynote', price: 45000, speaking: true },
    { key: 'mainstage-panel', label: 'Main Stage Panel Participation', price: 30000, speaking: true },
    { key: 'track-stage-panel', label: 'Track Stage Panel Participation', price: 20000, speaking: true },
  ],
  // New York's list is the DAS NYC 2027 rows of the registry. Branding by
  // ascending price, then the session slots in duration order — with ten of
  // them, reading down by length beats reading down by price.
  nyc: [
    { key: 'atrium-ad', label: 'Atrium Ad', price: 10000 },
    { key: 'led-screen-ad', label: 'LED Screen Ad', price: 10000 },
    { key: 'outdoor-marquee-ad', label: 'Outdoor Marquee Ad', price: 10000 },
    { key: 'restroom-mirror-clings', label: 'Restroom Mirror Clings', price: 15000 },
    { key: 'water-bottle-refill', label: 'Water Bottle Refill Stations', price: 15000 },
    { key: 'seat-drop', label: 'Seat Drop', price: 20000 },
    { key: 'sponsored-seating', label: 'Sponsored Seating', price: 20000 },
    { key: 'window-cling', label: 'Window Cling', price: 20000 },
    { key: 'bagel-bar', label: 'Bagel Bar', price: 30000 },
    { key: 'drinks-reception', label: 'Drinks Reception Sponsor', price: 30000 },
    { key: 'escalator-branding', label: 'Escalator Branding', price: 30000 },
    { key: 'espresso-bar', label: 'Espresso Bar', price: 30000 },
    { key: 'hanging-banners', label: 'Hanging Banners', price: 30000 },
    { key: 'hospitality-sponsor', label: 'Hospitality Sponsor', price: 30000 },
    { key: 'meet-up-zone', label: 'Meet Up Zone Sponsor', price: 30000 },
    { key: 'track-stage-sponsor', label: 'Track Stage Sponsor', price: 30000 },
    { key: 'wellness-bar', label: 'Wellness Bar', price: 30000 },
    { key: 'private-meeting-room', label: 'Private Meeting Room', price: 40000 },
    { key: 'rollup-tv-livestream', label: 'Rollup TV Livestream', price: 40000 },
    { key: 'coworking-space', label: 'Coworking Space', price: 50000 },
    { key: 'event-app-sponsor', label: 'Event App Sponsor', price: 50000 },
    { key: 'lanyard-sponsor', label: 'Lanyard Sponsor', price: 50000 },
    { key: 'livestream-sponsor', label: 'Livestream Sponsor', price: 50000 },
    { key: 'main-stage-sponsor', label: 'Main Stage Sponsor', price: 50000 },
    { key: 'press-lounge-sponsor', label: 'Press Lounge Sponsor', price: 50000 },
    { key: 'registration-sponsor', label: 'Registration Sponsor', price: 50000 },
    { key: 'wristband-sponsor', label: 'Wristband Sponsor', price: 50000 },
    { key: 'vip-speaker-dinner', label: 'VIP & Speaker Dinner', price: 80000 },
    { key: 'vip-speaker-lounge', label: 'VIP & Speaker Lounge', price: 80000 },
    { key: 'wrap-party-sponsor', label: 'Wrap Party Sponsor', price: 100000 },
    { key: 'mainstage-5', label: '5 Minute Main Stage Fireside Chat or Keynote', price: 15000, speaking: true },
    { key: 'track-stage-5', label: '5 Minute Track Stage Fireside Chat or Keynote', price: 10000, speaking: true },
    { key: 'mainstage-10', label: '10 Minute Main Stage Fireside Chat or Keynote', price: 25000, speaking: true },
    { key: 'track-stage-10', label: '10 Minute Track Stage Fireside Chat or Keynote', price: 15000, speaking: true },
    { key: 'mainstage-15', label: '15 Minute Main Stage Fireside Chat or Keynote', price: 30000, speaking: true },
    { key: 'track-stage-15', label: '15 Minute Track Stage Session', price: 15000, speaking: true },
    { key: 'mainstage-20', label: '20 Minute Main Stage Fireside Chat or Keynote', price: 40000, speaking: true },
    { key: 'track-stage-20', label: '20 Minute Track Stage Fireside Chat or Keynote', price: 25000, speaking: true },
    { key: 'mainstage-panel', label: 'Main Stage Panel Participation', price: 30000, speaking: true },
    { key: 'track-stage-panel', label: 'Track Stage Panel Participation', price: 20000, speaking: true },
  ],
};

/** The catalogue for one city, or an empty list where à la carte isn't sold. */
export function catalogFor(event: string): CatalogItem[] {
  return A_LA_CARTE_CATALOG[event] ?? [];
}

/**
 * Passes on an à la carte package. A tier bundles them in; an à la carte
 * package has no tier, so the rep sets the counts by hand and they are charged
 * per pass. The labels match the tier tables' own rows so a mixed proposal
 * (one city on a tier, one à la carte) lines them up in the same comparison row.
 */
export const TICKET_ITEMS: MenuItem[] = [
  { key: 'ga-tickets', label: 'General Admission' },
  { key: 'vip-tickets', label: 'VIP Tickets' },
];

/** Is this key one of the pass counts rather than an ordinary priced item? */
export function isTicket(key: string): boolean {
  return TICKET_ITEMS.some((t) => t.key === key);
}

/**
 * What one pass costs, per city, from the registry's ticket SKUs. A pass line
 * is charged count × this.
 *
 * A city missing here sells no passes à la carte; a proposal saved before
 * passes were charged keeps the null price it was quoted at, so it still reads
 * as bundled.
 */
export const TICKET_PRICES: Record<string, Record<string, number>> = {
  asia: { 'ga-tickets': 799, 'vip-tickets': 1599 },
  london: { 'ga-tickets': 899, 'vip-tickets': 1999 },
  nyc: { 'ga-tickets': 899, 'vip-tickets': 1999 },
};

/** The per-pass price for one city, or null where passes aren't priced. */
export function ticketPrice(event: string, key: string): number | null {
  return TICKET_PRICES[event]?.[key] ?? null;
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
