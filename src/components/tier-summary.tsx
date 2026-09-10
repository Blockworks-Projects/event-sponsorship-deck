// The sponsor's tier, rendered from the synced tier table rather than shown
// as a picture of the whole grid. An image can't be trimmed, and a proposal
// should show what THIS sponsor is buying — not four columns of which three
// are irrelevant.
import { Fragment } from 'react';
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
  indent,
}: {
  label: string;
  value: string;
  accent: string;
  /** Set on a row that belongs to the city named in the row above it. */
  indent?: boolean;
}) {
  // A tick on the source table just means "yes".
  const shown = value === '✔' ? 'Included' : value;
  const copy = benefitCopy(label);

  if (!copy) {
    return (
      <div className={`flex justify-between gap-6 py-2 ${indent ? 'pl-4' : ''}`}>
        <dt className="text-sm text-neutral-700">{label}</dt>
        <dd className="text-sm font-semibold text-neutral-900">{shown}</dd>
      </div>
    );
  }

  return (
    <details className="benefit group py-1">
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-6 py-1.5 ${
          indent ? 'pl-4' : ''
        }`}
      >
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

  // A discount line the rep set in the checkout, in money — shown as its own
  // line above the total, with the subtotal it came off. The money is what's
  // stored because a percentage can't be read back off an already-discounted
  // figure. It stands whether the deal is a tier, several cities or à la
  // carte, none of which has a list price to strike through.
  const explicitOff =
    proposal.discount_amount && proposal.discount_amount > 0 ? proposal.discount_amount : null;
  // "(15%)" beside the line, when it was struck as a percentage. A flat sum
  // needs no label — the figure next to it says it.
  const percentLabel = proposal.discount_percent ? `${proposal.discount_percent}%` : null;

  // Priced per event: show each city's own line and its own reduction, since
  // "Asia discounted, London at full price" is invisible in a single total.
  const lines = proposal.price_lines ?? [];
  const perEvent = lines.length > 1;
  /** What the one city on a single-city deal is actually charged, as against
   *  its tier's standard price. Needed only alongside a discount line, where
   *  the subtotal above the discount has to be the figure the rows add up to. */
  const singleNet = parsePrice(lines[0]?.net ?? null);

  // À la carte: one row per item bought, at the price the rep quoted. There
  // is no list price to strike through — nothing was discounted, the items
  // simply cost what they cost.
  const menu = proposal.a_la_carte ?? [];
  /** The à la carte cities, in the order the quote lists them — chronological,
   *  as the builder writes the lines. Each gets its own block below. */
  const menuEvents = [...new Set(menu.map((item) => item.event))];
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
          {menu.length > 0 ? (
            <>
              {/* One block per city: its package price, then what that package
                  carries. Grouped by city rather than by kind of line — read
                  the other way round, a two-city deal lists every package,
                  then every inclusion, then every session, and neither city's
                  figures add up to anything the sponsor can follow.

                  Rows stay direct children of the <dl> so the dividers still
                  fall between rows; the group reads as a group because its
                  city heading carries the price and its items are indented
                  under it, which also spares them repeating the city name. */}
              {menuEvents.map((eventKey, groupIndex) => {
                const forEvent = menu.filter((item) => item.event === eventKey);
                const pkg = forEvent.find((item) => item.key === 'ala-package');
                const inclusions = forEvent.filter(
                  (item) => item.key !== 'ala-package' && item.qty == null && !item.price
                );
                const passes = forEvent.filter((item) => item.qty != null);
                const addOns = forEvent.filter(
                  (item) => item.key !== 'ala-package' && item.qty == null && item.price
                );
                // Air above every group but the first, so the cities separate
                // at a glance without a heading row of their own.
                const head = groupIndex > 0 ? 'pt-7' : '';
                const city = EVENT_LABEL[eventKey] ?? eventKey;

                return (
                  <Fragment key={eventKey}>
                    {/* The city's own heading, and the bundle price it heads.
                        A city priced entirely through its items carries no
                        package line, so the heading stands on its own. */}
                    <div className={`flex justify-between gap-6 py-3 ${head}`}>
                      <dt className="text-sm font-semibold text-neutral-900">
                        {pkg ? `${city} · ${pkg.label}` : city}
                      </dt>
                      <dd className="text-sm font-semibold text-neutral-900">
                        {pkg?.price ? formatPrice(parsePrice(pkg.price) ?? 0) : ''}
                      </dd>
                    </div>

                    {/* What the bundle includes — the same expandable rows the
                        tier list uses, so each carries its explanation. Only
                        the benefits the rep added on: they carry no price. */}
                    {inclusions.map((item) => (
                      <BenefitRow
                        key={`${item.event}|${item.key}`}
                        label={item.label}
                        value="Included"
                        accent={accent}
                        indent
                      />
                    ))}

                    {/* Passes: charged by the count, or bundled into the
                        package price, in which case the line carries none — as
                        does a proposal quoted before passes were charged. */}
                    {passes.map((item) => {
                      const count = `${item.qty} ${item.qty === 1 ? 'pass' : 'passes'}`;
                      if (!item.price) {
                        return (
                          <BenefitRow
                            key={`${item.event}|${item.key}`}
                            label={item.label}
                            value={count}
                            accent={accent}
                            indent
                          />
                        );
                      }
                      return (
                        <div
                          key={`${item.event}|${item.key}`}
                          className="flex justify-between gap-6 py-3 pl-4"
                        >
                          <dt className="text-sm text-neutral-700">
                            {item.label}
                            <span className="ml-2 text-neutral-500">{count}</span>
                          </dt>
                          <dd className="text-sm font-semibold text-neutral-900">
                            {formatPrice(parsePrice(item.price) ?? 0)}
                          </dd>
                        </div>
                      );
                    })}

                    {/* Priced add-ons — activations and speaking, each adding on. */}
                    {addOns.map((item) => (
                      <div
                        key={`${item.event}|${item.key}`}
                        className="flex justify-between gap-6 py-3 pl-4"
                      >
                        <dt className="text-sm text-neutral-700">{item.label}</dt>
                        <dd className="text-sm font-semibold text-neutral-900">
                          {formatPrice(parsePrice(item.price) ?? 0)}
                        </dd>
                      </div>
                    ))}
                  </Fragment>
                );
              })}
            </>
          ) : perEvent
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
                  <dt className="text-sm text-neutral-700">
                    {proposal.tier} sponsorship
                    {/* Under a discount line the row has to show what the
                        package is charged at, or the subtotal below it won't
                        add up — the standard price is struck through instead. */}
                    {explicitOff !== null && singleNet !== null && singleNet < list && (
                      <span className="ml-2 text-neutral-500 line-through">
                        {formatPrice(list)}
                      </span>
                    )}
                  </dt>
                  <dd className="text-sm font-semibold text-neutral-900">
                    {formatPrice(
                      explicitOff !== null && singleNet !== null ? singleNet : list
                    )}
                  </dd>
                </div>
              )}
          {explicitOff !== null && (
            <>
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-sm text-neutral-700">Subtotal</dt>
                <dd className="text-sm font-semibold text-neutral-900">
                  {formatPrice(final + explicitOff)}
                </dd>
              </div>
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-sm text-neutral-700">
                  Discount{percentLabel ? ` (${percentLabel})` : ''}
                </dt>
                <dd className="text-sm font-semibold" style={{ color: accent }}>
                  &minus;{formatPrice(explicitOff)}
                </dd>
              </div>
            </>
          )}
          {/* Older proposals carry no discount line of their own: a quote that
              came in under the tier standard is shown as the reduction. */}
          {explicitOff === null && !perEvent && menu.length === 0 && saving !== null && (
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
