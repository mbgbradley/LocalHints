'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { jitter } from '@/lib/geo';
import { CATEGORIES, POINTS, type Category } from '@/types/localhints';

interface DealSpotterModalProps {
  open: boolean;
  onClose: () => void;
}

export function DealSpotterModal({ open, onClose }: DealSpotterModalProps) {
  const { state, spotDeal } = useStore();
  const [businessName, setBusinessName] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState<Category>('food');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    // The spotted deal is pinned near the consumer's current location.
    const where = jitter({ lat: state.consumer.lat, lng: state.consumer.lng }, 0.15);
    const res = spotDeal({ businessName, title, details, category, lat: where.lat, lng: where.lng });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBusinessName('');
    setTitle('');
    setDetails('');
    setCategory('food');
    setError(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Spot a deal">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Seen a sign, a chalkboard or a poster? Share it with your neighbors. You earn{' '}
          <span className="font-bold text-hint-700">{POINTS.spotApproved} points</span> when a moderator
          approves it.
        </p>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Business</span>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Mario's Pizza"
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-3 text-base outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">The deal</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Slice + soda for $4 until 4pm"
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-3 text-base outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Details (optional)
          </span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Where did you see it? When does it end?"
            className="mt-1 w-full resize-none rounded-xl border border-neutral-300 px-3 py-3 text-base outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
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
                  category === c.id
                    ? 'bg-hint-600 text-white'
                    : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200'
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-neutral-500">📍 Pinned near {state.consumer.locationLabel}</p>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30 active:scale-[0.99]"
        >
          Submit for review
        </button>
      </div>
    </Sheet>
  );
}
