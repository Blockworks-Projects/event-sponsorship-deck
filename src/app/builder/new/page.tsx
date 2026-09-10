// The first step of making a proposal: which event set is it for?
// 2026 is Asia and London, 2027 is New York, and the third card is for a deal
// that spans the two years — a sponsor buying London and New York together.
// Splitting here keeps the common single-year cases to the cities they sell.
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NewProposalChooser() {
  return (
    <div className="bx-wrap bx-page" style={{ maxWidth: 1120 }}>
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
        <Link href="/builder/new/multi" className="bx-year multi">
          <span className="glow" />
          <div className="yr">DAS 2026 + 2027</div>
          <h3>Multiple cities</h3>
        </Link>
      </div>
    </div>
  );
}
