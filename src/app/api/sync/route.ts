// POST /api/sync — pulls the current catalog from the Sponsor Deck
// Builder's Apps Script sync endpoint and upserts it into
// sponsorship_modules, re-hosting each card's images to Supabase Storage
// (Slides image URLs expire ~30 min, so they're only usable at sync time).
//
// Google Slides stays the single source of truth: Marketing edits the deck,
// this pulls those edits across. Nobody edits content in Supabase.
//
// Runs three ways:
//   - Vercel Cron on a schedule (see vercel.json), authenticated with CRON_SECRET
//   - The "Sync now" button in /builder (authenticated by the builder cookie)
//   - Manually with a CRON_SECRET bearer token
//
// Env vars needed:
//   SYNC_SOURCE_URL    the deployed Sponsor Deck Builder /exec URL
//   SYNC_TOKEN         must match the SYNC_TOKEN set via setSyncToken_() in
//                       that Apps Script project (Code.gs)
//   CRON_SECRET        shared secret for scheduled/manual invocation
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import type { SyncRow } from '@/lib/types';

// The sync downloads every slide image from Google and re-uploads it to
// storage — the whole module catalog plus every page of both decks. That runs
// well past Vercel's short default budget, and a timed-out function returns an
// HTML error page, which the "Sync now" button then fails to parse as JSON
// ("Unexpected token '<'"). Give it the Pro plan's ceiling; the cron and the
// button both hit this route. (The PDF route is capped the same way, in
// vercel.json.)
export const maxDuration = 300;

const IMAGE_BUCKET = 'sponsorship-images';

// Syncing rewrites the whole module catalog, so it must not be publicly
// triggerable: allow either a signed-in builder session or the cron secret.
function isAuthorized(req: NextRequest): boolean {
  const cookie = req.cookies.get(BUILDER_COOKIE_NAME)?.value;
  if (readSessionToken(cookie ?? '')) return true;

  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  return !!secret && auth === `Bearer ${secret}`;
}

