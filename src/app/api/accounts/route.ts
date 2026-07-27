// GET /api/accounts — the sponsor list from Airtable, so a rep picks a
// company that already exists rather than retyping its name and contact.
//
// Airtable stays the source of truth for who the accounts are; nothing is
// written back. Plenty of records have no handler and no logo, so every field
// here is optional and the form leaves those blank for the rep to fill.
import { NextRequest, NextResponse } from 'next/server';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';

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

export async function GET(req: NextRequest) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;
  if (!base || !token) {
    return NextResponse.json(
      { error: 'AIRTABLE_BASE / AIRTABLE_TOKEN are not configured.' },
      { status: 500 }
    );
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

    const accounts = records
      .map((record) => ({
        id: record.id,
        name: String(record.fields['Sponsors'] ?? '').trim(),
        contactName: listOf(record.fields['Handler']),
        contactEmail: listOf(record.fields['Handler Email']),
        // Airtable attachment URLs expire within hours, so this is only good
        // for importing at the moment of selection — never for storing.
        logoUrl: firstAttachmentUrl(record.fields['Logos']),
      }))
      .filter((account) => account.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
