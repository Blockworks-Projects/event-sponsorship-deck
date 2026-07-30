// The builder (internal, sales-facing) UI is dark. shadcn/ui reads its
// theme tokens from a `.dark` ancestor, so without this wrapper its
// components render light-mode colors (dark text) on our dark surfaces and
// become invisible. Proposal pages (/p/[slug]) stay light by default.
import { BuilderNav } from '@/components/builder-nav';

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  // `text-foreground` is required here, not just `dark`: body sets its text
  // color from the light-mode token, and children inherit that unless this
  // wrapper re-resolves it inside the dark scope.
  return (
    <div className="dark min-h-screen bg-neutral-950 text-foreground">
      <BuilderNav />
      {children}
    </div>
  );
}
