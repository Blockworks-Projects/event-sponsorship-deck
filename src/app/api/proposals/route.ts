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
  return (
    company
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'proposal'
  );
}

/**
 * The sponsor's name, plain: /p/uniswap. A second proposal for the same
 * sponsor becomes /p/uniswap-2, a third /p/uniswap-3.
 *
 * The link is the thing a sponsor sees and a mail filter judges, so a clean
 * one is worth a query.
 *
 * Numbering is based on proposals that currently exist, so deleting one frees
 * its slug for the next proposal of the same name. That matters only if a
 * deleted proposal's link is still in someone's inbox: they'd land on the new
 * one rather than a 404. Storing retired slugs would prevent it, at the cost
 * of a table that exists solely to keep numbers climbing.
 */
async function uniqueSlug(company: string): Promise<string> {
  const base = slugify(company);

  const { data: taken } = await supabase
    .from('proposals')
    .select('slug')
    .or(`slug.eq.${base},slug.like.${base}-%`);

  const used = new Set((taken ?? []).map((row) => row.slug));
  if (!used.has(base)) return base;

  for (let n = 2; n < 500; n++) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  // Absurd in practice, but a slug collision would fail the insert, so fall
  // back to something that cannot collide rather than erroring.
  return `${base}-${Date.now().toString(36)}`;
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
    .insert({
      ...(await proposalColumns(input)),
      slug: await uniqueSlug(input.company),
      status: 'draft',
    })
    .select()
    .single();

  if (error || !proposal) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create proposal.' }, { status: 500 });
  }

  const linkError = await replaceModules(proposal.id, picks);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ slug: proposal.slug, id: proposal.id });
}
