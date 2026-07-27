import type { SponsorshipModule } from '@/lib/types';

// Availability is deliberately not shown: a sponsor receiving a proposal can
// take it that what they've been sent is available to them. On a both-events
// proposal each card instead names the city it was bought for, which is the
// actual choice the rep made rather than where the item happens to be sold.

/**
 * Non-activation items are whole slides from the deck, not content that was
 * broken into fields — so they're shown as a picture of the slide itself.
 * Rendering just their extracted text lost every bit of the design and read
 * as a bare heading.
 */
export function SlideImage({ module: m }: { module: SponsorshipModule }) {
  return (
    // No frame, and multiply blending so the slide's own off-white background
    // and corner gradients drop out against the page. The Slides API always
    // bakes a background into a thumbnail, so this is the only way to make one
    // read as content on the page rather than as a picture of a slide.
    // Capped well under the thumbnail's native 1600px. Displaying it at full
    // size is only 1x on a retina screen and reads soft; leaving headroom
    // means it renders around 1.3x and stays crisp.
    <div className="mx-auto max-w-[1240px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.images[0]} alt={m.title} className="block w-full mix-blend-multiply" />
    </div>
  );
}

export function ModuleCard({
  module: m,
  forEvent,
}: {
  module: SponsorshipModule;
  /** Which city this was picked for; only set on both-events proposals. */
  forEvent?: string | null;
}) {
  if (m.category !== 'activation' && m.images.length > 0) {
    return <SlideImage module={m} />;
  }



  return (
    // Cards in a row share the row's height so their frames line up top and
    // bottom. The one with more copy sets that height; the other gains
    // whitespace rather than being squeezed.
    <div className="flex h-full flex-col overflow-hidden border border-neutral-200 bg-white">
      {m.images.length > 0 && (
        <div className="flex h-48 shrink-0 gap-px bg-neutral-200">
          {m.images.slice(0, 2).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="h-full flex-1 object-cover" />
          ))}
        </div>
      )}

      <div className="flex-1 p-6">
        {m.tier && (
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{m.tier}</div>
        )}
        <h3 className="mt-1 text-xl font-bold text-neutral-900">{m.title}</h3>
        {m.description && <p className="mt-2 text-sm text-neutral-600">{m.description}</p>}

        {m.bullets.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">What&apos;s Included</div>
            <ul className="mt-2 space-y-1.5">
              {m.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-neutral-800">
                  <span className="text-neutral-400">→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {forEvent && (
          <div className="mt-4 border-t border-neutral-100 pt-3">
            <span className="bg-neutral-100 px-2.5 py-1 text-xs font-semibold capitalize text-neutral-700">
              {forEvent === 'nyc' ? 'New York' : forEvent}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
