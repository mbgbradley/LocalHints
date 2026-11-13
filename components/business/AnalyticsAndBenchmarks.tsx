'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { AVG_TICKET, CATEGORY_BENCHMARKS } from '@/data/seed';
import { dealLabel } from '@/components/ui/format';
import { TIER_LIMITS, type Business } from '@/types/localhints';

interface AnalyticsAndBenchmarksProps {
  business: Business;
  onUpgrade: () => void;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : (n / d) * 100;
}

export function AnalyticsAndBenchmarks({ business, onUpgrade }: AnalyticsAndBenchmarksProps) {
  const { state } = useStore();
  const hasBenchmarks = TIER_LIMITS[business.tier].benchmarks;

  const rows = useMemo(() => {
    const bizDeals = state.deals.filter((d) => d.businessId === business.id);
    return bizDeals.map((deal) => {
      const dealPasses = state.passes.filter((p) => p.dealId === deal.id);
      const claims = dealPasses.length;
      const redeemed = dealPasses.filter((p) => p.redeemedAt).length;
      return { deal, views: deal.viewCount, claims, redeemed };
    });
  }, [state.deals, state.passes, business.id]);

  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + r.views,
      claims: acc.claims + r.claims,
      redeemed: acc.redeemed + r.redeemed,
    }),
    { views: 0, claims: 0, redeemed: 0 },
  );

  const claimRate = pct(totals.claims, totals.views);
  const redeemRate = pct(totals.redeemed, totals.claims);
  const revenue = totals.redeemed * AVG_TICKET[business.category];
  const bench = CATEGORY_BENCHMARKS[business.category];
  const maxClaims = Math.max(1, ...rows.map((r) => r.claims));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Deal views" value={totals.views.toLocaleString()} />
        <Kpi label="Passes claimed" value={totals.claims.toLocaleString()} sub={`${claimRate.toFixed(1)}% of views`} />
        <Kpi label="Redeemed" value={totals.redeemed.toLocaleString()} sub={`${redeemRate.toFixed(0)}% of claims`} />
        <Kpi
          label="Revenue influenced"
          value={`$${revenue.toLocaleString()}`}
          sub={`est. at $${AVG_TICKET[business.category]} avg ticket`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Deal performance</h2>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Publish a deal to see results here.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {rows.map((r) => (
                <li key={r.deal.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{r.deal.title}</p>
                    <span className="shrink-0 text-xs font-bold text-hint-700">{dealLabel(r.deal)}</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="relative h-full rounded-full bg-hint-300"
                      style={{ width: `${(r.claims / maxClaims) * 100}%` }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-hint-600"
                        style={{ width: `${r.claims === 0 ? 0 : (r.redeemed / r.claims) * 100}%` }}
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.views} views · {r.claims} claimed · {r.redeemed} redeemed
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-400">Dark bar = redeemed. Light bar = claimed but not yet redeemed.</p>
        </section>

        <section className="relative rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Neighborhood benchmarks</h2>
          <p className="mt-1 text-sm text-slate-600">
            How you compare with other {business.category} businesses nearby.
          </p>

          <div className={`mt-4 space-y-5 ${hasBenchmarks ? '' : 'pointer-events-none select-none blur-sm'}`}>
            <Benchmark label="Claim rate (claims / views)" you={claimRate} avg={bench.claimRate} />
            <Benchmark label="Redemption rate (redeemed / claims)" you={redeemRate} avg={bench.redeemRate} />
          </div>

          {!hasBenchmarks && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-white/70 p-6 text-center">
              <p className="text-3xl">🔒</p>
              <p className="mt-2 font-bold text-slate-900">Benchmarks are a Pro feature</p>
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
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Benchmark({ label, you, avg }: { label: string; you: number; avg: number }) {
  const max = Math.max(you, avg, 1) * 1.15;
  const better = you >= avg;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className={`text-xs font-bold ${better ? 'text-emerald-600' : 'text-amber-600'}`}>
          {better ? 'Above' : 'Below'} average
        </p>
      </div>
      <div className="mt-2 space-y-1.5">
        <Bar caption="You" value={you} max={max} color="bg-hint-600" />
        <Bar caption="Avg" value={avg} max={max} color="bg-slate-400" />
      </div>
    </div>
  );
}

function Bar({ caption, value, max, color }: { caption: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-xs font-semibold text-slate-500">{caption}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-bold text-slate-700">{value.toFixed(1)}%</span>
    </div>
  );
}
