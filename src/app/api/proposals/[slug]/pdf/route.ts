// GET /api/proposals/[slug]/pdf — renders the same proposal page (with the
// email gate skipped via ?print=1) to a PDF using headless Chrome. The PDF
// is never a separate template — it's a screenshot of the real page, so it
// can never drift from what a viewer sees on the web.
import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/** Wide enough for the max-w-6xl content column, at A4's 1:1.414 ratio. */
const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Dev-only: the usual install locations for a real Chrome, by platform. */
function localChromePath(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return fromEnv;
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome';
}

async function launch(keepSingleProcess: boolean): Promise<Browser> {
  // @sparticuz/chromium ships "--single-process", which runs the renderer
  // inside the browser process. On this runtime that makes any teardown take
  // the navigating frame with it, which surfaces as "Navigating frame was
  // detached" on every render — reproducibly on Vercel, never on a Mac,
  // because a local Chrome is not launched with the flag. The package keeps
  // it to dodge a `prctl(PR_SET_NO_NEW_PRIVS)` error, but --no-sandbox and
  // --no-zygote (both also set) already cover that here.
  const args = keepSingleProcess
    ? chromium.args
    : chromium.args.filter((flag) => flag !== '--single-process');

  // The binary it ships is Linux x64, which is what Vercel runs but not what
  // a Mac can spawn (ENOEXEC). Locally, use whatever Chrome is installed so
  // this path stays testable off-Vercel.
  return process.env.VERCEL
    ? puppeteer.launch({
        args,
        executablePath: await chromium.executablePath(),
        headless: true,
      })
    : puppeteer.launch({ executablePath: localChromePath(), headless: true });
}

/** One render attempt, browser included, so a retry starts genuinely clean. */
async function render(targetUrl: string, keepSingleProcess: boolean): Promise<Uint8Array> {
  const browser = await launch(keepSingleProcess);
  try {
    const page = await browser.newPage();
    // A4 portrait is only ~794px wide, which squeezes a layout built for
    // 1152px into near-mobile proportions: the stats row wraps and the hero
    // shapes, anchored either side of the content column, fall off the page.
    // So the page is sized to the design instead, keeping A4's 1:1.414 ratio.
    // deviceScaleFactor 2 doubles the raster surface in each direction, so a
    // three-page proposal is a ~2480x10500 bitmap plus every decoded image —
    // enough to hit net::ERR_INSUFFICIENT_RESOURCES in a serverless container.
    // 1 is plenty: PDF text stays vector either way, and the slide images are
    // already wider than the column they sit in.
    await page.setViewport({
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      deviceScaleFactor: process.env.VERCEL ? 1 : 2,
    });

    // Deliberately NOT networkidle0. This page hydrates and fetches after
    // load, so "no connections for 500ms" raced with React's own requests and
    // intermittently threw "Navigating frame was detached". Waiting for load
    // and then explicitly for the things that actually affect the render is
    // both faster and stable.
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 45_000 });

    await page.evaluate(async () => {
      // Every image decoded — a half-loaded slide or kiosk render would
      // otherwise print as a blank box.
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? Promise.resolve() : img.decode().catch(() => undefined)
        )
      );
      // Webfonts can still be swapping after images are in.
      await document.fonts.ready;
    });

    return await page.pdf({
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
      timeout: 45_000,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
  const targetUrl = `${baseUrl}/p/${slug}?print=1`;

  // Chrome in a serverless container is genuinely flaky — it dies on cold
  // starts and under memory pressure in ways that succeed on a second run.
  // One retry turns most of those into a slow success rather than an error
  // page in front of a sponsor.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Second pass restores --single-process, so if dropping it ever stops
      // Chrome starting at all on some future runtime, the retry recovers
      // instead of repeating the same failure.
      const pdf = await render(targetUrl, attempt === 1);
      return new NextResponse(Buffer.from(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${slug}.pdf"`,
        },
      });
    } catch (err) {
      lastError = err;
    }
  }

  return NextResponse.json(
    {
      error: `Could not render the PDF: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    },
    { status: 500 }
  );
}
