/**
 * "Today, 4:12 PM" / "24 Jul, 4:12 PM".
 *
 * Twelve-hour, because that's how the team reads a time. The date drops the
 * year: a proposal sent this season is the only kind anyone checks views on,
 * and "24 Jul" is quicker to scan than "24/07/2026".
 *
 * Shared by the proposal page and the deck page so the two can't drift.
 */
export function formatWhen(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const today = new Date();
  const sameDay =
    at.getDate() === today.getDate() &&
    at.getMonth() === today.getMonth() &&
    at.getFullYear() === today.getFullYear();
  if (sameDay) return `Today, ${time}`;

  return `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}
