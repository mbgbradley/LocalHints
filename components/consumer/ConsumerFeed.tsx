'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { isDealExpired, isDealLive, useStore } from '@/lib/store';
import { DEFAULT_CENTER, formatMiles, haversineMiles } from '@/lib/geo';
import { CATEGORIES, type Business, type Category, type Deal } from '@/types/localhints';
import { dealLabel, isUrgent, relativeTime, THEMES, timeLeft } from '@/components/ui/format';
import { WalletPassModal } from './WalletPassModal';
import { DealSpotterModal } from './DealSpotterModal';
import { ConsumerProfileDrawer } from './ConsumerProfileDrawer';

type Tab = 'explore' | 'wallet';
type Chip = 'all' | 'saved' | Category;

interface FeedItem {
  deal: Deal;
  biz: Business;
  miles: number;
}

export function ConsumerFeed() {
  const { state, now, toggleSave, upvoteSpotted, updateConsumer } = useStore();
  const { consumer, deals, businesses, passes, spotted } = state;

  const [tab, setTab] = useState<Tab>('explore');
  const [chip, setChip] = useState<Chip>('all');
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false);
  const [upvoted, setUpvoted] = useState<Set<string>>(new Set());

  const bizMap = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses]);

  // Every live deal inside the consumer's radius, favorites first, then nearest.
  const nearby = useMemo(() => {
    const out: FeedItem[] = [];
    for (const deal of deals) {
      const biz = bizMap.get(deal.businessId);
      if (!biz || !isDealLive(deal, state, now)) continue;
      const miles = haversineMiles(consumer, biz);
      if (miles > consumer.radiusMiles) continue;
      out.push({ deal, biz, miles });
    }
    const rank = (i: FeedItem) => (consumer.categories.includes(i.biz.category) ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || a.miles - b.miles);
  }, [deals, bizMap, state, now, consumer]);

  const filtered = useMemo(() => {
    if (chip === 'all') return nearby;
    if (chip === 'saved') return nearby.filter((i) => consumer.savedDealIds.includes(i.deal.id));
    return nearby.filter((i) => i.biz.category === chip);
  }, [nearby, chip, consumer.savedDealIds]);

  const endingSoon = useMemo(() => {
    const threeDays = 3 * 86_400_000;
    return nearby
      .filter((i) => new Date(i.deal.expiresAt).getTime() - now < threeDays)
      .sort((a, b) => a.deal.expiresAt.localeCompare(b.deal.expiresAt))
      .slice(0, 6);
  }, [nearby, now]);

  const neighborDeals = useMemo(
    () =>
      spotted.filter(
        (s) => s.status === 'approved' && haversineMiles(consumer, s) <= consumer.radiusMiles,
      ),
    [spotted, consumer],
  );

  const myPasses = useMemo(
    () =>
      passes
        .filter((p) => p.consumerId === consumer.id)
        .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt)),
    [passes, consumer.id],
  );

  const backToDemo = () =>
    updateConsumer({
      lat: DEFAULT_CENTER.lat,
      lng: DEFAULT_CENTER.lng,
      locationLabel: 'Maple Square (demo district)',
    });

  const handleUpvote = (id: string) => {
    if (upvoted.has(id)) return;
    upvoteSpotted(id);
    setUpvoted(new Set(upvoted).add(id));
  };

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[430px] flex-col bg-slate-50 md:my-4 md:overflow-hidden md:rounded-3xl md:border md:border-slate-200 md:shadow-xl">
      {/* Header */}
      <header className="rounded-b-3xl bg-gradient-to-br from-hint-600 to-violet-700 px-5 pb-5 pt-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Hi {consumer.name} 👋</p>
            <h1 className="text-2xl font-black leading-tight">
              {tab === 'explore' ? 'Deals near you' : 'Your wallet'}
            </h1>
            <p className="mt-1 text-xs text-white/75">
              📍 {consumer.locationLabel} · {consumer.radiusMiles} mi
            </p>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-label="Open profile"
            className="flex h-12 flex-col items-center justify-center rounded-2xl bg-white/15 px-3 text-center active:bg-white/25"
          >
            <span className="text-lg font-black leading-none">{consumer.points}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80">pts</span>
          </button>
        </div>

        {tab === 'explore' && (
          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
            <ChipButton active={chip === 'all'} onClick={() => setChip('all')}>
              All
            </ChipButton>
            <ChipButton active={chip === 'saved'} onClick={() => setChip('saved')}>
              ♥ Saved
            </ChipButton>
            {CATEGORIES.map((c) => (
              <ChipButton key={c.id} active={chip === c.id} onClick={() => setChip(c.id)}>
                {c.emoji} {c.label}
              </ChipButton>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 space-y-6 px-4 pb-6 pt-5">
        {tab === 'explore' && (
          <>
            {chip === 'all' && endingSoon.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Ending soon
                </h2>
                <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
                  {endingSoon.map((item) => (
                    <button
                      key={item.deal.id}
                      type="button"
                      onClick={() => setOpenDealId(item.deal.id)}
                      className={`relative w-[260px] shrink-0 snap-center overflow-hidden rounded-3xl bg-gradient-to-br ${THEMES[item.deal.theme].card} p-4 text-left text-white shadow-lg active:scale-[0.98]`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-white/85">
                        <span className="text-lg">{item.biz.emoji}</span>
                        <span className="truncate">{item.biz.name}</span>
                      </div>
                      <p className="mt-3 text-3xl font-black leading-none">{dealLabel(item.deal)}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
                        {item.deal.title}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs font-semibold">
                        <span className="rounded-full bg-white/20 px-2 py-1">
                          ⏱ {timeLeft(item.deal.expiresAt, now)}
                        </span>
                        <span>{formatMiles(item.miles)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">
                {chip === 'saved' ? 'Saved deals' : 'Nearby'}
              </h2>

              {filtered.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center">
                  <p className="text-3xl">🧭</p>
                  <p className="mt-2 font-bold text-slate-800">
                    {chip === 'saved' ? 'No saved deals yet' : 'No deals in range'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {chip === 'saved'
                      ? 'Tap the heart on any deal to save it here.'
                      : 'Widen your radius in your profile, or jump back to the demo district where the sample shops live.'}
                  </p>
                  {chip !== 'saved' && (
                    <button
                      type="button"
                      onClick={backToDemo}
                      className="mt-4 rounded-xl bg-hint-600 px-4 py-3 text-sm font-bold text-white"
                    >
                      Go to demo district
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-3">
                  {filtered.map((item) => {
                    const saved = consumer.savedDealIds.includes(item.deal.id);
                    const hasPass = myPasses.some((p) => p.dealId === item.deal.id);
                    return (
                      <li key={item.deal.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenDealId(item.deal.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setOpenDealId(item.deal.id);
                          }}
                          className="flex cursor-pointer gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:scale-[0.99]"
                        >
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-hint-50 text-3xl">
                            {item.biz.emoji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-500">
                                {item.biz.name} · {formatMiles(item.miles)}
                              </p>
                              <button
                                type="button"
                                aria-label={saved ? 'Remove from saved' : 'Save deal'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSave(item.deal.id);
                                }}
                                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center text-xl"
                              >
                                {saved ? '❤️' : '🤍'}
                              </button>
                            </div>
                            <p className="font-bold leading-snug text-slate-900">{item.deal.title}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-hint-100 px-2.5 py-1 text-xs font-black text-hint-700">
                                {dealLabel(item.deal)}
                              </span>
                              <span
                                className={`text-xs font-semibold ${
                                  isUrgent(item.deal.expiresAt, now) ? 'text-rose-600' : 'text-slate-500'
                                }`}
                              >
                                {timeLeft(item.deal.expiresAt, now)}
                              </span>
                              {hasPass && (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
                                  In wallet
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {chip === 'all' && neighborDeals.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Spotted by neighbors
                </h2>
                <ul className="space-y-3">
                  {neighborDeals.map((s) => (
                    <li key={s.id} className="rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-200">
                      <p className="text-xs font-semibold text-amber-800">
                        {s.businessName} · {formatMiles(haversineMiles(consumer, s))} ·{' '}
                        {relativeTime(s.createdAt, now)}
                      </p>
                      <p className="mt-1 font-bold text-slate-900">{s.title}</p>
                      {s.details && <p className="mt-1 text-sm text-slate-600">{s.details}</p>}
                      <button
                        type="button"
                        onClick={() => handleUpvote(s.id)}
                        disabled={upvoted.has(s.id)}
                        className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-300 disabled:opacity-60"
                      >
                        👍 Still valid · {s.upvotes}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 px-1 text-[11px] text-slate-400">
                  Community tips are not verified by the business.
                </p>
              </section>
            )}
          </>
        )}

        {tab === 'wallet' && (
          <section>
            {myPasses.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center">
                <p className="text-3xl">👛</p>
                <p className="mt-2 font-bold text-slate-800">Your wallet is empty</p>
                <p className="mt-1 text-sm text-slate-500">Add a pass from the Explore tab.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {myPasses.map((pass) => {
                  const deal = deals.find((d) => d.id === pass.dealId);
                  const biz = deal ? bizMap.get(deal.businessId) : undefined;
                  if (!deal || !biz) return null;
                  const status = pass.redeemedAt
                    ? 'redeemed'
                    : isDealExpired(deal, now)
                      ? 'expired'
                      : 'active';
                  return (
                    <li key={pass.id}>
                      <button
                        type="button"
                        onClick={() => setOpenDealId(deal.id)}
                        className={`flex w-full items-center gap-3 rounded-3xl bg-gradient-to-br ${THEMES[deal.theme].card} p-4 text-left text-white shadow-md active:scale-[0.99] ${
                          status === 'active' ? '' : 'opacity-60 saturate-50'
                        }`}
                      >
                        <span className="text-3xl">{biz.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-white/80">
                            {biz.name}
                          </span>
                          <span className="block truncate font-bold">{deal.title}</span>
                          <span className="mt-1 block font-mono text-xs text-white/80">{pass.code}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold capitalize">
                          {status === 'active' ? timeLeft(deal.expiresAt, now) : status}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>

      {/* Thumb-friendly bottom navigation */}
      <nav
        className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
          <NavButton active={tab === 'explore'} icon="🧭" label="Explore" onClick={() => setTab('explore')} />
          <NavButton
            active={tab === 'wallet'}
            icon="👛"
            label="Wallet"
            badge={myPasses.filter((p) => !p.redeemedAt).length}
            onClick={() => setTab('wallet')}
          />
          <NavButton active={false} icon="📸" label="Spot" onClick={() => setSpotOpen(true)} />
          <NavButton active={false} icon="🙂" label="Profile" onClick={() => setProfileOpen(true)} />
        </div>
      </nav>

      <WalletPassModal dealId={openDealId} onClose={() => setOpenDealId(null)} />
      <DealSpotterModal open={spotOpen} onClose={() => setSpotOpen(false)} />
      <ConsumerProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
        active ? 'bg-white text-hint-700' : 'bg-white/15 text-white active:bg-white/25'
      }`}
    >
      {children}
    </button>
  );
}

function NavButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold ${
        active ? 'text-hint-700' : 'text-slate-500'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      {label}
      {badge ? (
        <span className="absolute right-[28%] top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
