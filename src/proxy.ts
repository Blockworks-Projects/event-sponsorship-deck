import { NextRequest, NextResponse } from 'next/server';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/builder/login') return NextResponse.next();

  // readSessionToken returns the signed-in address, or null if the cookie is
  // missing, tampered with, expired, or no longer on an allowed domain.
  const cookie = req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '';
  if (readSessionToken(cookie)) return NextResponse.next();

  const loginUrl = new URL('/builder/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/builder/:path*'],
};
