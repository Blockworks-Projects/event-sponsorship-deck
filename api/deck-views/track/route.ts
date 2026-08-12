import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Receives per-slide dwell + focused time for a view, sent by the deck viewer
// (a heartbeat while reading, and a sendBeacon on close). Keyed by the viewId
// that opening the deck returned — no auth: it can only append engagement to a
// view that already exists, nothing sensitive.
export async function POST(req: NextRequest) {
  let body: {
    viewId?: string;
    slideDwell?: Record<string, number>;
    durationSeconds?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }

  const { viewId, slideDwell, durationSeconds } = body;
  if (!viewId) {
    return NextResponse.json({ error: 'viewId is required.' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (slideDwell && typeof slideDwell === 'object') update.slide_dwell = slideDwell;
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)) {
    update.duration_seconds = Math.max(0, Math.round(durationSeconds));
  }
  if (!Object.keys(update).length) return NextResponse.json({ ok: true });

  const { error } = await supabase.from('deck_views').update(update).eq('id', viewId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
