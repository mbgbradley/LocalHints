'use client';

import { useState } from 'react';
import { blastsThisMonth, estimateReach, useStore } from '@/lib/store';
import { relativeTime } from '@/components/ui/format';
import {
  BLAST_MAX_CHARS,
  BLAST_MIN_CHARS,
  TIER_LIMITS,
  type Business,
} from '@/types/localhints';

interface CampaignAndBlastsProps {
  business: Business;
  onUpgrade: () => void;
}

export function CampaignAndBlasts({ business, onUpgrade }: CampaignAndBlastsProps) {
  const { state, now, sendBlast } = useStore();
  const limits = TIER_LIMITS[business.tier];
  const locked = limits.blastsPerMonth === 0;

  const [message, setMessage] = useState('');
  const [radius, setRadius] = useState(1.5);
  const [error, setError] = useState<string | null>(null);

  const used = blastsThisMonth(state, business.id, now);
  const remaining = Math.max(0, limits.blastsPerMonth - used);
  const history = state.blasts
    .filter((b) => b.businessId === business.id)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const tooShort = message.trim().length < BLAST_MIN_CHARS;

  const handleSend = () => {
    const res = sendBlast(business.id, message, radius);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setMessage('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">Neighborhood blast</h2>
            {!locked && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {remaining} of {limits.blastsPerMonth} left this month
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Send a push notification to shoppers within your chosen radius. Best saved for time-sensitive
            offers.
          </p>

          {locked ? (
            <div className="mt-4 rounded-2xl bg-hint-50 p-5 text-center">
              <p className="text-3xl">🔒</p>
              <p className="mt-2 font-bold text-hint-900">Blasts are a Pro feature</p>
              <p className="mt-1 text-sm text-hint-800">
                Pro includes {TIER_LIMITS.pro.blastsPerMonth} blasts a month for ${TIER_LIMITS.pro.priceUsd}
                /mo.
              </p>
              <button
                type="button"
                onClick={onUpgrade}
                className="mt-4 rounded-xl bg-hint-600 px-5 py-3 text-sm font-bold text-white"
              >
                Upgrade to Pro
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message</span>
                <textarea
                  value={message}
                  maxLength={BLAST_MAX_CHARS}
                  rows={3}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="☕ Rainy day special: BOGO lattes until 10am!"
                  className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
                />
                <span className="mt-1 block text-right text-xs text-slate-500">
                  {message.length}/{BLAST_MAX_CHARS}
                </span>
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Radius</span>
                  <span className="text-sm font-bold text-hint-700">
                    {radius} mi · about {estimateReach(radius)} neighbors
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={5}
                  step={0.5}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="mt-2 w-full accent-hint-600"
                  aria-label="Blast radius in miles"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleSend}
                disabled={remaining === 0 || tooShort || business.status !== 'approved'}
                className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30 disabled:bg-slate-300 disabled:shadow-none"
              >
                {remaining === 0 ? 'Monthly limit reached' : 'Send blast'}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-base font-bold text-slate-900">Sent blasts</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nothing sent yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {history.map((b) => (
                <li key={b.id} className="py-3">
                  <p className="text-sm font-medium text-slate-800">{b.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {relativeTime(b.sentAt, now)} · {b.radiusMiles} mi · reached about {b.reach}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Phone notification preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
          How it looks on a phone
        </p>
        <div className="mx-auto w-full max-w-[300px] rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-950 p-4 pb-10 shadow-xl">
          <p className="mt-2 text-center text-4xl font-light text-white/90">9:41</p>
          <div className="mt-6 rounded-2xl bg-white/90 p-3 shadow">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-hint-600 text-[10px] text-white">
                📍
              </span>
              LOCALHINTS · now
            </div>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {business.emoji} {business.name}
            </p>
            <p className="text-sm text-slate-700">{message.trim() || 'Your message appears here.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
