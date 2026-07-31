// The sponsorship deck link and who has opened it.
//
// Separate from proposals on purpose: this is one link shared with many
// people, so it has one page of its own rather than a row in a list.
import { headers } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { DeckViews } from '@/components/deck-views';
import { SlideHeatmap, type HeatSlide } from '@/components/slide-heatmap';
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
    .select('id, viewer_email, started_at, deck_key, slide_dwell')
    .eq('deck_type', 'public')
    .order('started_at', { ascending: false })
    .limit(200);

  const views = viewRows ?? [];
  const uniqueViewers = new Set(views.map((v) => v.viewer_email)).size;

  // Per-slide engagement: slide titles come from the hourly deck-pages sync,
  // dwell is aggregated per deck across every view that recorded it.
  const { data: pageRows } = await supabase
    .from('deck_pages')
    .select('deck_key, page_index, title')
    .order('page_index', { ascending: true });

  const pagesByDeck = new Map<string, { index: number; title: string | null }[]>();
  for (const r of pageRows ?? []) {
    const list = pagesByDeck.get(r.deck_key) ?? [];
    list.push({ index: r.page_index, title: (r.title as string | null) ?? null });
    pagesByDeck.set(r.deck_key, list);
  }

  const dwellByDeck = new Map<string, { totals: Record<number, number>; count: number }>();
  for (const v of views) {
    const dwell = v.slide_dwell as Record<string, number> | null;
    if (!dwell || !v.deck_key) continue;
    const agg = dwellByDeck.get(v.deck_key) ?? { totals: {}, count: 0 };
    agg.count += 1;
    for (const [k, ms] of Object.entries(dwell)) {
      const idx = Number(k);
      if (!Number.isFinite(idx)) continue;
      agg.totals[idx] = (agg.totals[idx] ?? 0) + (Number(ms) || 0);
    }
    dwellByDeck.set(v.deck_key, agg);
  }

  const heatmaps = [...pagesByDeck.entries()]
    .map(([deckKey, pages]) => {
      const agg = dwellByDeck.get(deckKey);
      if (!agg || agg.count === 0) return null;
      const slides: HeatSlide[] = pages.map((p) => ({
        index: p.index,
        title: p.title,
        avgSeconds: (agg.totals[p.index] ?? 0) / agg.count / 1000,
      }));
      return { deckKey, label: DECK_LABEL[deckKey] ?? deckKey, views: agg.count, slides };
    })
    .filter((h): h is { deckKey: string; label: string; views: number; slides: HeatSlide[] } => h !== null);

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
        <DeckViews views={views} deckLabels={DECK_LABEL} />
      )}

      {heatmaps.length > 0 && (
        <div style={{ marginTop: 30 }}>
          {heatmaps.map((h) => (
            <SlideHeatmap key={h.deckKey} label={h.label} views={h.views} slides={h.slides} />
          ))}
        </div>
      )}
    </div>
  );
}
