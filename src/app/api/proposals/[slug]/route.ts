// PATCH /api/proposals/[slug] — updates an existing proposal in place.
//
// The slug is deliberately left alone even if the company is renamed: a link
// already sent to a sponsor has to keep working, and its view history is
// keyed to this proposal.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { BUILDER_COOKIE_NAME, readSessionToken } from '@/lib/builder-auth';
import {
  proposalColumns,
  replaceModules,
  picksFrom,
  allowsNoModules,
  missingRequiredField,
  type ProposalInput,
} from '@/lib/proposal-write';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const input = (await req.json()) as ProposalInput;

  const picks = picksFrom(input);
  const missing = missingRequiredField(input);
  if (missing) {
    return NextResponse.json({ error: missing }, { status: 400 });
  }
  if (!picks.length && !allowsNoModules(input)) {
    return NextResponse.json(
      { error: 'At least one module is required, except on a Gold tier.' },
      { status: 400 }
    );
  }

  const { data: proposal, error } = await supabase
    .from('proposals')
    .update(await proposalColumns(input))
    .eq('slug', slug)
    .select()
    .single();

  if (error || !proposal) {
    return NextResponse.json(
      { error: error?.message ?? 'Proposal not found.' },
      { status: error ? 500 : 404 }
    );
  }

  const linkError = await replaceModules(proposal.id, picks);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ slug: proposal.slug, id: proposal.id });
}

// DELETE /api/proposals/[slug] — removes a proposal and its module links.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const { data: proposal, error: findError } = await supabase
    .from('proposals')
    .select('id')
    .eq('slug', slug)
    .single();

  if (findError || !proposal) {
    return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
  }

  // Clear the module links first so nothing is left pointing at a gone proposal.
  await supabase.from('proposal_modules').delete().eq('proposal_id', proposal.id);
  const { error } = await supabase.from('proposals').delete().eq('id', proposal.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
