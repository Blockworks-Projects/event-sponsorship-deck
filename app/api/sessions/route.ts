// GET /api/sessions?event=london — agenda sessions from Airtable, so a rep
// can pull a real session and its speakers into a proposal rather than
// retyping them.
//
// Airtable stays the source of truth for the agenda; nothing is written back.
import { NextRequest, NextResponse } from 'next/server';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';

const AGENDA_TABLE: Record<string, string> = {
  london: 'DAS London Agenda',
  asia: 'DAS Asia Agenda',
};
const SPEAKER_TABLE = 'Speaker Inventory';

// A session links its people across six separate columns rather than one.
const SPEAKER_LINK_FIELDS = ['Mod', 'Speaker 2', 'Speaker 3', 'Speaker 4', 'Speaker 5'];

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function airtable(path: string, params: Record<string, string> = {}) {
  const base = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;
  if (!base || !token) throw new Error('AIRTABLE_BASE / AIRTABLE_TOKEN are not configured.');

  const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(path)}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Airtable returned ${res.status}`);
  return body as { records: AirtableRecord[]; offset?: string };
}

/** Every record in a table, following Airtable's pagination. */
async function allRecords(table: string): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const page = await airtable(table, offset ? { pageSize: '100', offset } : { pageSize: '100' });
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}

function firstAttachmentUrl(value: unknown): string | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const first = value[0] as { url?: string };
  return first?.url;
}

export async function GET(req: NextRequest) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = (req.nextUrl.searchParams.get('event') || '').toLowerCase();
  // 'main' or 'track' — which stage the sponsor's tier entitles them to.
  // Omitted means don't filter.
  const stage = (req.nextUrl.searchParams.get('stage') || '').toLowerCase();
  const table = AGENDA_TABLE[event];
  if (!table) {
    // New York's agenda isn't published yet — return an empty list (not an
    // error) so the content step still works; the builder shows a pending note.
    if (event === 'nyc') {
      return NextResponse.json({ sessions: [] });
    }
    return NextResponse.json(
      { error: `No agenda for "${event}". Use london or asia.` },
      { status: 400 }
    );
  }

  try {
    const agenda = await allRecords(table);

    // Only sessions with a title and at least one person are worth offering.
    const sessions = agenda.filter((r) => {
      const title = String(r.fields['Panel Title'] ?? '').trim();
      if (!title || /^open\b/i.test(title)) return false;
      return SPEAKER_LINK_FIELDS.some((f) => (r.fields[f] as string[] | undefined)?.length);
    });

    // Speaker details live in their own table, so resolve the linked ids in
    // one pass rather than per session.
    const speakers = new Map<
      string,
      { name: string; jobTitle: string; company: string; photo?: string }
    >();
    const needed = new Set(
      sessions.flatMap((r) =>
        SPEAKER_LINK_FIELDS.flatMap((f) => (r.fields[f] as string[] | undefined) ?? [])
      )
    );

    if (needed.size) {
      for (const record of await allRecords(SPEAKER_TABLE)) {
        if (!needed.has(record.id)) continue;
        const f = record.fields;
        speakers.set(record.id, {
          name: String(f['Name'] ?? '').trim(),
          jobTitle: String(f['Job Title'] ?? '').trim(),
          company: String(f['Company'] ?? '').trim(),
          photo: firstAttachmentUrl(f['Headshot']),
        });
      }
    }

    const onStage = (record: AirtableRecord) => {
      if (stage !== 'main' && stage !== 'track') return true;
      const track = String(record.fields['Track'] ?? '');
      const isMain = /main stage/i.test(track);
      return stage === 'main' ? isMain : !!track && !isMain;
    };

    return NextResponse.json({
      sessions: sessions.filter(onStage).map((r) => ({
        id: r.id,
        title: String(r.fields['Panel Title'] ?? '').split('\n')[0].trim(),
        day: r.fields['Day'] ?? null,
        track: r.fields['Track'] ?? null,
        speakers: SPEAKER_LINK_FIELDS.flatMap((f) =>
          ((r.fields[f] as string[] | undefined) ?? [])
            .map((id) => speakers.get(id))
            .filter((s): s is NonNullable<typeof s> => !!s?.name)
        ),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
