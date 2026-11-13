'use client';

import { useMemo, type ReactNode } from 'react';
import { limitsFor, useStore } from '@/lib/store';
import { AVG_TICKET, CATEGORY_BENCHMARKS } from '@/data/seed';
import { dealLabel } from '@/components/ui/format';
import { CATEGORIES, type Business } from '@/types/localhints';

interface AnalyticsAndBenchmarksProps {
  business: Business;
  onUpgrade: () => void;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : (n / d) * 100;
}

export function AnalyticsAndBenchmarks({ business, onUpgrade }: AnalyticsAndBenchmarksProps) {
  const { state, now } = useStore();
  const limits = limitsFor(business, now);

  const rows = useMemo(() => {
    return state.deals
      .filter((d) => d.businessId === business.id && d.status !== 'draft')
      .map((deal) => {
        const dealPasses = state.passes.filter((p) => p.dealId === deal.id);
        return {
          deal,
          views: deal.viewCount,
          saves: dealPasses.length,
          shares: dealPasses.reduce((sum, p) => sum + p.friendSaves, 0),
          redeemed: dealPasses.filter((p) => p.stamps > 0).length,
        };
      });
  }, [state.deals, state.passes, business.id]);

  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + r.views,
      saves: acc.saves + r.saves,
      shares: acc.shares + r.shares,
      redeemed: acc.redeemed + r.redeemed,
    }),
    { views: 0, saves: 0, shares: 0, redeemed: 0 },
  );

  const saveRate = pct(totals.saves, totals.views);
  const redeemRate = pct(totals.redeemed, totals.saves);
  const revenue = totals.redeemed * AVG_TICKET[business.category];
  const bench = CATEGORY_BENCHMARKS[business.category];
  const catLabel = CATEGORIES.find((c) => c.id === business.category)?.label.toLowerCase() ?? 'local';

  // Best deal by save-to-redemption rate (needs a few saves to mean anything).
  const best = rows
    .filter((r) => r.saves >= 10)
    .map((r) => ({ ...r, rate: pct(r.redeemed, r.saves) }))
    .sort((a, b) => b.rate - a.rate)[0];

  const funnel = [
    { label: 'Views', value: totals.views, color: 'bg-hint-200' },
    { label: 'Wallet saves', value: totals.saves, color: 'bg-hint-400' },
    { label: 'Friend shares', value: totals.shares, color: 'bg-emerald-500' },
    { label: 'In-store redemptions', value: totals.redeemed, color: 'bg-hint-700' },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Deal views" value={totals.views.toLocaleString()} />
        <Kpi label="Wallet saves" value={totals.saves.toLocaleString()} sub={`${saveRate.toFixed(1)}% of views`} />
        <Kpi label="Redeemed" value={totals.redeemed.toLocaleString()} sub={`${redeemRate.toFixed(0)}% of saves`} />
        <Kpi
          label="Revenue influenced"
          value={`$${revenue.toLocaleString()}`}
          sub={`est. at $${AVG_TICKET[business.category]} avg ticket`}
        />
      </div>

      {limits.benchmarks && best && (
        <div className="rounded-3xl bg-gradient-to-br from-hint-600 to-violet-700 p-5 text-white shadow-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">Insight</p>
          <p className="mt-1 text-base font-semibold leading-snug">
            Your &ldquo;{best.deal.title}&rdquo; deal had a {best.rate.toFixed(0)}% save-to-redemption rate,{' '}
            {best.rate >= bench.redeemRate
              ? `beating the average ${catLabel} deal nearby (${bench.redeemRate}%) by ${(best.rate / bench.redeemRate).toFixed(1)}x.`
              : `trailing the average ${catLabel} deal nearby (${bench.redeemRate}%). A schedule or Pass Push can help.`}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Locked locked={!limits.funnelAnalytics} what="The full funnel" onUpgrade={onUpgrade}>
          <h2 className="text-lg font-bold text-neutral-900">Conversion funnel</h2>
          <p className="mt-1 text-sm text-neutral-600">Views → wallet saves → friend shares → redemptions.</p>
          <ul className="mt-4 space-y-3">
            {funnel.map((f) => (
              <li key={f.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-neutral-800">{f.label}</span>
                  <span className="font-bold text-neutral-900">{f.value.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-neutral-100">
                  <div className={`h-full rounded-full ${f.color}`} style={{ width: `${(f.value / funnelMax) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Locked>

        <Locked locked={!limits.benchmarks} what="Neighborhood benchmarks" onUpgrade={onUpgrade}>
          <h2 className="text-lg font-bold text-neutral-900">Local benchmarks</h2>
          <p className="mt-1 text-sm text-neutral-600">How you compare with other {catLabel} businesses nearby.</p>
          <div className="mt-4 space-y-5">
            <Benchmark label="Save rate (saves / views)" you={saveRate} avg={bench.claimRate} />
            <Benchmark label="Save-to-redemption rate" you={redeemRate} avg={bench.redeemRate} />
          </div>
        </Locked>
      </div>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-lg font-bold text-neutral-900">Deal performance</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Publish a deal to see results here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {rows.map((r) => (
              <li key={r.deal.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-800">
                    {r.deal.title}
                    {r.deal.status === 'ended' ? ' (ended)' : ''}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {dealLabel(r.deal)} · {r.views} views · {r.saves} saves
                    {limits.funnelAnalytics ? ` · ${r.shares} friend shares` : ''} · {r.redeemed} redeemed
                  </p>
                </div>
                <p className="text-sm font-black text-hint-700">{pct(r.redeemed, r.saves).toFixed(0)}% redeem</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Locked({
  locked,
  what,
  onUpgrade,
  children,
}: {
  locked: boolean;
  what: string;
  onUpgrade: () => void;
  children: ReactNode;
}) {
  return (
    <section className="relative rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
      <div className={locked ? 'pointer-events-none select-none blur-sm' : ''}>{children}</div>
      {locked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-white/70 p-6 text-center">
          <p className="text-3xl">🔒</p>
          <p className="mt-2 font-bold text-neutral-900">{what} is a Pro feature</p>
          <button
            type="button"
            onClick={onUpgrade}
            className="mt-3 rounded-xl bg-hint-600 px-5 py-3 text-sm font-bold text-white"
          >
            Upgrade to Pro
          </button>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-neutral-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

function Benchmark({ label, you, avg }: { label: string; you: number; avg: number }) {
  const max = Math.max(you, avg, 1) * 1.15;
  const better = you >= avg;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-800">{label}</p>
        <p className={`text-xs font-bold ${better ? 'text-emerald-600' : 'text-amber-600'}`}>
          {better ? 'Above' : 'Below'} average
        </p>
      </div>
      <div className="mt-2 space-y-1.5">
        <Bar caption="You" value={you} max={max} color="bg-hint-600" />
        <Bar caption="Avg" value={avg} max={max} color="bg-neutral-400" />
      </div>
    </div>
  );
}

function Bar({ caption, value, max, color }: { caption: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-xs font-semibold text-neutral-500">{caption}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-bold text-neutral-700">{value.toFixed(1)}%</span>
    </div>
  );
}
