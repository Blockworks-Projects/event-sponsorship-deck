'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * A small ✕ on a proposal row that deletes it. Confirms first, since a deleted
 * proposal (and its view history) can't be brought back.
 */
export function DeleteProposalButton({ slug, company }: { slug: string; company: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    // The row is a link — don't navigate when the ✕ is clicked.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm(`Delete the proposal for ${company}? This can't be undone.`)) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${slug}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Delete failed.');
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      aria-label={`Delete proposal for ${company}`}
      title="Delete proposal"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        color: 'var(--bx-faint, #8a8f98)',
        background: 'transparent',
        lineHeight: 1,
        cursor: busy ? 'default' : 'pointer',
      }}
    >
      ✕
    </button>
  );
}
