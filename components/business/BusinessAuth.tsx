'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import { passwordProblem, validateEmail } from '@/lib/auth';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/data/seed';
import { DEFAULT_CENTER, getBrowserLocation, jitter } from '@/lib/geo';
import { CATEGORIES, type Category } from '@/types/localhints';
import { AppBar } from '@/components/ui/AppBar';

type Mode = 'signup' | 'signin';

const EMOJIS = ['☕', '🥐', '🍕', '🌮', '🍜', '📚', '🌸', '💪', '🧺', '🎬', '✂️', '🛠️'];
const inputCls =
  'mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200';

/** Business owner sign-up and sign-in. Shown on /business until an account is signed in. */
export function BusinessAuth() {
  const { signUp, signIn, notify } = useStore();
  const [mode, setMode] = useState<Mode>('signup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared account fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign-up only
  const [ownerName, setOwnerName] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('food');
  const [emoji, setEmoji] = useState('🍕');
  const [address, setAddress] = useState('');
  const [blurb, setBlurb] = useState('');
  const [coords, setCoords] = useState(() => jitter(DEFAULT_CENTER, 0.5));
  const [coordsLabel, setCoordsLabel] = useState('Placed in the demo district');

  const pwProblem = password.length > 0 ? passwordProblem(password) : null;

  const useMyLocation = async () => {
    try {
      const pos = await getBrowserLocation();
      setCoords(pos);
      setCoordsLabel('Using your current location');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not get your location.', 'error');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        if (!validateEmail(email)) {
          setError('Enter a valid email address.');
          return;
        }
        const res = await signIn(email, password);
        if (!res.ok) setError(res.error);
        return;
      }
      const res = await signUp({
        ownerName,
        email,
        password,
        business: { name, category, emoji, address, blurb, lat: coords.lat, lng: coords.lng },
      });
      if (!res.ok) setError(res.error);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    setMode('signin');
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar section="Business" />
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
        <h1 className="text-[28px] font-bold leading-tight text-neutral-900">
          {mode === 'signup' ? 'List your business' : 'Welcome back'}
        </h1>
        <p className="mt-1 text-neutral-600">
          {mode === 'signup'
            ? 'Put deals in customers’ Apple and Google Wallets. Free to start, no card needed.'
            : 'Sign in to manage your deals, passes and neighborhood drops.'}
        </p>

        <div className="mt-6 flex rounded-full bg-neutral-200/70 p-1" role="tablist" aria-label="Account">
          {(
            [
              ['signup', 'Create account'],
              ['signin', 'Sign in'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => {
                setMode(id);
                setError(null);
              }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold ${
                mode === id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
          {mode === 'signup' && (
            <Card title="About you">
              <Field label="Your name">
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  autoComplete="name"
                  placeholder="Maria Lopez"
                  className={inputCls}
                />
              </Field>
            </Card>
          )}

          <Card title="Login">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="you@yourbusiness.com"
                className={inputCls}
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'signup' ? '8+ characters, letters and numbers' : 'Your password'}
                  className={`${inputCls} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'signup' && pwProblem && <p className="mt-1 text-xs text-amber-700">{pwProblem}</p>}
            </Field>
          </Card>

          {mode === 'signup' && (
            <>
              <Card title="Your business">
                <Field label="Business name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Luigi's Pizzeria"
                    className={inputCls}
                  />
                </Field>
                <Field label="Category">
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategory(c.id)}
                        className={`rounded-full px-3.5 py-2 text-sm font-semibold ${
                          category === c.id ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200'
                        }`}
                      >
                        {c.emoji} {c.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Icon">
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEmoji(em)}
                        aria-label={`Use ${em}`}
                        className={`h-11 w-11 rounded-xl text-2xl ${
                          emoji === em ? 'bg-neutral-900/10 ring-2 ring-neutral-900' : 'bg-white ring-1 ring-neutral-200'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Street address">
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    autoComplete="street-address"
                    placeholder="123 Main Street"
                    className={inputCls}
                  />
                </Field>
                <Field label="One-line description (optional)">
                  <input
                    value={blurb}
                    onChange={(e) => setBlurb(e.target.value)}
                    placeholder="What makes you special?"
                    className={inputCls}
                  />
                </Field>
                <div className="rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-700">
                  <p>📍 {coordsLabel}</p>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-800 ring-1 ring-neutral-300"
                  >
                    Use my current location
                  </button>
                  <p className="mt-2 text-[11px] text-neutral-500">
                    Prototype: addresses are not geocoded yet. Your location drives the map pin and the radius
                    for neighborhood drops.
                  </p>
                </div>
              </Card>

              <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600 ring-1 ring-neutral-200">
                You start on <b>Free Starter</b> (2 deals and 50 wallet saves a month). We draft your first deal
                for you, and an admin reviews new businesses before deals go live.
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-neutral-900 py-4 text-base font-semibold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              onClick={fillDemo}
              className="w-full rounded-full bg-white py-3.5 text-sm font-semibold text-neutral-800 ring-1 ring-neutral-300"
            >
              Fill in the demo account
            </button>
          )}
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-neutral-400">
          Prototype accounts live in this browser only, with passwords hashed (PBKDF2). Production will use
          server-side auth.
        </p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-neutral-200">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      {children}
    </div>
  );
}
