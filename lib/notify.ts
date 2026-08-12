// Slack "someone opened it" notifications.
//
// Best-effort and non-blocking to the viewer: a notification never decides
// whether a view is logged or a deck opens. Throttled to the first open of a
// given target (a specific proposal, or the public deck) by a given viewer per
// day, so a sponsor flicking back and forth doesn't spam the channel.
//
// Needs SLACK_WEBHOOK_URL in the environment (an incoming-webhook URL for the
// channel you want the pings in). With it unset, this quietly does nothing, so
// the feature is off until configured.
import { supabase } from '@/lib/supabase';

const DECK_LABEL: Record<string, string> = { das: 'DAS 2026', nyc: 'DAS 2027' };

export async function notifyOpen(params: {
  address: string;
  deckType: 'public' | 'proposal';
  deckKey?: string | null;
  proposalId?: string | null;
}): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  // Throttle: notify only on the first open of this target by this viewer
  // today. The row for THIS open is already written, so a count of 1 means
  // it's the first; anything more means we've already pinged for it today.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  let query = supabase
    .from('deck_views')
    .select('id', { count: 'exact', head: true })
    .eq('viewer_email', params.address)
    .gte('started_at', startOfDay.toISOString());
  query =
    params.deckType === 'proposal' && params.proposalId
      ? query.eq('proposal_id', params.proposalId)
      : query.eq('deck_type', 'public');

  const { count } = await query;
  if ((count ?? 0) > 1) return;

  // What they opened, and (for a proposal) who owns it.
  let what = 'the sponsorship deck';
  let footer = '';
  if (params.deckType === 'proposal' && params.proposalId) {
    const { data: p } = await supabase
      .from('proposals')
      .select('company, created_by_name, created_by')
      .eq('id', params.proposalId)
      .single();
    what = p?.company ? `the *${p.company}* proposal` : 'a proposal';
    const rep = p?.created_by_name || p?.created_by;
    if (rep) footer = `Rep: ${rep}`;
  } else {
    const label = params.deckKey ? (DECK_LABEL[params.deckKey] ?? params.deckKey) : null;
    what = label ? `the *${label}* sponsorship deck` : 'the sponsorship deck';
  }

  const text = `:eyes: *${params.address}* just opened ${what}${footer ? `\n${footer}` : ''}`;

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Slack being down must never surface to the viewer.
  }
}
