// Shared by creating and editing a proposal, so the two can't drift — a
// price rule or a headshot copy that only ran on create would silently stop
// applying the moment someone edited.
import { supabase } from '@/lib/supabase';
import { parsePrice, formatPrice } from '@/lib/pricing';
import { validEmailList } from '@/lib/contacts';
import type { MenuLine } from '@/lib/a-la-carte';
import type { ContentSession } from '@/lib/types';

const HEADSHOT_BUCKET = 'session-speakers';

export interface ProposalInput {
  company: string;
  contactName?: string;
  contactEmail?: string;
  event?: string;
  createdBy?: string;
  createdByName?: string;
  tier?: string;
  /** Both-events: the tier at each, e.g. {london:'Presenting', asia:'Diamond'}. */
  tiers?: Record<string, string>;
  totalOverride?: string;
  discountPercent?: number;
  discountAmount?: number;
  /**
   * The authoritative charge for each event — the checkout's per-event total
   * (package price plus any extra activations, added benefits and extra
   * passes). May be above or below the tier's list price. Keyed by event.
   */
  eventPrices?: Record<string, string>;
  /** Selling individual items instead of a tier. Each line carries its price. */
  aLaCarte?: MenuLine[];
  logoUrl?: string;
  introNote?: string;
  includeKiosk?: boolean;
  contentSession?: ContentSession;
  contentSessions?: ContentSession[];
  /** Per-event tweaks to the tier's included list, keyed by event. */
  includedOverrides?: Record<string, { removed: string[]; added: string[] }>;
  /** Each pick, with the event it's for. */
  modules?: { moduleId: string; event?: string }[];
  /** Older callers: module ids with no event. */
  moduleIds?: string[];
}

/**
 * The standard investment for one tier at one event, as written on that
 * event's tier table in the content deck.
 */
export async function standardPriceFor(event: string, tier: string): Promise<string | null> {
  const { data } = await supabase
    .from('sponsorship_modules')
    .select('pricing, region')
    .eq('category', 'tier-table');

  const table = (data ?? []).find((m) => (m.region || '').toLowerCase() === event.toLowerCase());
  if (!table) return null;
  return (table.pricing as Record<string, string>)[tier.toLowerCase()] ?? null;
}

/**
 * Copies speaker headshots into our own Storage. Airtable attachment URLs
 * expire within hours, so a proposal that stored one would show broken
 * images by the time a sponsor opened it.
 */
export async function persistSessionHeadshots(
  session: ContentSession | undefined
): Promise<ContentSession | null> {
  if (!session?.heading) return null;
  if (!session.speakers?.length) return session;

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === HEADSHOT_BUCKET)) {
    await supabase.storage.createBucket(HEADSHOT_BUCKET, { public: true });
  }

  const speakers = await Promise.all(
    session.speakers.map(async (speaker) => {
      // Already ours from an earlier save — don't copy it again on every edit.
      if (!speaker.photo || speaker.photo.includes('/storage/v1/object/public/')) return speaker;
      try {
        const res = await fetch(speaker.photo);
        if (!res.ok) return { ...speaker, photo: undefined };
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from(HEADSHOT_BUCKET)
          .upload(path, new Uint8Array(await res.arrayBuffer()), { contentType, upsert: false });
        if (error) return { ...speaker, photo: undefined };
        const { data } = supabase.storage.from(HEADSHOT_BUCKET).getPublicUrl(path);
        return { ...speaker, photo: data.publicUrl };
      } catch {
        // A missing headshot shouldn't stop a proposal being saved.
        return { ...speaker, photo: undefined };
      }
    })
  );

  return { ...session, speakers };
}

/**
 * The tier bought at each event. A single-event proposal has one entry; a
 * both-events one can have a different tier at each, since a sponsor may go
 * Presenting in London and Diamond in Asia.
 */
function tierMap(input: ProposalInput): Record<string, string> {
  if (input.tiers && Object.keys(input.tiers).length) return input.tiers;
  if (input.event && input.event !== 'both' && input.tier) return { [input.event]: input.tier };
  return {};
}

