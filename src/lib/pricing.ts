// Tier prices come out of the content deck as display strings ("$175K"), not
// numbers, because that's how they're written on the slide. Discounting needs
// real arithmetic, so they're parsed here and formatted back out in full
// ("$148,750") — a discounted figure like "$148.75K" reads as a typo.

/** "$175K" → 175000, "$1.5M" → 1500000, "$85,000" → 85000. null if unparseable. */
export function parsePrice(display: string | null | undefined): number | null {
  if (!display) return null;
  const match = String(display).replace(/,/g, '').match(/\$?\s*([\d.]+)\s*([KkMm])?/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'k') return amount * 1_000;
  if (suffix === 'm') return amount * 1_000_000;
  return amount;
}

/** 148750 → "$148,750". */
export function formatPrice(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/** A discount is expressed either way round: 15% off, or $15,000 off. */
export interface Discount {
  percent?: number | null;
  amount?: number | null;
}

/**
 * The discounted figure for `listPrice`, or null when there's no discount or
 * the list price couldn't be read. Never returns less than zero — a discount
 * larger than the price is a typo, not a refund.
 */
export function applyDiscount(
  listPrice: string | null | undefined,
  discount: Discount
): string | null {
  const list = parsePrice(listPrice);
  if (list === null) return null;

  if (discount.percent) return formatPrice(Math.max(0, list * (1 - discount.percent / 100)));
  if (discount.amount) return formatPrice(Math.max(0, list - discount.amount));
  return null;
}

/** How the discount reads on the proposal, e.g. "15% off" or "$15,000 off". */
export function describeDiscount(discount: Discount): string | null {
  if (discount.percent) return `${discount.percent}% off`;
  if (discount.amount) return `${formatPrice(discount.amount)} off`;
  return null;
}
