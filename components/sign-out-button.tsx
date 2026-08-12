'use client';

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth', { method: 'DELETE' });
        window.location.href = '/builder/login';
      }}
      className="bx-btn bx-btn-ghost"
    >
      Sign out
    </button>
  );
}
