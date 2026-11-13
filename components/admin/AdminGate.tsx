'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppBar } from '@/components/ui/AppBar';
import { Icon } from '@/components/ui/Icon';
import { AdminPortal } from './AdminPortal';

type Session = { status: 'loading' } | { status: 'out' } | { status: 'in'; usingDefaults: boolean };

const inputCls =
  'mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200';

/**
 * Admin sign-in. The credentials are checked on the server (app/api/admin/login) and the session lives in
 * an HttpOnly, signed cookie, so page scripts can never read or forge it. The portal below only renders
 * once the server confirms the session.
 */
export function AdminGate() {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session', { cache: 'no-store' });
      const data = (await res.json()) as { authenticated: boolean; usingDefaults: boolean };
      setSession(data.authenticated ? { status: 'in', usingDefaults: data.usingDefaults } : { status: 'out' });
    } catch {
      setSession({ status: 'out' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'Could not sign in.');
        return;
      }
      setPassword('');
      await refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      setSession({ status: 'out' });
    }
  };

  if (session.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm font-medium text-neutral-500">
        Checking session…
      </div>
    );
  }

  if (session.status === 'in') {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar section="Admin">
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200"
          >
            <Icon name="logout" className="h-4 w-4" />
            Sign out
          </button>
        </AppBar>
        <AdminPortal usingDefaults={session.usingDefaults} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar section="Admin" />
      <div className="mx-auto w-full max-w-sm px-4 pt-12">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-white">
          <Icon name="shield" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-[28px] font-bold leading-tight text-neutral-900">Admin sign in</h1>
        <p className="mt-1 text-neutral-600">Approve businesses, moderate tips and manage plans.</p>

        <form onSubmit={login} className="mt-6 space-y-4 rounded-3xl bg-white p-5 ring-1 ring-neutral-200">
          <label className="block">
            <span className="text-sm font-medium text-neutral-800">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-neutral-800">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={inputCls}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || username.trim() === '' || password === ''}
            className="w-full rounded-full bg-neutral-900 py-3.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs leading-relaxed text-neutral-400">
          Demo default: username <b>Admin</b>, password <b>Admin</b>. Change them with the ADMIN_USERNAME and
          ADMIN_PASSWORD environment variables.
        </p>
      </div>
    </div>
  );
}
