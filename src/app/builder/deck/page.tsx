// The sponsorship deck link and who has opened it.
//
// Separate from proposals on purpose: this is one link shared with many
// people, so it has one page of its own rather than a row in a list.
import { headers } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { DeckViews } from '@/components/deck-views';
import { ViewedAt } from '@/components/viewed-at';
import { CopyLink } from '@/components/copy-link';

export const dynamic = 'force-dynamic';

/** Same labels the sponsor sees on the buttons. */
const DECK_LABEL: Record<string, string> = {
  das: 'DAS 2026',
  nyc: 'DAS 2027',
};

export default async function DeckLinkPage() {
  const host = (await headers()).get('host') ?? '';
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  const url = `${origin}/sponsorships`;

  const { data: viewRows } = await supabase
    .from('deck_views')
    .select('id, viewer_email, started_at, deck_key, slide_dwell, duration_seconds')
    .eq('deck_type', 'public')
    .order('started_at', { ascending: false })
    .limit(200);

  const views = viewRows ?? [];
  const uniqueViewers = new Set(views.map((v) => v.viewer_email)).size;

  // Slide names for the per-viewer breakdown, drawn from two synced sources:
  //   1. The slide's own title text (deck_pages.title) — clean for section
  //      slides like "Executive Summary" or "Sponsorship Overview".
  //   2. The catalog title (sponsorship_modules.title) — names the activation
  //      slides that render as pure images and have no extractable text.
  // Both refresh on the same sync, so no manual list to maintain.
  const [{ data: pageRows }, { data: moduleRows }] = await Promise.all([
    supabase
      .from('deck_pages')
      .select('deck_key, page_index, title')
      .order('page_index', { ascending: true }),
    supabase
      .from('sponsorship_modules')
      .select('title, display_order, region')
      .eq('status', 'published'),
  ]);

  // slide position -> catalog title, per deck. NYC modules name the NYC deck;
  // London/Asia modules name the das deck. First title at a position wins.
  const catalogTitle: Record<string, Record<number, string>> = { das: {}, nyc: {} };
  for (const m of moduleRows ?? []) {
    const deck = m.region === 'nyc' ? 'nyc' : 'das';
    const idx = Number(m.display_order);
    if (Number.isFinite(idx) && m.title && !catalogTitle[deck][idx]) {
      catalogTitle[deck][idx] = m.title as string;
    }
  }

  // A slide title should be short and label-like. A grabbed sentence or
  // paragraph isn't a title, so it's rejected in favour of the catalog name.
  const cleanTitle = (t: string | null): string | null => {
    if (!t) return null;
    const s = t.trim();
    if (!s || s.length > 45 || /[.!?]$/.test(s)) return null;
    return s;
  };

  const slidesByDeck: Record<string, { index: number; title: string | null }[]> = {};
  for (const r of pageRows ?? []) {
    const name =
      cleanTitle(r.title as string | null) ??
      catalogTitle[r.deck_key]?.[r.page_index] ??
      null;
    (slidesByDeck[r.deck_key] ??= []).push({ index: r.page_index, title: name });
  }

  return (
    <div className="bx-wrap bx-page" style={{ maxWidth: 900 }}>
      <div className="bx-page-head">
        <div>
          <h1 className="bx-h1">Sponsorship deck</h1>
          <div className="bx-sub">One link, shareable with anyone. Every open is logged.</div>
        </div>
      </div>

      {views.length > 0 && (
        <div className="bx-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="bx-stat">
            <div className="k">Total views</div>
            <div className="v">{views.length}</div>
          </div>
          <div className="bx-stat">
            <div className="k">Unique viewers</div>
            <div className="v">{uniqueViewers}</div>
          </div>
          <div className="bx-stat accent">
            <div className="k">Last opened</div>
            <div className="v" style={{ fontSize: 18 }}>
              <ViewedAt iso={views[0].started_at} />
            </div>
          </div>
        </div>
      )}

      <div className="bx-linkcard">
        <div className="lkl">Shareable link</div>
        <CopyLink url={url} display={url} />
      </div>

      {views.length === 0 ? (
        <div className="bx-card" style={{ padding: 28 }}>
          <p className="bx-empty" style={{ padding: 0 }}>
            Not opened yet. Everyone who enters their email to read the deck lands here.
          </p>
        </div>
      ) : (
        <DeckViews views={views} deckLabels={DECK_LABEL} slidesByDeck={slidesByDeck} />
      )}
    </div>
  );
}
