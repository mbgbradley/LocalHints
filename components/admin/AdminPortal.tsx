'use client';

import { isDealLive, isPilotActive, pilotSlotsUsed, useStore } from '@/lib/store';
import { formatMiles, haversineMiles } from '@/lib/geo';
import { relativeTime } from '@/components/ui/format';
import { CATEGORIES, PILOT_DAYS, PILOT_SLOTS, TIER_LIMITS } from '@/types/localhints';

export function AdminPortal({ usingDefaults = false }: { usingDefaults?: boolean }) {
  const {
    state,
    now,
    approveBusiness,
    suspendBusiness,
    reinstateBusiness,
    upgradeTier,
    enrollPilot,
    endPilot,
    moderateSpotted,
    resetDemo,
  } = useStore();
  const { businesses, deals, spotted, consumer, accounts } = state;
  const ownerEmail = (id: string) => accounts.find((a) => a.id === id)?.email;

  const pendingBiz = businesses.filter((b) => b.status === 'pending');
  const pendingSpots = spotted.filter((s) => s.status === 'pending');
  const liveDeals = deals.filter((d) => isDealLive(d, state, now)).length;
  const proCount = businesses.filter((b) => b.tier === 'pro' && b.status === 'approved').length;
  const pilotUsed = pilotSlotsUsed(state, now);
  const mrr = proCount * TIER_LIMITS.pro.priceMonthlyUsd;

  const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 lg:px-8">
      {usingDefaults && (
        <p role="alert" className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
          You are using the default admin credentials (Admin / Admin). Before sharing this site, set
          ADMIN_PASSWORD and SESSION_SECRET in your hosting environment variables.
        </p>
      )}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900">Admin portal</h1>
          <p className="text-sm text-neutral-500">Approve businesses, moderate community tips and manage plans.</p>
        </div>
        <button
          type="button"
          onClick={resetDemo}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-rose-600 ring-1 ring-rose-200 active:bg-rose-50"
        >
          Reset demo data
        </button>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Businesses" value={businesses.length} />
        <Kpi label="Awaiting approval" value={pendingBiz.length} highlight={pendingBiz.length > 0} />
        <Kpi label="Live deals" value={liveDeals} />
        <Kpi label="Tips to review" value={pendingSpots.length} highlight={pendingSpots.length > 0} />
        <Kpi label="Est. MRR" value={`$${mrr}`} />
        <Kpi label={`Pilot spots (${PILOT_DAYS / 30}-mo free Pro)`} value={`${pilotUsed}/${PILOT_SLOTS}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">Business approvals</h2>
          {pendingBiz.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">All caught up. New registrations appear here.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pendingBiz.map((b) => (
                <li key={b.id} className="rounded-2xl bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{b.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-neutral-900">{b.name}</p>
                      <p className="text-sm text-neutral-600">
                        {catLabel(b.category)?.label} · {b.address}
                      </p>
                      {b.blurb && <p className="mt-1 text-sm text-neutral-600">{b.blurb}</p>}
                      <p className="mt-1 text-xs text-neutral-500">Applied {relativeTime(b.createdAt, now)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => approveBusiness(b.id)}
                      className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => suspendBusiness(b.id)}
                      className="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-rose-600 ring-1 ring-rose-200"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">Community tips</h2>
          {pendingSpots.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No tips waiting. Spot one from the shopper home page.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pendingSpots.map((s) => (
                <li key={s.id} className="rounded-2xl bg-neutral-50 p-4">
                  <p className="text-xs font-semibold text-neutral-500">
                    {s.businessName} · {catLabel(s.category)?.emoji} · {formatMiles(haversineMiles(consumer, s))}{' '}
                    away · {relativeTime(s.createdAt, now)}
                    {s.userId === consumer.id ? ` · from ${consumer.name}` : ''}
                  </p>
                  <p className="mt-1 font-bold text-neutral-900">{s.title}</p>
                  {s.details && <p className="mt-1 text-sm text-neutral-600">{s.details}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => moderateSpotted(s.id, true)}
                      className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => moderateSpotted(s.id, false)}
                      className="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-rose-600 ring-1 ring-rose-200"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-lg font-bold text-neutral-900">All businesses</h2>
        <ul className="mt-3 divide-y divide-neutral-100">
          {businesses.map((b) => {
            const live = deals.filter((d) => d.businessId === b.id && isDealLive(d, state, now)).length;
            const tone =
              b.status === 'approved'
                ? 'bg-emerald-100 text-emerald-700'
                : b.status === 'pending'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-rose-100 text-rose-700';
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="text-2xl">{b.emoji}</span>
                <div className="min-w-[160px] flex-1">
                  <p className="font-semibold text-neutral-900">{b.name}</p>
                  <p className="text-xs text-neutral-500">
                    {catLabel(b.category)?.label} · {live} live {live === 1 ? 'deal' : 'deals'}
                    {ownerEmail(b.ownerId) ? ` · ${ownerEmail(b.ownerId)}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tone}`}>{b.status}</span>
                {isPilotActive(b, now) ? (
                  <button
                    type="button"
                    onClick={() => endPilot(b.id)}
                    className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800"
                    title="End the free Pro pilot for this business"
                  >
                    Pilot ✓ (end)
                  </button>
                ) : (
                  b.tier === 'free' &&
                  b.status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => {
                        enrollPilot(b.id);
                      }}
                      disabled={pilotUsed >= PILOT_SLOTS}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200 disabled:opacity-40"
                    >
                      Add to pilot
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => upgradeTier(b.id, b.tier === 'pro' ? 'free' : 'pro')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    b.tier === 'pro' ? 'bg-hint-600 text-white' : 'bg-neutral-100 text-neutral-700'
                  }`}
                  title="Toggle plan (simulates a Stripe subscription change)"
                >
                  {b.tier === 'pro' ? 'Pro' : 'Free'}
                </button>
                {b.status === 'approved' && (
                  <button
                    type="button"
                    onClick={() => suspendBusiness(b.id)}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-rose-200"
                  >
                    Suspend
                  </button>
                )}
                {b.status === 'suspended' && (
                  <button
                    type="button"
                    onClick={() => reinstateBusiness(b.id)}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200"
                  >
                    Reinstate
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-3xl p-4 shadow-sm ring-1 ${
        highlight ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-neutral-200'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-neutral-900">{value}</p>
    </div>
  );
}