/** Vercel Cron invokes scheduled jobs with GET, so both verbs run the
 * same sync. */
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
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

  const syncUrl = `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}action=sync&token=${encodeURIComponent(token)}`;
  const res = await fetch(syncUrl);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Sync source returned ${res.status}: ${await res.text()}` },
      { status: 502 }
    );
  }
  const body = (await res.json()) as { rows?: SyncRow[]; error?: string };
  if (body.error) {
    return NextResponse.json({ error: `Sync source error: ${body.error}` }, { status: 502 });
  }
  const rows = body.rows ?? [];

  await ensureImageBucket_();

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows) {
    try {
      const images = await rehostImages_(row.id, row.imageUrls ?? []);
      const { description, bullets } = normalizeCopy_(row);

      const { error } = await supabase.from('sponsorship_modules').upsert(
        {
          google_slide_id: row.id,
          title: row.label,
          subtitle: null,
          description: description || null,
          bullets,
          images,
          availability: row.availabilityMap ?? {},
          pricing: row.pricing ?? {},
          tier_rows: row.tierRows ?? [],
          tier: row.tier || null,
          region: row.region || null,
          category: row.category,
          display_order: row.sourceSlideIndex ?? 0,
          status: row.status || 'published',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'google_slide_id' }
      );

      if (error) throw error;
      results.push({ id: row.id, ok: true });
    } catch (err) {
      results.push({ id: row.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const pages = await syncDeckPages_(sourceUrl, token);

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    synced: results.length - failed.length,
    failed: failed.length,
    pages,
    errors: failed,
  });
}

/**
 * Re-hosts a rendered image of every slide in the content deck, for the
 * sponsor-facing browse view. Best-effort: a failure here shouldn't fail a
 * catalog sync that already succeeded.
 */
async function syncDeckPages_(sourceUrl: string, token: string): Promise<number> {
  // Both sponsorship decks. 'das' is the London/Asia master deck and the one
  // the script serves by default, so it is requested without a deck param.
  const decks = [
    { key: 'das', param: '' },
    { key: 'nyc', param: '&deck=nyc' },
  ];

  let total = 0;
  for (const deck of decks) {
    total += await syncOneDeck_(sourceUrl, token, deck.key, deck.param);
  }
  return total;
}

async function syncOneDeck_(
  sourceUrl: string,
  token: string,
  deckKey: string,
  param: string
): Promise<number> {
  try {
    const res = await fetch(
      `${sourceUrl}?action=deckPages&token=${encodeURIComponent(token)}${param}`
    );
    const body = await res.json();
    if (body.error || !Array.isArray(body.pages)) return 0;

    const rows: {
      deck_key: string;
      page_index: number;
      image_url: string;
      title: string | null;
      updated_at: string;
    }[] = [];
    for (const page of body.pages) {
      // Stored per deck, so New York's page 1 can't overwrite the master's.
      const [url] = await rehostImages_(`deck/${deckKey}/page-${page.index}`, [page.imageUrl]);
      if (url) {
        rows.push({
          deck_key: deckKey,
          page_index: page.index,
          image_url: url,
          // Title, when the Apps Script sends one, so the engagement heatmap
          // can name slides. Older script versions omit it — hence nullable.
          title: (page.title as string | undefined)?.trim() || null,
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (!rows.length) return 0;

    await supabase.from('deck_pages').upsert(rows, { onConflict: 'deck_key,page_index' });
    // Slides removed from that deck would otherwise linger as pages forever.
    await supabase
      .from('deck_pages')
      .delete()
      .eq('deck_key', deckKey)
      .gt('page_index', rows.length);
    return rows.length;
  } catch {
    return 0;
  }
}

// Most cards put their bullet lines in their own text box, which the indexer
// reads correctly. A slide that instead types them into the body box — each
// line led by an arrow glyph rather than set as its own paragraph — comes back
// as one run-on description with no bullets, and the tier chip gets read as
// the only bullet. That's an authoring slip on the individual slide, and the
// deck is where it should be fixed; this just means one mis-formatted slide
// degrades to a tidy card instead of a broken one. Healthy rows pass through
// untouched.

/** Arrow/dot used as a list marker: padded by space, not inline punctuation. */
const BULLET_MARKER = /\s*[\u2794\u2192\u279c\u25ba\u25b8\u00bb\u2022]\s+/;

/** Loose key for comparing two bits of copy — case and punctuation aside. */
function copyKey_(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The blurb, then any bullet lines trapped behind a marker inside it. */
function splitOnMarkers_(description: string): string[] {
  const markers = description.match(new RegExp(BULLET_MARKER, 'g')) ?? [];
  // A plain "→" reads as prose punctuation ("awareness → consideration") as
  // readily as a list marker, so on its own it isn't enough to split on. Every
  // other glyph above only ever appears as a bullet.
  if (markers.length === 1 && markers[0].includes('\u2192')) return [description];

  return description
    .split(BULLET_MARKER)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeCopy_(row: SyncRow): { description: string; bullets: string[] } {
  const parts = splitOnMarkers_((row.description ?? '').trim());

  // Whatever precedes the first marker is the blurb; the rest are bullets that
  // never made it out of it.
  const description = parts.shift() ?? '';

  // The tier and the title already head the card, so a bullet repeating either
  // is the indexer having grabbed the wrong text box.
  const echoes = new Set([row.tier ?? '', row.label ?? ''].map(copyKey_).filter(Boolean));

  const bullets: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...parts, ...(row.bullets ?? [])]) {
    // A bullet that carried its own marker across would render with two.
    const text = raw.replace(BULLET_MARKER, '').trim();
    const key = copyKey_(text);
    if (!key || echoes.has(key) || seen.has(key)) continue;
    seen.add(key);
    bullets.push(text);
  }

  return { description, bullets };
}

async function ensureImageBucket_() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === IMAGE_BUCKET)) return;
  await supabase.storage.createBucket(IMAGE_BUCKET, { public: true });
}

/** Downloads each Slides image URL and re-uploads it to Supabase Storage,
 * returning the permanent public URLs. Best-effort per image — one failed
 * image doesn't fail the whole card. */
async function rehostImages_(moduleId: string, urls: string[]): Promise<string[]> {
  const uploaded: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const imgRes = await fetch(urls[i]);
      if (!imgRes.ok) continue;
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : 'jpg';
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const path = `${moduleId}/${i}.${ext}`;

      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (error) continue;

      const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
      uploaded.push(data.publicUrl);
    } catch {
      // skip this image, keep the rest
    }
  }
  return uploaded;
}
