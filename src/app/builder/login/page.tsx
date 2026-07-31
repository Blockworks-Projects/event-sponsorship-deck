'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

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
      <div className="bx-login">
        <div className="bx-login-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/blockworks-symbol.svg" alt="Blockworks" className="bx-mark" />
          <h1>Check your inbox</h1>
          <p className="tag">
            We&apos;ve sent a sign-in link to{' '}
            <strong style={{ color: 'var(--bx-text)' }}>{email}</strong>. It works for the
            next 30 minutes.
          </p>
          <button type="button" onClick={() => setSent(false)} className="bx-btn bx-btn-ghost">
            Use a different address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bx-login">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Enter in a field does the obvious thing rather than nothing.
          signIn(password ? 'password' : 'link');
        }}
        className="bx-login-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/blockworks-symbol.svg" alt="Blockworks" className="bx-mark" />
        <h1>Proposal Builder</h1>
        <p className="tag">Sign in with your Blockworks email.</p>

        <div className="bx-field">
          <label className="bx-flabel" htmlFor="email">Email</label>
          <input
            id="email"
            className="bx-input"
            type="email"
            autoFocus
            placeholder="you@blockworks.co"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="bx-field" style={{ marginBottom: 0 }}>
          <label className="bx-flabel" htmlFor="password">
            Password <span className="opt">· optional</span>
          </label>
          <input
            id="password"
            className="bx-input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="bx-err">{error}</p>}

        <div className="bx-login-btns">
          <button
            type="button"
            className="bx-btn bx-btn-primary"
            onClick={() => signIn('password')}
            disabled={loading}
          >
            Log in
          </button>
          <button
            type="button"
            className="bx-btn bx-btn-ghost"
            onClick={() => signIn('link')}
            disabled={loading}
          >
            Email me a link
          </button>
        </div>
      </form>
    </div>
  );
}
