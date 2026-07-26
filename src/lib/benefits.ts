// Plain-English copy for each tier benefit, shown when a sponsor expands a row.
//
// The tier table's own labels are terse and written for a comparison grid
// ("Includes (1) Branding & Activation from Selected Tier"), which reads
// poorly on its own. These explain what the sponsor actually gets.
//
// Matched on a distinctive KEYWORD rather than the exact label, because the
// wording in the deck differs from the wording here and will keep drifting —
// "Sample Registration List (pre + post)" against "Sample Registration List
// (Pre & Post Event)", for one.

interface Benefit {
  match: RegExp;
  copy: string;
}

const BENEFITS: Benefit[] = [
  {
    match: /fireside|keynote/i,
    copy:
      'Position your brand as an industry leader with a featured main stage speaking ' +
      'opportunity, either through a keynote presentation or a moderated fireside chat ' +
      'with a leading voice in digital assets and institutional finance.',
  },
  {
    match: /brand(ing)?\s*&?\s*activation/i,
    copy:
      'Select one premium branding activation from your sponsorship tier to create a ' +
      'memorable onsite experience and maximize attendee engagement throughout the event.',
  },
  {
    match: /general admission/i,
    copy:
      'Complimentary General Admission passes for your team and guests, providing access ' +
      'to conference programming, networking events, and the attendee app.',
  },
  {
    match: /vip ticket/i,
    copy:
      'Complimentary VIP passes with exclusive access to premium networking opportunities, ' +
      'the VIP Lounge, speaker receptions, expedited registration, and additional VIP-only ' +
      'experiences.',
  },
  {
    match: /kiosk/i,
    copy:
      'Dedicated branded exhibit space for the full event, providing the opportunity to ' +
      'showcase your business, meet prospective clients, schedule meetings, and engage ' +
      'directly with attendees.',
  },
  {
    match: /registration list/i,
    copy:
      'Gain insight into the audience with a sample attendee list before and after the event ' +
      'to support outreach, meeting scheduling, and post-event follow-up.',
  },
  {
    match: /press release/i,
    copy:
      'Increase brand visibility through inclusion in the official event press release ' +
      'announcing sponsors and key event partners.',
  },
  {
    match: /social media/i,
    copy:
      "Receive featured recognition across Blockworks and Digital Asset Summit social " +
      "channels as part of your sponsorship tier, extending your brand's reach beyond the " +
      'conference audience.',
  },
  {
    match: /logo/i,
    copy:
      'Your logo will be prominently featured across event signage, the conference website, ' +
      'and the attendee app, ensuring consistent brand visibility before, during, and after ' +
      'the event.',
  },
];

/** The explanation for a tier-table row label, or null if there isn't one. */
export function benefitCopy(label: string): string | null {
  return BENEFITS.find((b) => b.match.test(label))?.copy ?? null;
}
