// The sponsor's tier, rendered from the synced tier table rather than shown
// as a picture of the whole grid. An image can't be trimmed, and a proposal
// should show what THIS sponsor is buying — not four columns of which three
// are irrelevant.
import { hidesKioskRow } from '@/lib/kiosk';
import type { Proposal, SponsorshipModule } from '@/lib/types';
import { describeDiscount, parsePrice, formatPrice } from '@/lib/pricing';
import { benefitCopy } from '@/lib/benefits';

/**
 * One benefit. Where there's an explanation for it, the row expands to show
 * it — a native <details> rather than React state, so it needs no JavaScript
 * and stays keyboard-accessible. Print forces every one open (see globals
 * .css) so nothing is hidden in the PDF.
 */
function BenefitRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  // A tick on the source table just means "yes".
  const shown = value === '✔' ? 'Included' : value;
  const copy = benefitCopy(label);

  if (!copy) {
    return (
      <div className="flex justify-between gap-6 py-2">
        <dt className="text-sm text-neutral-700">{label}</dt>
        <dd className="text-sm font-semibold text-neutral-900">{shown}</dd>
      </div>
    );
  }

  return (
    <details className="benefit group py-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-1.5">
        <dt className="flex items-center gap-2 text-sm text-neutral-700">
          <span
            className="inline-block transition-transform group-open:rotate-90"
            style={{ color: accent }}
            aria-hidden
          >
            ›
          </span>
          {label}
        </dt>
        <dd className="text-sm font-semibold text-neutral-900">{shown}</dd>
      </summary>
      <p className="pb-3 pl-5 pr-6 pt-1 text-sm leading-relaxed text-neutral-600">{copy}</p>
    </details>
  );
}

/** Cells that mean "this tier doesn't get it" on the source table. */
const NOT_INCLUDED = /^[–—-]$/;

/**
 * What the sponsor's tier includes. Sits ABOVE the activations: the tier is
 * the package they're buying, the activations are what they picked within it,
 * so the tier reads first and the money is settled separately below.
 */
