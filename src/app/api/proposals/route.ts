import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { proposalColumns, replaceModules, picksFrom, type ProposalInput } from '@/lib/proposal-write';

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
  const input = (await req.json()) as ProposalInput;

  const picks = picksFrom(input);
  if (!input.company || !picks.length) {
    return NextResponse.json(
      { error: 'company and at least one module are required.' },
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
