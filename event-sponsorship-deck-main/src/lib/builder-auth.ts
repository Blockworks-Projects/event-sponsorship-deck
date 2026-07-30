// Sign-in for /builder: a Blockworks address, a link in the inbox, no password.
//
// The link carries a token that is a signed statement of "this address asked
// to sign in at this time". Nothing is stored server-side, so there's no
// tokens table to expire or clean up — the signature and the timestamp do
// that work. The same scheme signs the session cookie afterwards.
import { createHmac, timingSafeEqual } from 'crypto';

export const BUILDER_COOKIE_NAME = 'builder_session';

/** Only these domains may sign in. */
const ALLOWED_DOMAINS = ['blockworks.co', 'blockworks.com'];

const LINK_TTL_MS = 30 * 60 * 1000; // a sign-in link is good for 30 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // a session for 30 days

function secret(): string {
  const value = process.env.AUTH_SECRET;
  // Deliberately fatal rather than falling back to something weaker: an
  // unsigned or predictably-signed session is worse than no sign-in page.
  if (!value) throw new Error('AUTH_SECRET is not set.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/** Constant-time compare, so a wrong signature can't be found byte by byte. */
function signatureMatches(payload: string, signature: string): boolean {
  const expected = sign(payload);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function isAllowedEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  return !!domain && ALLOWED_DOMAINS.includes(domain);
}

/** A token of the form "<email>.<issuedAt>.<signature>". */
function mintToken(email: string, issuedAt: number): string {
  const payload = `${email.toLowerCase()}.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string, ttlMs: number): string | null {
  const parts = token.split('.');
  if (parts.length < 3) return null;

  const signature = parts.pop() as string;
  const issuedAt = Number(parts.pop());
  const email = parts.join('.');
  if (!email || !Number.isFinite(issuedAt)) return null;

  if (!signatureMatches(`${email}.${issuedAt}`, signature)) return null;
  if (Date.now() - issuedAt > ttlMs) return null;
  // Re-checked on the way in as well as the way out: the allowed list can
  // change while a link or session is still in the wild.
  if (!isAllowedEmail(email)) return null;

  return email;
}

export const createSignInToken = (email: string) => mintToken(email, Date.now());
export const readSignInToken = (token: string) => readToken(token, LINK_TTL_MS);

export const createSessionToken = (email: string) => mintToken(email, Date.now());
export const readSessionToken = (token: string) => readToken(token, SESSION_TTL_MS);
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
