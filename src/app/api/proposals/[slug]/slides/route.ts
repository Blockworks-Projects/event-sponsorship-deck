// POST /api/proposals/[slug]/slides — generates a real Google Slides deck
// for this proposal, from the template deck in the Sponsor Deck Builder
// Apps Script project (see ProposalDeck.gs there).
//
// The web proposal page (/p/[slug]) and this Slides deck are two renderings
// of the same database content — the modules and their order come from
// proposal_modules either way, so they can't drift apart.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import type { SponsorshipModule } from '@/lib/types';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sourceUrl = process.env.SYNC_SOURCE_URL;
  const token = process.env.SYNC_TOKEN;
  if (!sourceUrl || !token) {
    return NextResponse.json(
      { error: 'SYNC_SOURCE_URL / SYNC_TOKEN are not configured.' },
      { status: 500 }
    );
  }

  const { slug } = await params;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
  }

  const { data: links } = await supabase
    .from('proposal_modules')
    .select('sort_order, sponsorship_modules(*)')
    .eq('proposal_id', proposal.id)
    .order('sort_order', { ascending: true });

  const modules = (links ?? [])
    .map((l) => l.sponsorship_modules)
    .filter(Boolean) as unknown as SponsorshipModule[];

  // Whether this tier includes a kiosk, read off the event's own tier table
  // rather than assumed from the event. London's tiers all include one and
  // Asia's table has no kiosk row, but that's the deck's call to make, not
  // something to hardcode here.
  const { data: tierTables } = await supabase
    .from('sponsorship_modules')
    .select('region, tier_rows')
    .eq('category', 'tier-table');

  const table = (tierTables ?? []).find(
    (m) => (m.region || '').toLowerCase() === (proposal.event || '').toLowerCase()
  );
  const kioskRow = ((table?.tier_rows ?? []) as { label: string; values: Record<string, string> }[])
    .find((row) => /kiosk/i.test(row.label));
  const kioskValue = kioskRow?.values[(proposal.tier || '').toLowerCase()]?.trim();
  const hasKiosk = !!kioskValue && !/^[–—-]$/.test(kioskValue);

  const res = await fetch(sourceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'buildDeck',
      token,
      payload: {
        sponsorName: proposal.company,
        totalPrice: proposal.total_price ?? '',
        contactName: proposal.contact_name ?? '',
        event: proposal.event ?? '',
        // Drives which cover and which tier table survive the build, and
        // what goes in their price cells. See TierSlides.gs.
        tier: proposal.tier ?? '',
        listPrice: proposal.list_price ?? '',
        discountedPrice: proposal.discounted_price ?? '',
        logoUrl: proposal.logo_url ?? '',
        repName: proposal.created_by_name ?? '',
        repEmail: proposal.created_by ?? '',
        hasKiosk,
        // Filled onto the content slide, or the slide is dropped. See TierSlides.gs.
        contentSession: proposal.content_session ?? null,
        modules: modules.map((m) => ({
          category: m.category,
          // Static slides are copied out of the content deck by id;
          // activation cards are rebuilt from the fields below.
          sourceSlideObjectId: m.google_slide_id.replace(/^core-/, ''),
          title: m.title,
          description: m.description,
          bullets: m.bullets,
          tier: m.tier,
          availability: m.availability,
          images: m.images,
        })),
      },
    }),
  });

  const body = await res.json();
  if (body.error) {
    return NextResponse.json({ error: `Deck build failed: ${body.error}` }, { status: 502 });
  }

  return NextResponse.json(body);
}
