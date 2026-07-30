// The tier block for a proposal covering more than one event: one grid with a
// column per city, so a sponsor sees what each buys them side by side rather
// than reading two separate tables and comparing.
import { benefitCopy } from '@/lib/benefits';
import { hidesKioskRow } from '@/lib/kiosk';
import type { Proposal, SponsorshipModule } from '@/lib/types';

/** Cells that mean "this tier doesn't get it" on the source table. */
const NOT_INCLUDED = /^[–—-]$/;

const EVENT_LABEL: Record<string, string> = {
  london: 'London',
  asia: 'Asia',
  nyc: 'New York',
};

// Chronological, so the columns read in the order the events happen rather
// than however the stored object's keys came out.
const EVENT_ORDER = ['asia', 'london', 'nyc'];

// Same treatment the activation groups use, so a city looks the same
// wherever it appears on the page.
const EVENT_ACCENT: Record<string, string> = {
  asia: 'var(--das-asia)',
  london: 'var(--das-london)',
  nyc: 'var(--das-new-york)',
};

interface Column {
  event: string;
  label: string;
  tier: string;
  table?: SponsorshipModule;
  /** À la carte column: its rows are the items bought, not tier benefits. */
  items?: string[];
}

export function TierGrid({
  proposal,
  tierTables,
  accent,
}: {
  proposal: Proposal;
  tierTables: SponsorshipModule[];
  accent: string;
}) {
  const tiers = proposal.tiers ?? {};
  const menu = proposal.a_la_carte ?? [];

  const columns: Column[] = Object.entries(tiers)
    .sort(([a], [b]) => EVENT_ORDER.indexOf(a) - EVENT_ORDER.indexOf(b))
    .map(([event, tier]) => ({
      event,
      label: EVENT_LABEL[event] ?? event,
      tier,
      table: tierTables.find((t) => (t.region || '').toLowerCase() === event.toLowerCase()),
    }));

  // A city sold item by item still belongs in the comparison: it has no tier,
  // so its column lists what was actually bought.
  if (menu.length) {
    const event = menu[0].event;
    columns.push({
      event,
      label: EVENT_LABEL[event] ?? event,
      tier: 'À la carte',
      items: menu.map((item) => item.label),
    });
    columns.sort((a, b) => EVENT_ORDER.indexOf(a.event) - EVENT_ORDER.indexOf(b.event));
  }

  if (columns.length < 2) return null;

  // Every benefit named by any of the events, in the order that event's table
  // lists them — so a row present at one city and not the other still shows,
  // with a blank against the city that doesn't include it.
  const labels: string[] = [];
  columns.forEach((column) => {
    // An à la carte column contributes its items as rows; a tier column
    // contributes its benefits.
    for (const label of column.items ?? []) {
      if (!labels.includes(label)) labels.push(label);
    }
    (column.table?.tier_rows ?? []).forEach((row) => {
      if (hidesKioskRow(proposal.include_kiosk, row.label)) return;
      if (!labels.includes(row.label)) labels.push(row.label);
    });
  });

  // The rep's Add-on tweaks, keyed by event: drop what they removed from a
  // city's column, add on what they added even where the chart says "—".
  const overrides = proposal.included_overrides ?? {};

  const valueFor = (column: Column, label: string) => {
    const ov = overrides[column.event];
    if (ov?.removed?.includes(label)) return null;
    if (column.items) return column.items.includes(label) ? 'Included' : null;
    const row = (column.table?.tier_rows ?? []).find((r) => r.label === label);
    const raw = row?.values[column.tier.toLowerCase()]?.trim();
    if (!raw || NOT_INCLUDED.test(raw)) {
      return ov?.added?.includes(label) ? 'Included' : null;
    }
    return raw === '✔' ? 'Included' : raw;
  };

  return (
    <section className="mx-auto max-w-6xl px-10 pb-8 pt-16">
      <h2 className="pdf-keep-with-next text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
        Your Tiers
      </h2>

      <div className="pdf-block mt-4 overflow-x-auto border border-neutral-200 bg-white">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="bg-neutral-100">
              <th className="px-6 py-5 text-sm font-semibold uppercase tracking-widest text-neutral-700">
                Sponsorship Tier
              </th>
              {columns.map((column) => (
                <th key={column.event} className="px-6 py-5">
                  <div
                    className="text-lg font-bold lowercase tracking-[0.35em]"
                    style={{ color: EVENT_ACCENT[column.event] }}
                  >
                    {column.event === 'nyc' ? 'new york' : column.event}
                  </div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    {column.tier}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => {
              const copy = benefitCopy(label);
              return (
                <tr key={label} className="border-t border-neutral-100 align-top">
                  <th scope="row" className="px-6 py-3 text-sm font-normal text-neutral-700">
                    {/* Expandable, the same as the single-event block: a
                        comparison table is long enough without every
                        explanation open at once. Native <details>, so it needs
                        no JavaScript and prints expanded. */}
                    {copy ? (
                      <details className="benefit group">
                        <summary className="flex cursor-pointer list-none items-center gap-2">
                          <span
                            className="inline-block transition-transform group-open:rotate-90"
                            style={{ color: accent }}
                            aria-hidden
                          >
                            ›
                          </span>
                          {label}
                        </summary>
                        <p className="mt-2 max-w-md pl-5 text-xs leading-relaxed text-neutral-500">
                          {copy}
                        </p>
                      </details>
                    ) : (
                      label
                    )}
                  </th>
                  {columns.map((column) => {
                    const value = valueFor(column, label);
                    return (
                      <td
                        key={column.event}
                        className={`px-6 py-3 text-sm ${
                          value ? 'font-semibold text-neutral-900' : 'text-neutral-300'
                        }`}
                      >
                        {value ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
