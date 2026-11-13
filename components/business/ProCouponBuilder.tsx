'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { countActiveDeals, useStore } from '@/lib/store';
import {
  FREE_DEAL_DURATION_DAYS,
  TIER_LIMITS,
  type Business,
  type DealKind,
  type PassTheme,
} from '@/types/localhints';
import { dealLabel, KIND_LABELS, suggestCode, THEME_IDS, THEMES } from '@/components/ui/format';
import { WalletPassPreview } from './WalletPassPreview';

interface ProCouponBuilderProps {
  business: Business;
  onUpgrade: () => void;
}

const KINDS: DealKind[] = ['percent', 'amount', 'bogo', 'freebie'];
const DURATIONS = [1, 3, 7, 14, 30];

export function ProCouponBuilder({ business, onUpgrade }: ProCouponBuilderProps) {
  const { state, now, createDeal } = useStore();
  const limits = TIER_LIMITS[business.tier];
  const isPro = limits.customCoupons;

  const [title, setTitle] = useState('20% off your first visit');
  const [description, setDescription] = useState('Show this pass at the counter to save.');
  const [kind, setKind] = useState<DealKind>('percent');
  const [value, setValue] = useState(20);
  const [terms, setTerms] = useState('One per customer. Not combinable with other offers.');
  const [durationDays, setDurationDays] = useState(7);
  const [claimLimit, setClaimLimit] = useState('');
  const [theme, setTheme] = useState<PassTheme>('indigo');
  const [customCode, setCustomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(null);

  const activeCount = countActiveDeals(state, business.id, now);
  const atLimit = activeCount >= limits.maxActiveDeals;
  const approved = business.status === 'approved';

  const effectiveValue = kind === 'bogo' ? 1 : kind === 'freebie' ? 0 : value;
  const autoCode = useMemo(
    () => suggestCode(business.name, kind, effectiveValue),
    [business.name, kind, effectiveValue],
  );
  const code = isPro && customCode.trim() ? customCode.trim().toUpperCase() : autoCode;
  const effectiveDays = isPro ? durationDays : FREE_DEAL_DURATION_DAYS;
  const effectiveTheme: PassTheme = isPro ? theme : 'indigo';

  const handlePublish = () => {
    setPublished(null);
    const parsedLimit = claimLimit.trim() === '' ? null : Number(claimLimit);
    const res = createDeal({
      businessId: business.id,
      title,
      description,
      kind,
      value: effectiveValue,
      terms,
      code,
      durationDays: effectiveDays,
      claimLimit: parsedLimit !== null && Number.isFinite(parsedLimit) ? parsedLimit : null,
      theme: effectiveTheme,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setPublished(res.data.title);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Create a deal</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              atLimit ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {activeCount} of {limits.maxActiveDeals} active deals
          </span>
        </div>

        {!isPro && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-hint-50 p-4 text-sm text-hint-900">
            <p>
              Free plan: percent or dollar-off deals, fixed {FREE_DEAL_DURATION_DAYS}-day run. Pro unlocks
              BOGO, free gifts, custom length, claim caps, themes and codes.
            </p>
            <button
              type="button"
              onClick={onUpgrade}
              className="rounded-xl bg-hint-600 px-4 py-2 text-sm font-bold text-white"
            >
              Upgrade to Pro
            </button>
          </div>
        )}

        {!approved && (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
            Your business is {business.status}. Deals can be published once an admin approves it.
          </p>
        )}

        <Field label="Offer title">
          <input
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-none rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deal type">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as DealKind)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
            >
              {KINDS.map((k) => {
                const locked = !isPro && (k === 'bogo' || k === 'freebie');
                return (
                  <option key={k} value={k} disabled={locked}>
                    {KIND_LABELS[k]}
                    {locked ? ' (Pro)' : ''}
                  </option>
                );
              })}
            </select>
          </Field>

          {(kind === 'percent' || kind === 'amount') && (
            <Field label={kind === 'percent' ? 'Percent off' : 'Dollars off'}>
              <input
                type="number"
                min={1}
                max={kind === 'percent' ? 90 : 500}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
              />
            </Field>
          )}
        </div>

        <Field label="Terms">
          <input
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Duration" locked={!isPro} onUpgrade={onUpgrade}>
            {isPro ? (
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'day' : 'days'}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-xl bg-slate-100 px-3 py-3 text-slate-600">
                {FREE_DEAL_DURATION_DAYS} days (fixed)
              </p>
            )}
          </Field>

          <Field label="Claim cap" locked={!isPro} onUpgrade={onUpgrade}>
            <input
              type="number"
              min={1}
              disabled={!isPro}
              value={isPro ? claimLimit : ''}
              placeholder={isPro ? 'Unlimited' : 'Unlimited (fixed)'}
              onChange={(e) => setClaimLimit(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200 disabled:bg-slate-100"
            />
          </Field>

          <Field label="Pass color" locked={!isPro} onUpgrade={onUpgrade}>
            <div className="flex gap-2">
              {THEME_IDS.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!isPro}
                  aria-label={THEMES[t].label}
                  onClick={() => setTheme(t)}
                  className={`h-9 w-9 rounded-full ${THEMES[t].swatch} ${
                    effectiveTheme === t ? 'ring-2 ring-offset-2 ring-slate-900' : ''
                  } disabled:opacity-40`}
                />
              ))}
            </div>
          </Field>

          <Field label="Coupon code" locked={!isPro} onUpgrade={onUpgrade}>
            <input
              disabled={!isPro}
              value={isPro ? customCode : autoCode}
              maxLength={12}
              placeholder={autoCode}
              onChange={(e) => setCustomCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 font-mono uppercase outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200 disabled:bg-slate-100"
            />
          </Field>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}
        {published && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Published “{published}”. It is live in the consumer feed now.
          </p>
        )}

        <button
          type="button"
          onClick={handlePublish}
          disabled={atLimit || !approved}
          className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30 disabled:bg-slate-300 disabled:shadow-none"
        >
          {atLimit ? 'Deal limit reached' : 'Publish deal'}
        </button>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
          Live wallet pass preview
        </p>
        <WalletPassPreview
          businessName={business.name}
          emoji={business.emoji}
          label={dealLabel({ kind, value: effectiveValue })}
          title={title}
          terms={terms}
          theme={effectiveTheme}
          code={code}
          expiryText={`${effectiveDays} ${effectiveDays === 1 ? 'day' : 'days'} after publish`}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  locked,
  onUpgrade,
}: {
  label: string;
  children: ReactNode;
  locked?: boolean;
  onUpgrade?: () => void;
}) {
  // A div (not a label) so the Pro badge button never hijacks clicks meant for the input.
  return (
    <div className="block">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {locked && (
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-full bg-hint-100 px-2 py-0.5 text-[10px] font-bold text-hint-700"
          >
            🔒 Pro
          </button>
        )}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}
