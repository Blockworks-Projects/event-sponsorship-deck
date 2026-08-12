import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { emailList, isAddressedTo } from '@/lib/contacts';
import { notifyOpen } from '@/lib/notify';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { deckType, proposalId, viewerName, viewerEmail, viewerCompany, sessionId, deckKey } =
    body as {
    deckType: 'public' | 'proposal';
    proposalId?: string;
    /** Which sponsorship deck was opened: 'das' or 'nyc'. */
    deckKey?: string;
    viewerName?: string;
    viewerEmail: string;
    viewerCompany?: string;
    sessionId?: string;
  };

  // Normalised once, up front: an address copied out of an email client
  // arrives with stray spaces and whatever capitalisation the sender used,
  // and neither should be the reason someone can't open their proposal.
  const address = (viewerEmail ?? '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  // A proposal opens only for the address the rep addressed it to. Checked
  // here rather than in the browser so the answer can't be edited out of the
  // page — the client only ever learns yes or no.
  if (deckType === 'proposal' && proposalId) {
    const { data: proposal } = await supabase
      .from('proposals')
      .select('contact_email')
      .eq('id', proposalId)
      .single();

    // A proposal can be addressed to several people; any of them may open it.
    const expected = emailList(proposal?.contact_email);
    // No contact address means nothing to check against, and letting it
    // through would make an unaddressed proposal the one anybody can open.
    // The builder now requires one, so this is only reachable for rows
    // created before that.
    if (!expected.length) {
      return NextResponse.json(
        { error: 'This proposal has no contact address set yet. Ask your Blockworks contact.' },
        { status: 403 }
      );
    }
    if (!isAddressedTo(proposal?.contact_email, address)) {
      return NextResponse.json(
        { error: "That address doesn't match the one this proposal was sent to." },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabase
    .from('deck_views')
    .insert({
      deck_type: deckType,
      proposal_id: proposalId || null,
      viewer_name: viewerName || null,
      viewer_email: address,
      deck_key: deckKey ?? null,
      viewer_company: viewerCompany || null,
      user_agent: req.headers.get('user-agent'),
      session_id: sessionId || null,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ping Slack on the first open of this target by this viewer today. Awaited
  // so it runs before the serverless function freezes, but wrapped so a
  // notification failure never turns a logged view into an error.
  try {
    await notifyOpen({ address, deckType, deckKey, proposalId });
  } catch {
    // best-effort
  }

  return NextResponse.json({ viewId: data.id });
}
