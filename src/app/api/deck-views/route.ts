import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { deckType, proposalId, viewerName, viewerEmail, viewerCompany, sessionId } = body as {
    deckType: 'public' | 'proposal';
    proposalId?: string;
    viewerName?: string;
    viewerEmail: string;
    viewerCompany?: string;
    sessionId?: string;
  };

  if (!viewerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(viewerEmail)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('deck_views')
    .insert({
      deck_type: deckType,
      proposal_id: proposalId || null,
      viewer_name: viewerName || null,
      viewer_email: viewerEmail,
      viewer_company: viewerCompany || null,
      user_agent: req.headers.get('user-agent'),
      session_id: sessionId || null,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ viewId: data.id });
}
