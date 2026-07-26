// GET /api/proposals/[slug]/pdf — renders the same proposal page (with the
// email gate skipped via ?print=1) to a PDF using headless Chrome. The PDF
// is never a separate template — it's a screenshot of the real page, so it
// can never drift from what a viewer sees on the web.
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/** Wide enough for the max-w-6xl content column, at A4's 1:1.414 ratio. */
const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Dev-only: the usual install locations for a real Chrome, by platform. */
function localChromePath(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return fromEnv;
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
  const targetUrl = `${baseUrl}/p/${slug}?print=1`;

  // @sparticuz/chromium ships a Linux x64 binary, which is what Vercel runs
  // on but not what a Mac dev machine can spawn (it fails with ENOEXEC).
  // Locally, fall back to whatever Chrome is already installed so the PDF
  // path is testable off-Vercel too.
  const onVercel = !!process.env.VERCEL;
  const browser = await puppeteer.launch(
    onVercel
      ? { args: chromium.args, executablePath: await chromium.executablePath(), headless: true }
      : { executablePath: localChromePath(), headless: true }
  );

  try {
    const page = await browser.newPage();
    // A4 portrait is only ~794px wide, which squeezes a layout built for
    // 1152px into near-mobile proportions: the stats row wraps and the hero
    // shapes, anchored either side of the content column, fall off the page.
    // So the page is sized to the design instead, keeping A4's 1:1.414 ratio.
    await page.setViewport({ width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 2 });
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });
    // Webfonts can still be swapping when the network goes quiet.
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${slug}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
