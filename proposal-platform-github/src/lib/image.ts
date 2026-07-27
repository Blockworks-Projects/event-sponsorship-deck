/**
 * Slide images through Next's image optimizer.
 *
 * The originals are Slides thumbnails: 1600px-wide PNGs, some over half a
 * megabyte. Nothing displays them wider than the content column, and a PDF
 * that has to be emailed can't afford a dozen of them at full size. The
 * optimizer re-encodes to WebP at the width actually used, which shrinks the
 * PDF and lowers the memory the headless render has to hold at once.
 *
 * A plain <img> is used rather than next/image because these sit in a print
 * layout where the component's lazy-loading and layout boxes get in the way —
 * so the optimizer URL is built by hand.
 */
export function optimized(src: string, width = 1200): string {
  // Only our own Storage URLs are allowed through the optimizer; anything
  // else (a data: URI, a relative path) is returned untouched.
  if (!/^https?:\/\//.test(src)) return src;
  // Width must be one of Next's configured sizes and quality one of its
  // configured qualities, or the optimizer returns 400 and the image simply
  // doesn't render — which is how a "48% smaller" PDF turned out to be a PDF
  // with four images missing. 1200/640/384 are default deviceSizes and
  // imageSizes; 75 is the default quality.
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}
