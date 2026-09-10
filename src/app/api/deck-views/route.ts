import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { emailList, isAddressedTo } from '@/lib/contacts';
import { notifyOpen } from '@/lib/notify';
import {
  SPONSOR_COOKIE_NAME,
  SPONSOR_MAX_AGE_SECONDS,
  createSponsorToken,
} from '@/lib/sponsor-auth';
import { proposalsFor, type SponsorProposalOption } from '@/lib/sponsor-proposals';

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

  // Set by the check below: whether this open is a proposal whose address
  // checked out, which is what earns the viewer a session.
  let verifiedProposal = false;

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
    verifiedProposal = true;
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

  // Nothing below this point may fail the view: it is already logged.
  if (!verifiedProposal || !proposalId) {
    return NextResponse.json({ viewId: data.id });
  }

  // Every proposal this address may open, this one included: quoted more than
  // one way, the welcome screen offers them as options rather than sending a
  // link and a gate for each.
  let options: SponsorProposalOption[] = [];
  try {
    options = await proposalsFor(address);
  } catch {
    // The welcome screen falls back to this proposal alone.
  }

  const res = NextResponse.json({ viewId: data.id, options });

  // The session that saves typing the same address into every one of them. The
  // gate still decides what opens — this only remembers that it was passed.
  try {
    res.cookies.set({
      name: SPONSOR_COOKIE_NAME,
      value: createSponsorToken(address),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SPONSOR_MAX_AGE_SECONDS,
    });
  } catch {
    // No AUTH_SECRET configured: no session, and the gate works as it did.
  }

  return res;
}
