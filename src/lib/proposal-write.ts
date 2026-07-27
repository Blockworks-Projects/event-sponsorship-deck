// Shared by creating and editing a proposal, so the two can't drift — a
// price rule or a headshot copy that only ran on create would silently stop
// applying the moment someone edited.
import { supabase } from '@/lib/supabase';
import { applyDiscount, parsePrice, formatPrice } from '@/lib/pricing';
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
  logoUrl?: string;
  introNote?: string;
  includeKiosk?: boolean;
  contentSession?: ContentSession;
  contentSessions?: ContentSession[];
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
  const prices = await Promise.all(
    Object.entries(tiers).map(([event, tier]) => standardPriceFor(event, tier))
  );
  const total = prices.reduce<number | null>((sum, price) => {
    const value = parsePrice(price);
    if (value === null) return sum;
    return (sum ?? 0) + value;
  }, null);
  const listPrice = total === null ? null : formatPrice(total);

  const discounted = applyDiscount(listPrice, {
    percent: input.discountPercent,
    amount: input.discountAmount,
  });

  // A typed total is a negotiated bundle price and beats the arithmetic.
  const quoted = input.totalOverride?.trim() || discounted || listPrice;

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