export function TierIncluded({
  proposal,
  tierTable,
  accent,
}: {
  proposal: Proposal;
  tierTable?: SponsorshipModule;
  accent: string;
}) {
  const tier = proposal.tier;
  if (!tier) return null;

  const key = tier.toLowerCase();
  // The rep's Add-on tweaks for this (single-event) deal: drop what they
  // removed, then append what they added on from elsewhere in the chart.
  const ov = proposal.included_overrides?.[proposal.event ?? ''] ?? { removed: [], added: [] };
  const removed = new Set(ov.removed ?? []);
  const base = (tierTable?.tier_rows ?? [])
    .filter((row) => !hidesKioskRow(proposal.include_kiosk, row.label))
    .map((row) => ({ label: row.label, value: row.values[key] }))
    .filter((row) => row.value && !NOT_INCLUDED.test(row.value.trim()))
    .filter((row) => !removed.has(row.label));
  const added = (ov.added ?? [])
    .filter((label) => !base.some((row) => row.label === label))
    // Added-on benefits carry no quantity of their own, so they read as a plain
    // "Included" rather than borrowing a number from another tier's column.
    .map((label) => ({ label, value: 'Included' as string | undefined }));
  const included = [...base, ...added];

  return (
    <section className="mx-auto max-w-6xl px-10 pb-8 pt-16">
      <h2 className="pdf-keep-with-next text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
        Your Tier
      </h2>
      <div className="pdf-block mt-4 overflow-hidden border border-neutral-200 bg-white">
        <div className="px-8 py-7 text-white" style={{ backgroundColor: accent }}>
          <div className="text-2xl font-bold">{tier}</div>
        </div>

        {included.length > 0 && (
          <div className="bg-white px-8 py-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              What&apos;s Included
            </div>
            <dl className="mt-3 divide-y divide-neutral-100">
              {included.map((row) => (
                <BenefitRow key={row.label} label={row.label} value={row.value!} accent={accent} />
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The money, on its own, after everything it pays for. Shows the standard
 * price and what came off it rather than only the final figure, so a
 * negotiated discount is visible rather than buried.
 */
export function PriceBreakdown({
  proposal,
  accent,
}: {
  proposal: Proposal;
  accent: string;
}) {
  const list = parsePrice(proposal.list_price);
  // total_price is the fallback because an à la carte proposal has no list
  // price and nothing discounted — the total is simply the sum of the items.
  const final =
    parsePrice(proposal.discounted_price) ?? parsePrice(proposal.total_price) ?? list;
  if (final === null) return null;

  const saving = list !== null && final !== null && list > final ? list - final : null;
  const discountLabel = describeDiscount({
    percent: proposal.discount_percent,
    amount: proposal.discount_amount,
  });

  // Priced per event: show each city's own line and its own reduction, since
  // "Asia discounted, London at full price" is invisible in a single total.
  const lines = proposal.price_lines ?? [];
  const perEvent = lines.length > 1;

  // À la carte: one row per item bought, at the price the rep quoted. There
  // is no list price to strike through — nothing was discounted, the items
  // simply cost what they cost.
  const menu = proposal.a_la_carte ?? [];
  const EVENT_LABEL: Record<string, string> = {
    london: 'London',
    asia: 'Asia',
    nyc: 'New York',
  };

  return (
    <section className="mx-auto max-w-6xl px-10 py-16">
      <h2 className="pdf-keep-with-next text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
        Investment
      </h2>
      <div className="pdf-block mt-4 border border-neutral-200 bg-white px-8 py-6">
        <dl className="divide-y divide-neutral-100">
          {/* A tier city and an à la carte city can appear on the same
              proposal, so the tier lines come first and the items after —
              otherwise the total looks like it came from nowhere. */}
          {menu.length > 0 &&
            lines.map((line) => (
              <div key={line.event} className="flex justify-between gap-6 py-3">
                <dt className="text-sm text-neutral-700">
                  {EVENT_LABEL[line.event] ?? line.event} · {line.tier}
                  {line.discount && <span className="ml-2 text-neutral-500 line-through">{line.list}</span>}
                </dt>
                <dd className="text-sm font-semibold text-neutral-900">{line.net}</dd>
              </div>
            ))}
          {menu.length > 0
            ? menu.map((item) => (
                <div key={`${item.event}|${item.key}`} className="flex justify-between gap-6 py-3">
                  <dt className="text-sm text-neutral-700">
                    {EVENT_LABEL[item.event] ?? item.event} · {item.label}
                  </dt>
                  <dd className="text-sm font-semibold text-neutral-900">
                    {item.price ? formatPrice(parsePrice(item.price) ?? 0) : '—'}
                  </dd>
                </div>
              ))
            : perEvent
            ? lines.map((line) => (
                <div key={line.event} className="flex justify-between gap-6 py-3">
                  <dt className="text-sm text-neutral-700">
                    {EVENT_LABEL[line.event] ?? line.event} · {line.tier}
                    {line.discount && (
                      <span className="ml-2 text-neutral-500 line-through">
                        {line.list}
                      </span>
                    )}
                  </dt>
                  <dd className="text-sm font-semibold text-neutral-900">{line.net}</dd>
                </div>
              ))
            : list !== null && (
                <div className="flex justify-between gap-6 py-3">
                  <dt className="text-sm text-neutral-700">{proposal.tier} sponsorship</dt>
                  <dd className="text-sm font-semibold text-neutral-900">{formatPrice(list)}</dd>
                </div>
              )}
          {!perEvent && menu.length === 0 && saving !== null && (
            <div className="flex justify-between gap-6 py-3">
              <dt className="text-sm text-neutral-700">
                Discount{discountLabel ? ` (${discountLabel.replace(/ off$/, '')})` : ''}
              </dt>
              <dd className="text-sm font-semibold" style={{ color: accent }}>
                &minus;{formatPrice(saving)}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-6 pt-4">
            <dt className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Total
            </dt>
            <dd className="text-3xl font-bold">{formatPrice(final)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
