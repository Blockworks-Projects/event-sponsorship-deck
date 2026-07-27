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

function slugify(company: string): string {
  const base = company
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'proposal'}-${suffix}`;
}

export async function POST(req: NextRequest) {
  // Checked before the body is even read: creating a proposal is a write, and
  // the page it produces is public to whoever holds the link. PATCH on
  // /api/proposals/[slug] has always done this; POST had not.
  if (!readSessionToken(req.cookies.get(BUILDER_COOKIE_NAME)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    .insert({ ...(await proposalColumns(input)), slug: slugify(input.company), status: 'draft' })
    .select()
    .single();

  if (error || !proposal) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create proposal.' }, { status: 500 });
  }

  const linkError = await replaceModules(proposal.id, picks);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ slug: proposal.slug, id: proposal.id });
}
