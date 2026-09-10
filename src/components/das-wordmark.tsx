import { EVENT_LOWER, isMultiEvent } from '@/lib/events';

// The event lockup at the top of a proposal, matching the speaker portal.
//
// Only London exists as a proper wordmark asset — the Asia file in the portal
// is the dual-event picker banner, not a standalone mark, and there's no NYC
// artwork at all. So everything except London falls back to a text lockup
// using the same treatment the deck itself uses: the city set lowercase and
// widely letter-spaced in the event's accent.

const WORDMARK_ASSET: Record<string, string> = {
  london: '/brand/das-london-wordmark.svg',
  nyc: '/brand/das-nyc-wordmark.png',
};

export function DasWordmark({ event, accent }: { event: string | null; accent: string }) {
  const key = (event || '').toLowerCase();
  // A proposal spanning more than one city names none of them in the lockup —
  // the cities are stated on their own cards below it instead.
  const asset = isMultiEvent(event) ? undefined : WORDMARK_ASSET[key];

  if (asset) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={asset} alt={`Digital Asset Summit ${EVENT_LOWER[key]}`}
        className="mx-auto block h-auto w-[min(560px,88%)]" />
    );
  }

  // Built to mirror the London artwork's structure — "Digital Asset" over
  // "Summit 2026" with the year in a lighter weight, then the city set
  // lowercase and widely letter-spaced in the event accent.
  return (
    <div className="text-center leading-[0.95]">
      <div className="text-6xl font-bold tracking-[-0.02em] sm:text-7xl">Digital Asset</div>
      <div className="text-6xl tracking-[-0.02em] sm:text-7xl">
        <span className="font-bold">Summit</span>
        <span className="ml-2 font-light">2026</span>
      </div>
      {EVENT_LOWER[key] && (
        <div
          className="mt-4 text-3xl font-medium lowercase tracking-[0.42em] sm:text-4xl"
          style={{ color: accent }}
        >
          {EVENT_LOWER[key]}
        </div>
      )}
    </div>
  );
}
