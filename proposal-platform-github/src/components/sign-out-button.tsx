'use client';

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth', { method: 'DELETE' });
        window.location.href = '/builder/login';
      }}
      className="text-sm text-neutral-400 underline hover:text-neutral-200"
    >
      Sign out
    </button>
  );
}
