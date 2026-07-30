// POST /api/logo — uploads a sponsor logo and returns its public URL.
//
// It has to be publicly readable: the Apps Script build fetches this URL to
// place the logo on the generated deck's cover, and Apps Script can't present
// this app's credentials.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';

const LOGO_BUCKET = 'sponsor-logos';
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export async function POST(req: NextRequest) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type ${file.type}. Use PNG, JPG, SVG or WebP.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Logo must be under 4 MB.' }, { status: 400 });
  }

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === LOGO_BUCKET)) {
    await supabase.storage.createBucket(LOGO_BUCKET, { public: true });
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
  // Prefixed with a random id so re-uploading for the same company can't
  // overwrite a logo an already-sent proposal is still pointing at.
  const path = `${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
