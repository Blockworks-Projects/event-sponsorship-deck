'use client';

import { useState } from 'react';

/**
 * The sponsor-facing link, with a button that copies it.
 *
 * Displayed short and copied in full. New proposals get a clean slug from the
 * sponsor's name (/p/uniswap), so for those the two are the same string; the
 * shortening only hides the random suffix on proposals made before that
 * change.
 *
 * Deliberately NOT a masked hyperlink whose visible text differs from its
 * destination: that mismatch is one of the signals mail filters score against,
 * and blocked links are already a problem here.
 */
export function CopyLink({ url, display }: { url: string; display: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the link is on screen to copy by hand.
      setCopied(false);
    }
  }

  return (
    <div className="bx-coderow">
      <a href={url} target="_blank" rel="noopener noreferrer" className="bx-code" title={url}>
        {display}
      </a>
      <button onClick={copy} className="bx-btn bx-btn-ghost">
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
    </div>
  );
}
