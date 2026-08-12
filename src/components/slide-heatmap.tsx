// The per-slide dwell heatmap: how long, on average, each slide of a deck held
// the screen across every measured view. Server component — the numbers are
// already aggregated by the page that renders it.

export type HeatSlide = { index: number; title: string | null; avgSeconds: number };

function fmtSeconds(s: number): string {
  if (s >= 60) return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
  return `${Math.round(s)}s`;
}

export function SlideHeatmap({
  label,
  views,
  slides,
}: {
  label: string;
  /** How many views these averages are drawn from. */
  views: number;
  slides: HeatSlide[];
}) {
  const max = Math.max(1, ...slides.map((s) => s.avgSeconds));

  return (
    <div className="bx-card" style={{ marginBottom: 24 }}>
      <div className="bx-views-head" style={{ padding: '16px 18px 4px', marginBottom: 0 }}>
        <h3>
          Slide engagement · {label}{' '}
          <span style={{ color: 'var(--bx-faint)', fontWeight: 400 }}>
            · avg over {views} view{views === 1 ? '' : 's'}
          </span>
        </h3>
        <div className="bx-heat-legend">
          <span><span className="d cool" /> skimmed</span>
          <span><span className="d warm" /> read</span>
          <span><span className="d hot" /> lingered</span>
        </div>
      </div>
      <div style={{ padding: '8px 10px 14px' }}>
        {slides.map((s) => {
          const ratio = s.avgSeconds / max;
          const tier = ratio >= 0.66 ? 'hot' : ratio >= 0.33 ? 'warm' : 'cool';
          return (
            <div key={s.index} className="bx-heat-row">
              <span className="n">{s.index}</span>
              <span className={`name${tier === 'hot' ? ' hot' : ''}`}>
                {s.title || `Slide ${s.index}`}
              </span>
              <span className="bx-heat-track">
                <span
                  className={`bx-heat-fill ${tier}`}
                  style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
                />
              </span>
              <span className={`t${tier === 'hot' ? ' hot' : ''}`}>{fmtSeconds(s.avgSeconds)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
