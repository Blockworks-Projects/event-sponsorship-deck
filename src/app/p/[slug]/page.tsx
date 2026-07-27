// Proposals used to live at /p/<slug> and now live at /<slug>, so the link
// reads as blockworks.com/uniswap rather than blockworks.com/p/uniswap.
//
// This redirect stays for any link already sent. A permanent redirect keeps
// the destination unambiguous for anything that follows links automatically —
// a mail scanner, for one.
import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LegacyProposalRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}