/** Every column a proposal write sets, derived from the submitted form. */
export async function proposalColumns(input: ProposalInput) {
  const tiers = tierMap(input);

  // Across both events this is the sum of each event's tier price. The
  // formatted string is rebuilt from the total rather than concatenated, so
  // "$125K + $100K" reads as one figure.
  const entries = Object.entries(tiers);
  const standard = await Promise.all(
    entries.map(([event, tier]) => standardPriceFor(event, tier))
  );

  // One line per event: what it lists at, what is being charged, and the
  // difference. Snapshotted onto the proposal so the quote can't move when
  // someone edits a tier table months later.
  const lines = entries.map(([event, tier], i) => {
    // `list` is the tier's standard price (the strike-through reference).
    // `net` is what's actually being charged for the city — the checkout's
    // per-event total (package + any extra activations, added benefits and
    // extra passes), which the form sends in eventPrices. It is authoritative
    // and may sit above or below list.
    const list = parsePrice(standard[i]);
    const typed = parsePrice(input.eventPrices?.[event] ?? '');
    const net = typed ?? list;
    const off = list !== null && net !== null && list > net ? list - net : null;
    return {
      event,
      tier,
      list: list === null ? null : formatPrice(list),
      net: net === null ? null : formatPrice(net),
      discount: off === null ? null : formatPrice(off),
    };
  });

  const sum = (pick: (line: (typeof lines)[number]) => string | null) =>
    lines.reduce<number | null>((running, line) => {
      const value = parsePrice(pick(line));
      return value === null ? running : (running ?? 0) + value;
    }, null);

  // À la carte has no list price to discount against — the rep types what
  // each item costs, and the total is their sum.
  const menu = (input.aLaCarte ?? []).filter((line) => line.key);
  const menuTotal = menu.reduce<number | null>((running, line) => {
    const value = parsePrice(line.price ?? '');
    return value === null ? running : (running ?? 0) + value;
  }, null);

  const listTotal = sum((line) => line.list);
  const netTotal = sum((line) => line.net);
  const listPrice = listTotal === null ? null : formatPrice(listTotal);

  const eventDiscounts = Object.fromEntries(
    lines
      .filter((line) => line.discount)
      .map((line) => [line.event, { amount: parsePrice(line.discount) }])
  );

  // What's billed: the authoritative per-event charges (netTotal) plus any à
  // la carte items — unless the rep typed a negotiated grand total, which wins.
  const combined =
    netTotal === null && menuTotal === null ? null : (netTotal ?? 0) + (menuTotal ?? 0);
  const overrideValue = parsePrice(input.totalOverride ?? '');
  const quotedValue = overrideValue ?? combined;
  const quoted = quotedValue === null ? null : formatPrice(quotedValue);

  // A genuine reduction below the tier standard shows as a struck-through
  // discount; the value shown is always the authoritative quote.
  const discounted =
    quotedValue !== null && listTotal !== null && quotedValue < listTotal ? quoted : null;

  return {
    company: input.company,
    contact_name: input.contactName || null,
    contact_email: input.contactEmail || null,
    event: input.event || null,
    tier: input.tier || null,
    tiers: Object.keys(tiers).length ? tiers : null,
    list_price: listPrice,
    total_override: input.totalOverride?.trim() || null,
    discount_percent: input.discountPercent ?? null,
    discount_amount: input.discountAmount ?? null,
    event_discounts: Object.keys(eventDiscounts).length ? eventDiscounts : null,
    // Kept even alongside à la carte items: a proposal can be a tier in one
    // city and items in the other, and the investment table needs both halves.
    price_lines: lines.length ? lines : null,
    a_la_carte: menu.length ? menu : null,
    discounted_price: discounted,
    total_price: quoted,
    created_by: input.createdBy || null,
    created_by_name: input.createdByName || null,
    logo_url: input.logoUrl || null,
    intro_note: input.introNote || null,
    // Undefined (an older client, or a field that wasn't sent) means yes.
    include_kiosk: input.includeKiosk !== false,
    content_session: await persistSessionHeadshots(input.contentSession),
    content_sessions: input.contentSessions?.length
      ? ((
          await Promise.all(input.contentSessions.map((s) => persistSessionHeadshots(s)))
        ).filter(Boolean) as ContentSession[])
      : null,
    included_overrides:
      input.includedOverrides && Object.keys(input.includedOverrides).length
        ? input.includedOverrides
        : null,
    updated_at: new Date().toISOString(),
  };
}

/** Replaces a proposal's picks, preserving the given order. */
export async function replaceModules(
  proposalId: string,
  picks: { moduleId: string; event?: string }[]
) {
  await supabase.from('proposal_modules').delete().eq('proposal_id', proposalId);
  if (!picks.length) return null;

  const { error } = await supabase.from('proposal_modules').insert(
    picks.map((pick, index) => ({
      proposal_id: proposalId,
      module_id: pick.moduleId,
      event: pick.event ?? null,
      sort_order: index,
    }))
  );
  return error;
}

/** The picks from either shape of input. */
export function picksFrom(input: ProposalInput) {
  if (input.modules?.length) return input.modules;
  return (input.moduleIds ?? []).map((moduleId) => ({ moduleId }));
}

/**
 * A proposal may carry no activations only when every tier on it is Gold —
 * the one tier sold without one. Enforced here as well as in the builder, so
 * the rule holds for anything else that ever posts to this API.
 */
export function allowsNoModules(input: ProposalInput): boolean {
  // À la carte sells items directly, and a speaking-only order picks no
  // activation modules at all.
  if (input.aLaCarte?.length) return true;

  const tiers = input.tiers
    ? Object.values(input.tiers)
    : input.tier
      ? [input.tier]
      : [];
  return tiers.length > 0 && tiers.every((t) => (t || '').toLowerCase() === 'gold');
}

/**
 * The fields a proposal cannot be sent without: who it's for, who to talk to,
 * and the address that unlocks the page. Returns a message, or null when fine.
 */
export function missingRequiredField(input: ProposalInput): string | null {
  if (!input.company?.trim()) return 'A company is required.';
  if (!input.contactName?.trim()) return 'A contact name is required.';
  if (!validEmailList(input.contactEmail)) {
    return 'A valid contact email is required. It is the address that unlocks the proposal.';
  }
  return null;
}
