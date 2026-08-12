// POST /api/logo/import  { url }  → re-hosts that image and returns a
// permanent public URL.
//
// Exists because Airtable attachment URLs expire within hours. Storing one on
// a proposal would produce a logo that works in the builder and is broken by
// the time the sponsor opens the link.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';

const LOGO_BUCKET = 'sponsor-logos';
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { url } = (await req.json()) as { url?: string };
  // Only Airtable's own attachment host: this endpoint fetches whatever it is
  // given and republishes it, which is not something to leave open.
  if (!url || !/^https:\/\/[^/]*airtable(usercontent)?\.com\//.test(url)) {
    return NextResponse.json({ error: 'Expected an Airtable attachment URL.' }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetching the logo returned ${res.status}.`);

    const type = res.headers.get('content-type') ?? 'image/png';
    if (!type.startsWith('image/')) throw new Error(`That attachment is ${type}, not an image.`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error('That logo is over 8 MB.');

    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === LOGO_BUCKET)) {
      await supabase.storage.createBucket(LOGO_BUCKET, { public: true });
    }

    const ext = type.split('/')[1]?.split('+')[0] || 'png';
    // A random name, as with uploads: re-importing for the same sponsor can't
    // overwrite a logo an already-sent proposal still points at.
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
