'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { DEFAULT_CENTER, getBrowserLocation, jitter } from '@/lib/geo';
import { CATEGORIES, type Category } from '@/types/localhints';

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

const EMOJIS = ['☕', '🥐', '🍕', '🌮', '🍜', '📚', '🌸', '💪', '🧺', '🎬', '✂️', '🛠️'];

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const { registerBusiness, notify } = useStore();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('food');
  const [emoji, setEmoji] = useState('🍕');
  const [blurb, setBlurb] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(() => jitter(DEFAULT_CENTER, 0.5));
  const [coordsLabel, setCoordsLabel] = useState('Placed in the demo district');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep(1);
    setName('');
    setCategory('food');
    setEmoji('🍕');
    setBlurb('');
    setAddress('');
    setCoords(jitter(DEFAULT_CENTER, 0.5));
    setCoordsLabel('Placed in the demo district');
    setError(null);
  };

  const close = () => {
    onClose();
    // Reset after the sheet has closed so a finished wizard does not reopen on the success screen.
    setTimeout(reset, 200);
  };

  const next = () => {
    if (step === 1 && name.trim().length < 2) {
      setError('Enter your business name.');
      return;
    }
    if (step === 2 && address.trim().length < 4) {
      setError('Enter a street address.');
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const useMyLocation = async () => {
    try {
      const pos = await getBrowserLocation();
      setCoords(pos);
      setCoordsLabel('Using your current location');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not get your location.', 'error');
    }
  };

  const submit = () => {
    const res = registerBusiness({
      name,
      category,
      emoji,
      address,
      blurb,
      lat: coords.lat,
      lng: coords.lng,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setStep(4);
  };

  const catMeta = CATEGORIES.find((c) => c.id === category);

  return (
    <Sheet open={open} onClose={close} title="Register your business">
      <div className="space-y-5">
        {step < 4 && (
          <div className="flex gap-1.5" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-hint-600' : 'bg-neutral-200'}`}
              />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-neutral-900">About your business</h3>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Luigi's Pizzeria"
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-3 text-base outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
              />
            </label>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Category</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold ${
                      category === c.id ? 'bg-hint-600 text-white' : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Icon</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    aria-label={`Use ${e}`}
                    className={`h-11 w-11 rounded-xl text-2xl ${
                      emoji === e ? 'bg-hint-100 ring-2 ring-hint-600' : 'bg-neutral-100'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Where are you?</h3>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Street address
              </span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main Street"
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-3 text-base outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                One-line description (optional)
              </span>
              <textarea
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
                rows={2}
                placeholder="What makes you special?"
                className="mt-1 w-full resize-none rounded-xl border border-neutral-300 px-3 py-3 text-base outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
              />
            </label>
            <div className="rounded-2xl bg-neutral-50 p-3">
              <p className="text-sm text-neutral-700">📍 {coordsLabel}</p>
              <button
                type="button"
                onClick={useMyLocation}
                className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-neutral-800 ring-1 ring-neutral-300"
              >
                Use my current location
              </button>
              <p className="mt-2 text-[11px] text-neutral-500">
                Prototype: addresses are not geocoded. Production would resolve this with PostGIS and a
                geocoder.
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Review</h3>
            <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-hint-100 text-3xl">
                {emoji}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-neutral-900">{name}</p>
                <p className="text-sm text-neutral-600">
                  {catMeta?.emoji} {catMeta?.label} · {address}
                </p>
              </div>
            </div>
            <p className="text-sm text-neutral-600">
              You start on <b>Free Starter</b> (2 deals and 50 wallet saves a month). We will also draft your
              first deal for you, so there is nothing to type. An admin reviews every new business before its
              deals go live.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 py-4 text-center">
            <p className="text-5xl">🎉</p>
            <h3 className="text-xl font-black text-neutral-900">You&apos;re in the queue</h3>
            <p className="text-sm text-neutral-600">
              We drafted a ready-to-launch first deal for <b>{name}</b>. In production you would get a magic login
              link by email or text, preview the pass, and tap Go Live.
            </p>
            <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Demo: an admin approves the business from the Admin sign-in. Your draft appears on the
              Overview tab.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          {step > 1 && step < 4 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(step - 1);
              }}
              className="rounded-2xl bg-neutral-100 px-5 py-4 text-sm font-bold text-neutral-700"
            >
              Back
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              onClick={next}
              className="flex-1 rounded-2xl bg-hint-600 py-4 text-base font-bold text-white"
            >
              Continue
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              onClick={submit}
              className="flex-1 rounded-2xl bg-hint-600 py-4 text-base font-bold text-white"
            >
              Submit for approval
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-2xl bg-hint-600 py-4 text-base font-bold text-white"
            >
              Open my dashboard (magic link demo)
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
