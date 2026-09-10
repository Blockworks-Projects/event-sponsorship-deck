// A sponsor's own session: an address that has already opened one proposal
// doesn't have to type it again for the others it was sent.
//
// A sponsor is often sent several proposals — one per city, or a revision — and
// each used to mean its own link and its own trip through the gate. The gate
// itself is unchanged: a proposal opens for the address it was addressed to.
// This only remembers that the address was given, so the welcome screen can
// list the rest and open them without asking again.
//
// Same HMAC scheme as the builder's sign-in (lib/builder-auth), deliberately
// NOT the same tokens: the payload is prefixed, so neither side can read the
// other's cookie. A builder session opens the internal tool; this opens
// nothing a sponsor couldn't already open by typing their own address.
import { createHmac, timingSafeEqual } from 'crypto';

export const SPONSOR_COOKIE_NAME = 'sponsor_session';

/** A week — long enough to review a proposal and come back to it, short enough
 *  that a borrowed laptop doesn't stay open on it indefinitely. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SPONSOR_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

/** Namespaced so a sponsor token and a builder token can never validate
 *  against each other, whatever they happen to contain. */
const SCOPE = 'sponsor';

function sign(payload: string): string {
  const value = process.env.AUTH_SECRET;
  // Fatal rather than falling back to something weaker. Callers that must not
  // fail because of it (the gate) catch instead.
  if (!value) throw new Error('AUTH_SECRET is not set.');
  return createHmac('sha256', value).update(`${SCOPE}.${payload}`).digest('hex');
}

/** Constant-time compare, so a wrong signature can't be found byte by byte. */
function signatureMatches(payload: string, signature: string): boolean {
  const expected = sign(payload);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** A token of the form "<email>.<issuedAt>.<signature>". */
export function createSponsorToken(email: string): string {
  const payload = `${email.trim().toLowerCase()}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** The address this cookie proves was given at a gate, or null — expired,
 *  tampered with, absent, or no signing secret configured. */
export function readSponsorToken(token: string): string | null {
  try {
    const parts = (token || '').split('.');
    if (parts.length < 3) return null;

    const signature = parts.pop() as string;
    const issuedAt = Number(parts.pop());
    const email = parts.join('.');
    if (!email || !Number.isFinite(issuedAt)) return null;

    if (!signatureMatches(`${email}.${issuedAt}`, signature)) return null;
    if (Date.now() - issuedAt > SESSION_TTL_MS) return null;

    return email;
  } catch {
    // A missing AUTH_SECRET means no session, not a broken page.
    return null;
  }
}
