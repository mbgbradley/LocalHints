'use client';

import { useMemo, useState } from 'react';
import { blastsThisMonth, countActiveDeals, isDealExpired, useStore } from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { dealLabel, timeLeft } from '@/components/ui/format';
import { TIER_LIMITS, type Business } from '@/types/localhints';
import { ProCouponBuilder } from './ProCouponBuilder';
import { CampaignAndBlasts } from './CampaignAndBlasts';
import { AnalyticsAndBenchmarks } from './AnalyticsAndBenchmarks';
import { OnboardingWizard } from './OnboardingWizard';
import { PrintableStandModal } from './PrintableStandModal';

type Section = 'overview' | 'builder' | 'campaigns' | 'analytics';

const NAV: ReadonlyArray<{ id: Section; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'builder', label: 'Create deal', icon: '🎟️' },
  { id: 'campaigns', label: 'Blasts', icon: '📣' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
];

export function BusinessDashboard() {
  const { activeBusiness, ownedBusinesses, setActiveBusiness, upgradeTier } = useStore();
  const [section, setSection] = useState<Section>('overview');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [standOpen, setStandOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (!activeBusiness) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center">
        <p className="text-5xl">🏪</p>
        <h1 className="mt-3 text-2xl font-black text-slate-900">Welcome to LocalHints</h1>
        <p className="mt-2 text-slate-600">Register your first business to start publishing deals.</p>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="mt-5 rounded-2xl bg-hint-600 px-6 py-4 font-bold text-white"
        >
          Register a business
        </button>
        <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      </div>
    );
  }

  const biz = activeBusiness;
  const isPro = biz.tier === 'pro';

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-hint-100 text-3xl">
            {biz.emoji}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 lg:text-2xl">{biz.name}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isPro ? 'bg-hint-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {TIER_LIMITS[biz.tier].label}
              </span>
            </div>
            <p className="text-sm text-slate-500">{biz.address}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ownedBusinesses.length > 1 && (
            <select
              aria-label="Switch business"
              value={biz.id}
              onChange={(e) => setActiveBusiness(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
            >
              {ownedBusinesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.emoji} {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setStandOpen(true)}
            className="rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-slate-800 ring-1 ring-slate-300"
          >
            🖨️ Print stand
          </button>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-bold text-white"
          >
            + Add business
          </button>
        </div>
      </header>

      {biz.status !== 'approved' && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
          {biz.status === 'pending'
            ? 'Your business is waiting for admin approval. Switch to the Admin role in the top bar to approve it.'
            : 'This business is suspended. Contact an admin to be reinstated.'}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Business sections">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSection(n.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${
                section === n.id
                  ? 'bg-hint-600 text-white shadow'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 active:bg-slate-50'
              }`}
            >
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {section === 'overview' && <Overview business={biz} onUpgrade={() => setUpgradeOpen(true)} />}
          {section === 'builder' && <ProCouponBuilder business={biz} onUpgrade={() => setUpgradeOpen(true)} />}
          {section === 'campaigns' && <CampaignAndBlasts business={biz} onUpgrade={() => setUpgradeOpen(true)} />}
          {section === 'analytics' && (
            <AnalyticsAndBenchmarks business={biz} onUpgrade={() => setUpgradeOpen(true)} />
          )}
        </div>
      </div>

      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <PrintableStandModal open={standOpen} onClose={() => setStandOpen(false)} business={biz} />

      <Sheet open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title={isPro ? 'Your Pro plan' : 'Upgrade to Pro'}>
        <div className="space-y-4">
          <ul className="space-y-2 text-sm text-slate-700">
            <li>✅ Up to {TIER_LIMITS.pro.maxActiveDeals} active deals (Free: {TIER_LIMITS.free.maxActiveDeals})</li>
            <li>✅ BOGO and free-gift coupons, custom length, claim caps, themes and codes</li>
            <li>✅ {TIER_LIMITS.pro.blastsPerMonth} neighborhood blasts per month</li>
            <li>✅ Category benchmarks in analytics</li>
          </ul>
          <p className="text-2xl font-black text-slate-900">
            ${TIER_LIMITS.pro.priceUsd}
            <span className="text-sm font-semibold text-slate-500">/month</span>
          </p>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Prototype: no payment is taken. Production would open Stripe Checkout here.
          </p>
          {isPro ? (
            <button
              type="button"
              onClick={() => {
                upgradeTier(biz.id, 'free');
                setUpgradeOpen(false);
              }}
              className="w-full rounded-2xl bg-slate-100 py-4 text-base font-bold text-slate-700"
            >
              Switch back to Free (demo)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                upgradeTier(biz.id, 'pro');
                setUpgradeOpen(false);
              }}
              className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30"
            >
              Start Pro (demo)
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function Overview({ business, onUpgrade }: { business: Business; onUpgrade: () => void }) {
  const { state, now, setDealStatus, redeemByCode } = useStore();
  const limits = TIER_LIMITS[business.tier];
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const deals = useMemo(
    () =>
      state.deals
        .filter((d) => d.businessId === business.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.deals, business.id],
  );
  const dealIds = useMemo(() => new Set(deals.map((d) => d.id)), [deals]);
  const bizPasses = state.passes.filter((p) => dealIds.has(p.dealId));
  const views = deals.reduce((sum, d) => sum + d.viewCount, 0);
  const redeemed = bizPasses.filter((p) => p.redeemedAt).length;
  const activeCount = countActiveDeals(state, business.id, now);
  const blastsUsed = blastsThisMonth(state, business.id, now);

  const handleRedeem = () => {
    const res = redeemByCode(business.id, code);
    if (res.ok) {
      setMsg({ ok: true, text: `Redeemed: ${res.data.dealTitle}` });
      setCode('');
    } else {
      setMsg({ ok: false, text: res.error });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active deals" value={`${activeCount}/${limits.maxActiveDeals}`} />
        <Stat label="Deal views" value={views.toLocaleString()} />
        <Stat label="Passes claimed" value={bizPasses.length.toLocaleString()} />
        <Stat label="Redeemed" value={redeemed.toLocaleString()} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Your deals</h2>
          {deals.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No deals yet. Create your first one.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {deals.map((d) => {
                const expired = isDealExpired(d, now);
                const claims = state.passes.filter((p) => p.dealId === d.id).length;
                const status = expired ? 'Expired' : d.status === 'paused' ? 'Paused' : 'Live';
                const tone = expired
                  ? 'bg-slate-100 text-slate-500'
                  : d.status === 'paused'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700';
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{d.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {dealLabel(d)} · {claims}
                        {d.claimLimit ? `/${d.claimLimit}` : ''} claimed · {d.viewCount} views ·{' '}
                        {expired ? 'ended' : timeLeft(d.expiresAt, now)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{status}</span>
                    {!expired && (
                      <button
                        type="button"
                        onClick={() => setDealStatus(d.id, d.status === 'live' ? 'paused' : 'live')}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 active:bg-slate-200"
                      >
                        {d.status === 'live' ? 'Pause' : 'Resume'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Redeem a pass</h2>
            <p className="mt-1 text-sm text-slate-600">Enter the code shown on the customer&apos;s pass.</p>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setMsg(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRedeem();
              }}
              placeholder="e.g. TACO2X1-7QK2"
              className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono uppercase outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
            />
            <button
              type="button"
              onClick={handleRedeem}
              className="mt-2 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
            >
              Redeem
            </button>
            {msg && (
              <p
                role="status"
                className={`mt-2 rounded-xl px-3 py-2 text-sm font-medium ${
                  msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {msg.text}
              </p>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Plan</h2>
              <span className="text-sm font-bold text-hint-700">{limits.label}</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
              <li>
                Active deals: <b>{activeCount}</b> of {limits.maxActiveDeals}
              </li>
              <li>
                Blasts this month: <b>{blastsUsed}</b> of {limits.blastsPerMonth}
              </li>
              <li>Custom coupons: {limits.customCoupons ? 'Included' : 'Pro only'}</li>
              <li>Benchmarks: {limits.benchmarks ? 'Included' : 'Pro only'}</li>
            </ul>
            <button
              type="button"
              onClick={onUpgrade}
              className="mt-4 w-full rounded-xl bg-hint-600 py-3 text-sm font-bold text-white"
            >
              {business.tier === 'pro' ? 'Manage plan' : `Upgrade to Pro · $${TIER_LIMITS.pro.priceUsd}/mo`}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}
