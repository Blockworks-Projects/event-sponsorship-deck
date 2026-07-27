// /deck — the sponsorship deck on its own, behind the email gate.
//
// Public in the sense that anyone holding the link may open it, unlike a
// proposal which only opens for the address it was addressed to. Every unlock
// is still logged, which is the reason the link exists rather than sending
// the Drive file.
import { supabase } from '@/lib/supabase';
import { PublicDeckView } from '@/components/public-deck-view';

export const dynamic = 'force-dynamic';

export default async function PublicDeckPage() {
  const { data: pages } = await supabase
    .from('deck_pages')
    .select('page_index, image_url')
    .order('page_index', { ascending: true });

  return (
    <PublicDeckView
      pages={(pages ?? []).map((row) => row.image_url as string)}
      embedUrl={process.env.NEXT_PUBLIC_DECK_EMBED_URL}
    />
  );
}
