// Every proposal one address was sent.
//
// A sponsor is often quoted more than one way — London and New York as a
// pair, or the same cities at two tiers — and only ever gets one link. The
// welcome screen behind that link lists them as options, so read here rather
// than in the route: the gate needs them after checking an address, and the
// page needs them when a session already proved one.
import { supabase } from '@/lib/supabase';
import { isAddressedTo } from '@/lib/contacts';

/** One option on the welcome screen. Enough to name it, not enough to read
 *  it — opening it goes through the same check as any other visit. */
export interface SponsorProposalOption {
  slug: string;
  company: string;
  event: string | null;
  tier: string | null;
  tiers: Record<string, string> | null;
  aLaCarteLabels: Record<string, string> | null;
}

/**
 * The proposals this address may open, oldest first — so "Option 1" is the
 * first one quoted and stays Option 1 when a later one is edited.
 *
 * Addresses live several to a text field, so the query only narrows the rows
 * (a substring match would catch 'aa@x.com' looking for 'a@x.com') and
 * isAddressedTo does the exact check.
 */
export async function proposalsFor(address: string): Promise<SponsorProposalOption[]> {
  const wanted = address.trim().toLowerCase();
  if (!wanted) return [];

  const { data } = await supabase
    .from('proposals')
    .select('slug, company, event, tier, tiers, a_la_carte_labels, contact_email, created_at')
    .ilike('contact_email', `%${wanted}%`)
    .order('created_at', { ascending: true });

  return (data ?? [])
    .filter((row) => isAddressedTo(row.contact_email as string | null, wanted))
    .map((row) => ({
      slug: row.slug as string,
      company: row.company as string,
      event: (row.event as string | null) ?? null,
      tier: (row.tier as string | null) ?? null,
      tiers: (row.tiers as Record<string, string> | null) ?? null,
      aLaCarteLabels: (row.a_la_carte_labels as Record<string, string> | null) ?? null,
    }));
}
