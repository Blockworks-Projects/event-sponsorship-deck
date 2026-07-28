export interface SessionSpeaker {
  name: string;
  // Kept apart because the deck's speaker slide sets them in separate boxes;
  // the web proposal joins them back together for display.
  jobTitle?: string;
  company?: string;
  photo?: string;
}

/** "Founder, Uniswap" — the two halves as one line, for the web proposal. */
export function speakerRole(speaker: SessionSpeaker): string {
  return [speaker.jobTitle, speaker.company].filter(Boolean).join(', ');
}

/**
 * A bespoke content session, when one has been agreed with the sponsor.
 *
 * `heading` and `description` are the rep's pitch; `title` and `speakers`
 * come from the event agenda in Airtable. Keeping them apart matters because
 * the deck sets them in different places on the slide.
 */
export interface ContentSession {
  /** Which event this session is at. Absent on older single-event proposals. */
  event?: string;
  /** The rep's headline, e.g. "Mainstage Fireside with Uniswap". */
  heading: string;
  /** The rep's blurb about what Blockworks will build. */
  description?: string;
  /** The agenda's own session title. */
  title?: string;
  speakers: SessionSpeaker[];
}

export interface TierRow {
  label: string;
  values: Record<string, string>; // keyed by lowercase tier name
}

// Shared types matching supabase/schema.sql's sponsorship_modules /
// proposals / proposal_modules / deck_views tables.

export type ModuleCategory = 'core' | 'tier-table' | 'activation';
export type ModuleStatus = 'draft' | 'published' | 'archived';

export interface SponsorshipModule {
  id: string;
  google_slide_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  bullets: string[];
  images: string[]; // Supabase Storage URLs
  availability: Record<string, string>; // e.g. { asia: "Available", london: "On Hold" }
  pricing: Record<string, string>; // tier tables only, e.g. { presenting: "$175K" }
  tier_rows: TierRow[]; // tier tables only: what each tier includes
  tier: string | null;
  region: string | null;
  category: ModuleCategory;
  status: ModuleStatus;
  display_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ProposalStatus = 'draft' | 'sent';

export interface Proposal {
  id: string;
  slug: string;
  company: string;
  contact_name: string | null;
  contact_email: string | null;
  event: 'london' | 'nyc' | 'asia' | 'both' | null;
  // Snapshot at creation, not read live — a sent quote must not reprice
  // itself when someone edits the content deck.
  tier: string | null;
  /** Both-events proposals: the tier bought at each, e.g. {london:'Presenting'}. */
  tiers: Record<string, string> | null;
  list_price: string | null;
  /** A hand-typed total for a bundled deal; wins over the calculated one. */
  total_override: string | null;
  discount_percent: number | null;
  discount_amount: number | null;
  discounted_price: string | null;
  logo_url: string | null;
  intro_note: string | null;
  /** Per-event pricing snapshot: what each event lists at and is charged. */
  price_lines: {
    event: string;
    tier: string;
    list: string | null;
    net: string | null;
    discount: string | null;
  }[] | null;
  event_discounts: Record<string, { amount: number | null }> | null;
  /** Items sold without a tier, each priced by hand. Asia only at present. */
  a_la_carte:
    | { key: string; label: string; event: string; moduleId?: string | null; price?: string | null }[]
    | null;
  include_kiosk: boolean | null;
  content_session: ContentSession | null; // legacy single session
  content_sessions: ContentSession[] | null;
  total_price: string | null;
  created_by: string | null;
  created_by_name: string | null;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
}

export interface ProposalModuleLink {
  proposal_id: string;
  module_id: string;
  sort_order: number;
}

/** A module joined with its position in a specific proposal. */
export interface ProposalModuleWithContent extends SponsorshipModule {
  sort_order: number;
}

export type DeckType = 'public' | 'proposal';

export interface DeckView {
  id: string;
  deck_type: DeckType;
  proposal_id: string | null;
  viewer_name: string | null;
  viewer_email: string;
  viewer_company: string | null;
  user_agent: string | null;
  session_id: string | null;
  started_at: string;
  ended_at: string | null;
}

/** Shape returned by the Apps Script sync endpoint's `rows` — mirrors the
 * Card Registry row shape from Sponsor Deck Builder/DeckIndexer.gs. */
export interface SyncRow {
  id: string;
  label: string;
  category: ModuleCategory;
  region: string;
  tier: string;
  availability: string;
  sourceSlideIndex: number;
  sourceSlideObjectId: string;
  side: string;
  cardElementIds: string[] | '';
  cardBoxEMU: { x: number; y: number; width: number; height: number } | '';
  imageUrls: string[];
  description?: string;
  bullets?: string[];
  availabilityMap?: Record<string, string>;
  pricing?: Record<string, string>;
  status?: string;
  tierRows?: TierRow[];
  stagingSlideId: string;
  cropFraction: unknown;
  notes: string;
}
