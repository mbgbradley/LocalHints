'use client';

import { useMemo, useState } from 'react';
import {
  dealsThisMonth,
  effectiveTier,
  isDealExpired,
  isDealOpenNow,
  isPilotActive,
  limitsFor,
  savesThisMonth,
  useStore,
} from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { AppBar } from '@/components/ui/AppBar';
import { Icon } from '@/components/ui/Icon';
import { dealLabel, scheduleText, timeLeft } from '@/components/ui/format';
import { TIER_LIMITS, type Business } from '@/types/localhints';
import { ProCouponBuilder } from './ProCouponBuilder';
import { CampaignAndBlasts } from './CampaignAndBlasts';
import { AnalyticsAndBenchmarks } from './AnalyticsAndBenchmarks';
import { OnboardingWizard } from './OnboardingWizard';
import { PrintableStandModal } from './PrintableStandModal';
import { WalletPassPreview } from './WalletPassPreview';

type Section = 'overview' | 'builder' | 'campaigns' | 'analytics';

const NAV: ReadonlyArray<{ id: Section; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'builder', label: 'Create deal', icon: '🎟️' },
  { id: 'campaigns', label: 'Pass Push', icon: '🔔' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
];

export function BusinessDashboard() {
  const { account, signOut, activeBusiness, ownedBusinesses, setActiveBusiness, upgradeTier, now } = useStore();
  const [section, setSection] = useState<Section>('overview');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [standOpen, setStandOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  if (!activeBusiness) {
    return (
      <div className="min-h-screen bg-neutral-50">
      <AppBar section="Business">
        {account && <span className="hidden text-sm text-neutral-500 sm:block">{account.email}</span>}
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200"
        >
          <Icon name="logout" className="h-4 w-4" />
          Sign out
        </button>
      </AppBar>
      <div className="mx-auto max-w-xl p-6 pt-12 text-center">
        <p className="text-5xl">🏪</p>
        <h1 className="mt-3 text-2xl font-black text-neutral-900">Welcome to LocalHints</h1>
        <p className="mt-2 text-neutral-600">Register your first business to start publishing deals.</p>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="mt-5 rounded-2xl bg-hint-600 px-6 py-4 font-bold text-white"
        >
          Register a business
        </button>
        <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      </div>
      </div>
    );
  }

  const biz = activeBusiness;
  const tier = effectiveTier(biz, now);
  const pilot = isPilotActive(biz, now);
  const paidPro = biz.tier === 'pro';
  const pro = TIER_LIMITS[tier].proBuilder;
  const pilotEnds = biz.pilotEndsAt ? new Date(biz.pilotEndsAt).toLocaleDateString() : '';

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar section="Business">
        {account && <span className="hidden text-sm text-neutral-500 sm:block">{account.email}</span>}
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200"
        >
          <Icon name="logout" className="h-4 w-4" />
          Sign out
        </button>
      </AppBar>
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-hint-100 text-3xl">
            {biz.emoji}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-neutral-900 lg:text-2xl">{biz.name}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  pro ? 'bg-hint-600 text-white' : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                {TIER_LIMITS[tier].label}
              </span>
              {pilot && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  Pilot · free until {pilotEnds}
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-500">{biz.address}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ownedBusinesses.length > 1 && (
            <select
              aria-label="Switch business"
              value={biz.id}
              onChange={(e) => setActiveBusiness(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-800"
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
            className="rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-neutral-800 ring-1 ring-neutral-300"
          >
            🖨️ Counter stand
          </button>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-bold text-white"
          >
            + Add business
          </button>
        </div>
      </header>

      {biz.status !== 'approved' && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
          {biz.status === 'pending'
            ? 'Your business is waiting for admin approval. An admin can approve it from the Admin sign-in (linked on the home page).'
            : 'This business is suspended. Contact an admin to be reinstated.'}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible"
          aria-label="Business sections"
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSection(n.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${
                section === n.id
                  ? 'bg-hint-600 text-white shadow'
                  : 'bg-white text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-50'
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
          {section === 'campaigns' && (
            <CampaignAndBlasts business={biz} onUpgrade={() => setUpgradeOpen(true)} />
          )}
          {section === 'analytics' && (
            <AnalyticsAndBenchmarks business={biz} onUpgrade={() => setUpgradeOpen(true)} />
          )}
        </div>
      </div>

      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <PrintableStandModal open={standOpen} onClose={() => setStandOpen(false)} business={biz} />

      <Sheet
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title={paidPro ? 'Your Pro plan' : 'Upgrade to Pro'}
      >
        <div className="space-y-4">
          <ul className="space-y-2 text-sm text-neutral-700">
            <li>✅ Unlimited deals and unlimited wallet saves (Free: 2 deals, 50 saves a month)</li>
            <li>✅ Stamp cards, share-to-upgrade, Main Street Loop and weekly schedules</li>
            <li>✅ Full funnel analytics and local benchmarks</li>
            <li>✅ Pass Push lock-screen updates, free to deliver</li>
            <li>✅ Branded wallet cards, POS codes and per-customer limits</li>
          </ul>

          <div className="grid grid-cols-2 gap-2">
            {(['monthly', 'annual'] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBilling(b)}
                className={`rounded-2xl p-3 text-left ring-2 ${
                  billing === b ? 'bg-hint-50 ring-hint-600' : 'bg-white ring-neutral-200'
                }`}
              >
                <span className="block text-xs font-bold uppercase tracking-wide text-neutral-500">
                  {b === 'monthly' ? 'Monthly' : 'Annual'}
                </span>
                <span className="block text-xl font-black text-neutral-900">
                  ${b === 'monthly' ? TIER_LIMITS.pro.priceMonthlyUsd : TIER_LIMITS.pro.priceAnnualUsd}
                  <span className="text-xs font-semibold text-neutral-500">{b === 'monthly' ? '/mo' : '/yr'}</span>
                </span>
                {b === 'annual' && <span className="text-xs font-bold text-emerald-600">2 months free</span>}
              </button>
            ))}
          </div>

          <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
            Prototype: no payment is taken. Production would open Stripe Checkout here.
          </p>
          {paidPro ? (
            <button
              type="button"
              onClick={() => {
                upgradeTier(biz.id, 'free');
                setUpgradeOpen(false);
              }}
              className="w-full rounded-2xl bg-neutral-100 py-4 text-base font-bold text-neutral-700"
            >
              Switch back to Free (demo)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                upgradeTier(biz.id, 'pro', billing);
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
    </div>
  );
}

function Overview({ business, onUpgrade }: { business: Business; onUpgrade: () => void }) {
  const { state, now, setDealStatus, endDeal, redeemByCode, publishDraft, discardDraft } = useStore();
  const limits = limitsFor(business, now);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const allDeals = useMemo(
    () =>
      state.deals
        .filter((d) => d.businessId === business.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.deals, business.id],
  );
  const drafts = allDeals.filter((d) => d.status === 'draft');
  const deals = allDeals.filter((d) => d.status !== 'draft');
  const dealIds = useMemo(() => new Set(deals.map((d) => d.id)), [deals]);
  const bizPasses = state.passes.filter((p) => dealIds.has(p.dealId));
  const views = deals.reduce((sum, d) => sum + d.viewCount, 0);
  const redeemed = bizPasses.filter((p) => p.stamps > 0).length;

  const dealsUsed = dealsThisMonth(state, business.id, now);
  const savesUsed = savesThisMonth(state, business.id, now);
  const saveCap = limits.savesPerMonth;
  const savePct = saveCap ? Math.min(100, (savesUsed / saveCap) * 100) : 0;

  const handleRedeem = () => {
    const res = redeemByCode(business.id, code);
    if (res.ok) {
      const d = res.data;
      setMsg({
        ok: true,
        text:
          d.total > 1
            ? d.complete
              ? `Card complete: ${d.dealTitle}. Give the reward!`
              : `Stamp ${d.stamps} of ${d.total}: ${d.dealTitle}`
            : `Redeemed: ${d.dealTitle}`,
      });
      setCode('');
    } else {
      setMsg({ ok: false, text: res.error });
    }
  };

  return (
    <div className="space-y-6">
      {drafts.map((d) => (
        <section key={d.id} className="rounded-3xl bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm ring-1 ring-amber-200">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-neutral-900">Your first deal is ready</h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
              Concierge draft
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            We built this from your public info so you do not have to type anything. Preview it, then go live.
          </p>
          <div className="mt-4 grid items-center gap-5 md:grid-cols-[340px_minmax(0,1fr)]">
            <WalletPassPreview
              businessName={business.name}
              emoji={business.emoji}
              label={dealLabel(d)}
              title={d.title}
              terms={d.terms}
              brandColor={d.brandColor}
              code={d.code}
              method={d.redemptionMethod}
              expiryText="14 days after you go live"
            />
            <div className="space-y-3">
              {draftError && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {draftError}
                </p>
              )}
              <button
                type="button"
                disabled={business.status !== 'approved'}
                onClick={() => {
                  const res = publishDraft(d.id);
                  setDraftError(res.ok ? null : res.error);
                }}
                className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30 disabled:bg-neutral-300 disabled:shadow-none"
              >
                Approve &amp; go live
              </button>
              {business.status !== 'approved' && (
                <p className="text-xs text-neutral-500">You can go live as soon as an admin approves the business.</p>
              )}
              <button
                type="button"
                onClick={() => discardDraft(d.id)}
                className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-neutral-600 ring-1 ring-neutral-300"
              >
                Discard draft
              </button>
            </div>
          </div>
        </section>
      ))}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Deals this month"
          value={limits.dealsPerMonth === null ? `${dealsUsed}` : `${dealsUsed}/${limits.dealsPerMonth}`}
        />
        <Stat label="Deal views" value={views.toLocaleString()} />
        <Stat label="Wallet saves" value={bizPasses.length.toLocaleString()} />
        <Stat label="Redeemed" value={redeemed.toLocaleString()} />
      </div>

      {saveCap !== null && (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-neutral-900">Wallet saves this month</h2>
            <span className="text-sm font-bold text-neutral-700">
              {savesUsed} of {saveCap}
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full ${savePct >= 100 ? 'bg-rose-500' : savePct >= 80 ? 'bg-amber-500' : 'bg-hint-600'}`}
              style={{ width: `${savePct}%` }}
            />
          </div>
          {savePct >= 80 && (
            <p className="mt-2 text-sm text-neutral-600">
              {savePct >= 100
                ? 'You hit the Free limit: new saves are paused until next month. '
                : 'You are close to the Free limit. '}
              <button type="button" onClick={onUpgrade} className="font-bold text-hint-700 underline">
                Go Pro for unlimited saves
              </button>
              .
            </p>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">Your deals</h2>
          {deals.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No deals yet. Create your first one.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100">
              {deals.map((d) => {
                const expired = isDealExpired(d, now);
                const ended = d.status === 'ended';
                const closed = d.status === 'live' && !expired && !isDealOpenNow(d, now);
                const claims = state.passes.filter((p) => p.dealId === d.id).length;
                const status = ended
                  ? 'Ended'
                  : expired
                    ? 'Expired'
                    : d.status === 'paused'
                      ? 'Paused'
                      : closed
                        ? 'Scheduled'
                        : 'Live';
                const tone =
                  ended || expired
                    ? 'bg-neutral-100 text-neutral-500'
                    : d.status === 'paused'
                      ? 'bg-amber-100 text-amber-700'
                      : closed
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-emerald-100 text-emerald-700';
                const over = ended || expired;
                return (
                  <li key={d.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-neutral-900">{d.title}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {dealLabel(d)} · {claims}
                          {d.claimLimit ? `/${d.claimLimit}` : ''} saved · {d.viewCount} views ·{' '}
                          {over
                            ? 'finished'
                            : d.recurring
                              ? scheduleText(d.recurring)
                              : timeLeft(d.expiresAt, now)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{status}</span>
                      {!over && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDealStatus(d.id, d.status === 'paused' ? 'live' : 'paused')}
                            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 active:bg-neutral-200"
                          >
                            {d.status === 'paused' ? 'Resume' : 'Pause'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEndingId(endingId === d.id ? null : d.id)}
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-rose-200"
                          >
                            End now
                          </button>
                        </div>
                      )}
                    </div>
                    {endingId === d.id && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-3">
                        <p className="text-xs font-medium text-rose-800">
                          This voids the deal on every phone holding it (&ldquo;Offer ended by merchant&rdquo;). It
                          cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEndingId(null)}
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 ring-1 ring-neutral-200"
                          >
                            Keep it
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              endDeal(d.id);
                              setEndingId(null);
                            }}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
                          >
                            End deal now
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-neutral-400">
            Pause now, resume Monday: existing passes wake back up with no re-download.
          </p>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <h2 className="text-lg font-bold text-neutral-900">Redeem a pass</h2>
            <p className="mt-1 text-sm text-neutral-600">Enter the pass code shown under the QR on the customer&apos;s phone.</p>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setMsg(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRedeem();
              }}
              placeholder="e.g. LUNCH15-7QK2"
              className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-3 font-mono uppercase outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
            />
            <button
              type="button"
              onClick={handleRedeem}
              className="mt-2 w-full rounded-xl bg-neutral-900 py-3 text-sm font-bold text-white"
            >
              Redeem / add stamp
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

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-900">Plan</h2>
              <span className="text-sm font-bold text-hint-700">{limits.label}</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-600">
              <li>
                Deals: <b>{limits.dealsPerMonth === null ? 'Unlimited' : `${limits.dealsPerMonth} per month`}</b>
              </li>
              <li>
                Wallet saves: <b>{limits.savesPerMonth === null ? 'Unlimited' : `${limits.savesPerMonth} per month`}</b>
              </li>
              <li>Pro builder: {limits.proBuilder ? 'Included' : 'Pro only'}</li>
              <li>Pass Push: {limits.passPush ? 'Included' : 'Pro only'}</li>
              <li>Funnel and benchmarks: {limits.funnelAnalytics ? 'Included' : 'Pro only'}</li>
            </ul>
            <button
              type="button"
              onClick={onUpgrade}
              className="mt-4 w-full rounded-xl bg-hint-600 py-3 text-sm font-bold text-white"
            >
              {business.tier === 'pro' ? 'Manage plan' : `Upgrade to Pro · $${TIER_LIMITS.pro.priceMonthlyUsd}/mo`}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-neutral-900">{value}</p>
    </div>
  );
}
