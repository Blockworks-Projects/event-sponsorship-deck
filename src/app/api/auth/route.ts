// POST /api/auth  { email }  → emails a sign-in link
// GET  /api/auth?token=...   → verifies it and sets the session cookie
//
// No passwords and no accounts table: a Blockworks address, a link in the
// inbox, and a signed cookie afterwards.
import { NextRequest, NextResponse } from 'next/server';
import {
  BUILDER_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  createSignInToken,
  isAllowedEmail,
  readSignInToken,
} from '@/lib/builder-auth';

function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  const address = (email ?? '').trim().toLowerCase();

  if (!isAllowedEmail(address)) {
    return NextResponse.json(
      { error: 'Use your Blockworks email address.' },
      { status: 400 }
    );
  }

  // The team password: same session as the emailed link, just without the
  // round trip through an inbox. The Blockworks-domain check above still
  // applies, so the password alone is not enough.
  if (password) {
    const expected = process.env.BUILDER_PASSWORD;
    if (!expected) {
      return NextResponse.json(
        { error: 'Password sign-in is not configured (BUILDER_PASSWORD).' },
        { status: 500 }
      );
    }
    if (password !== expected) {
      return NextResponse.json({ error: 'That password is not right.' }, { status: 401 });
    }

    const response = NextResponse.json({ signedIn: true });
    response.cookies.set(BUILDER_COOKIE_NAME, createSessionToken(address), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  }

  const link = `${baseUrl(req)}/api/auth?token=${encodeURIComponent(createSignInToken(address))}`;

  // Sent through the Sponsor Deck Builder Apps Script, which sends as the
  // events@blockworks.co Gmail alias — the same route the other DAS portals
  // use, rather than adding a third-party sender.
  const scriptUrl = process.env.SYNC_SOURCE_URL;
  const token = process.env.SYNC_TOKEN;
  if (!scriptUrl || !token) {
    return NextResponse.json(
      { error: 'Email sending is not configured (SYNC_SOURCE_URL / SYNC_TOKEN).' },
      { status: 500 }
    );
  }

  const res = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({
      action: 'sendMail',
      token,
      payload: {
        to: address,
        subject: 'Your sign-in link — DAS proposal builder',
        text: `Sign in here: ${link}\n\nThe link works for 30 minutes.`,
        html: `
          <div style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1A1A18">
            <p>Here&rsquo;s your link to the DAS proposal builder.</p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#3D63FF;color:#fff;padding:12px 20px;text-decoration:none;font-weight:600">Sign in</a>
            </p>
            <p style="color:#5E5E5E">It works for the next 30 minutes. If you didn&rsquo;t ask for it, ignore this.</p>
          </div>`,
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    return NextResponse.json(
      { error: body.error ?? `Could not send the email (${res.status}).` },
      { status: 502 }
    );
  }

  return NextResponse.json({ sent: true });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const email = readSignInToken(token);

  if (!email) {
    const url = new URL('/builder/login', req.url);
    url.searchParams.set('error', 'That link has expired. Ask for a new one.');
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL('/builder', req.url));
  response.cookies.set(BUILDER_COOKIE_NAME, createSessionToken(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(BUILDER_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
