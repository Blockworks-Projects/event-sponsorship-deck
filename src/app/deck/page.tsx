// The deck moved from /deck to /sponsorships, which reads better in an email.
// Kept as a redirect for any link already shared.
import { permanentRedirect } from 'next/navigation';

export default function LegacyDeckRedirect() {
  permanentRedirect('/sponsorships');
}
