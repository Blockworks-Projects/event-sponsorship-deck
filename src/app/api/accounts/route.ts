// GET /api/accounts — the sponsor list the company field picks from, so a rep
// picks a company that already exists rather than retyping its name and
// contact.
//
// Two sources, merged:
//   - Airtable's ACCOUNTS table, the source of truth for who the accounts
//     are. Nothing is written back to it.
//   - every company the team has already quoted, read off the proposals
//     themselves. A company typed by hand once is therefore offered the next
//     time, with the contact and logo it was given — no one has to add it to
//     Airtable first, and nothing new has to be stored to remember it.
//
// Plenty of records have no handler and no logo, so every field here is
// optional and the form leaves those blank for the rep to fill.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';

/** One row of the company picker. */
interface Account {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  logoUrl?: string;
}

const ACCOUNTS_TABLE = 'ACCOUNTS';

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

/**
 * Some accounts list two people ("Heather Sabel; Brittany Elise"), and both
 * should be able to open the proposal. Kept as a list and normalised to one
 * separator, since a proposal's contacts are stored the same way.
 */
function listOf(value: unknown): string | undefined {
  const parts = String(value ?? '')
    .split(/[;,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts.join('; ') : undefined;
}

function firstAttachmentUrl(value: unknown): string | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  return (value[0] as { url?: string })?.url;
}

/**
 * Companies already quoted, newest proposal first. One entry per company; a
 * blank on the newest proposal is filled from an older one, so a company
 * doesn't lose the contact it was given last time just because the most
 * recent quote for it was typed in a hurry.
 *
 * Their logos are already in our own Storage — unlike Airtable's attachment
 * URLs, which expire within hours — so these are good to use directly.
 */
async function remembered(): Promise<Account[]> {
  const { data } = await supabase
    .from('proposals')
    .select('slug, company, contact_name, contact_email, logo_url')
    .order('updated_at', { ascending: false });

  const byName = new Map<string, Account>();
  for (const row of data ?? []) {
    const name = String(row.company ?? '').trim();
    if (!name) continue;

    const key = name.toLowerCase();
    const held = byName.get(key);
    if (!held) {
      byName.set(key, {
        // Namespaced so it can't collide with an Airtable record id.
        id: `proposal:${row.slug}`,
        name,
        contactName: (row.contact_name as string | null) || undefined,
        contactEmail: (row.contact_email as string | null) || undefined,
        logoUrl: (row.logo_url as string | null) || undefined,
      });
      continue;
    }
    held.contactName = held.contactName || (row.contact_name as string | null) || undefined;
    held.contactEmail = held.contactEmail || (row.contact_email as string | null) || undefined;
    held.logoUrl = held.logoUrl || (row.logo_url as string | null) || undefined;
  }
  return [...byName.values()];
}

/**
 * Airtable's accounts, plus every company only the proposals know about.
 *
 * An account on both sides keeps its Airtable identity — that's the record a
 * rep recognises — but takes the contact or logo from a past proposal where
 * Airtable has none, which is the common case: the table lists the sponsor and
 * nobody has ever filled in a handler.
 */
function merge(airtable: Account[], past: Account[]): Account[] {
  const byName = new Map(airtable.map((account) => [account.name.toLowerCase(), account]));
  for (const account of past) {
    const held = byName.get(account.name.toLowerCase());
    if (!held) {
      byName.set(account.name.toLowerCase(), account);
      continue;
    }
    held.contactName = held.contactName || account.contactName;
    held.contactEmail = held.contactEmail || account.contactEmail;
    held.logoUrl = held.logoUrl || account.logoUrl;
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(req: NextRequest) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read first and separately: a company the team typed itself is remembered
  // whether or not Airtable answers, which is the whole point of remembering
  // it. A failure here is not fatal either — it just leaves the Airtable list.
  let past: Account[] = [];
  try {
    past = await remembered();
  } catch {
    // best-effort
  }

  const base = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;
  if (!base || !token) {
    return NextResponse.json({
      accounts: merge([], past),
      warning: 'AIRTABLE_BASE / AIRTABLE_TOKEN are not configured.',
    });
  }

  try {
    const records: AirtableRecord[] = [];
    let offset: string | undefined;
    // Airtable pages at 100; the account list is longer than that.
    do {
      const url = new URL(
        `https://api.airtable.com/v0/${base}/${encodeURIComponent(ACCOUNTS_TABLE)}`
      );
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `Airtable returned ${res.status}`);
      records.push(...(body.records ?? []));
      offset = body.offset;
    } while (offset);

    const airtable: Account[] = records
      .map((record) => ({
        id: record.id,
        name: String(record.fields['Sponsors'] ?? '').trim(),
        contactName: listOf(record.fields['Handler']),
        contactEmail: listOf(record.fields['Handler Email']),
        // Airtable attachment URLs expire within hours, so this is only good
        // for importing at the moment of selection — never for storing.
        logoUrl: firstAttachmentUrl(record.fields['Logos']),
      }))
      .filter((account) => account.name);

    return NextResponse.json({ accounts: merge(airtable, past) });
  } catch (err) {
    // Airtable is down or misconfigured. The companies we've quoted ourselves
    // are still worth offering, so this answers with those rather than
    // failing the picker outright.
    return NextResponse.json({
      accounts: merge([], past),
      warning: err instanceof Error ? err.message : String(err),
    });
  }
}
