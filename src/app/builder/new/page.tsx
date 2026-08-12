// The first step of making a proposal: which year / event set is it for?
// 2026 is Asia & London (single city or both); 2027 is New York only. Splitting
// here is what keeps New York from ever being mixed with Asia/London.
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NewProposalChooser() {
  return (
    <div className="bx-wrap bx-page" style={{ maxWidth: 780 }}>
      <div className="bx-page-head">
        <div>
          <h1 className="bx-h1">New proposal</h1>
          <div className="bx-sub">Which event are you building for?</div>
        </div>
      </div>

      <div className="bx-years">
        <Link href="/builder/new/das" className="bx-year das">
          <span className="glow" />
          <div className="yr">DAS 2026</div>
          <h3>Asia &amp; London</h3>
        </Link>
        <Link href="/builder/new/nyc" className="bx-year ny">
          <span className="glow" />
          <div className="yr">DAS 2027</div>
          <h3>New York</h3>
        </Link>
      </div>
    </div>
  );
}
