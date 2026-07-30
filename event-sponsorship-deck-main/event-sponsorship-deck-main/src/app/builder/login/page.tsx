'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function BuilderLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get('error'));
  const [loading, setLoading] = useState(false);

  /**
   * Two ways in, chosen by which button was pressed rather than by whether
   * the password box happens to be filled: a rep who types a password and
   * then decides to use the link shouldn't have to clear the field first.
   */
  async function signIn(mode: 'password' | 'link') {
    setLoading(true);
    setError(null);

    if (mode === 'password' && !password) {
      setLoading(false);
      return setError('Enter the team password, or use the magic link instead.');
    }

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'password' ? { email, password } : { email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong.');
      // A full navigation, not router.push: the session cookie was just set
      // on this response, and the proxy needs to see it on the next request.
      if (body.signedIn) {
        window.location.href = searchParams.get('next') || '/builder';
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-neutral-50">Check your inbox</h1>
          <p className="mt-2 text-sm text-neutral-400">
            We&apos;ve sent a sign-in link to <strong className="text-neutral-200">{email}</strong>.
            It works for the next 30 minutes.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-6 text-sm text-neutral-400 underline hover:text-neutral-200"
          >
            Use a different address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Enter in a field does the obvious thing rather than nothing.
          signIn(password ? 'password' : 'link');
        }}
        className="w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-neutral-50">Proposal Builder</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Sign in with your Blockworks email.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            placeholder="you@blockworks.co"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Optional"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => signIn('password')}
            disabled={loading}
            className="flex-1"
          >
            Log in
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => signIn('link')}
            disabled={loading}
            className="flex-1"
          >
            Magic link
          </Button>
        </div>
      </form>
    </div>
  );
}
