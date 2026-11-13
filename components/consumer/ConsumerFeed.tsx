'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isDealLive, isDealRunning, isPassUpgraded, passStatus, useStore } from '@/lib/store';
import { DEFAULT_CENTER, formatMiles, getBrowserLocation, haversineMiles } from '@/lib/geo';
import { CATEGORIES, type Business, type Category, type Deal, type Pass } from '@/types/localhints';
import {
  dealLabel,
  isUrgent,
  nextOpenText,
  readableText,
  relativeTime,
  timeLeft,
} from '@/components/ui/format';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { MapPin } from './DealMap';
import { WalletPassModal } from './WalletPassModal';
import { DealSpotterModal } from './DealSpotterModal';
import { ConsumerProfileDrawer } from './ConsumerProfileDrawer';

// Leaflet touches `window`, so the map is only ever loaded in the browser.
const DealMap = dynamic(() => import('./DealMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-neutral-200" />,
});

type Tab = 'explore' | 'wallet';
type View = 'list' | 'map';
type Chip = 'all' | 'saved' | Category;

interface FeedItem {
  deal: Deal;
  biz: Business;
  miles: number;
}

const NOTE_ICON: Record<string, IconName> = {
  upgrade: 'heart',
  friend: 'user',
  ended: 'close',
  push: 'bell',
  drop: 'pin',
};

function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

export function ConsumerFeed() {
  const { state, now, toggleSave, upvoteSpotted, updateConsumer, clearNotifications, notify } = useStore();
  const { consumer, deals, businesses, passes, spotted, notifications } = state;

  const [tab, setTab] = useState<Tab>('explore');
  const [view, setView] = useState<View>('list');
  const [chip, setChip] = useState<Chip>('all');
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [upvoted, setUpvoted] = useState<Set<string>>(new Set());
  const wide = useIsWide();

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

  // Recurring "slow-hours" deals that are scheduled but closed right now.
  const comingUp = useMemo(() => {
    const out: FeedItem[] = [];
    for (const deal of deals) {
      const biz = bizMap.get(deal.businessId);
      if (!biz || !deal.recurring || !isDealRunning(deal, state, now) || isDealLive(deal, state, now)) continue;
      const miles = haversineMiles(consumer, biz);
      if (miles <= consumer.radiusMiles) out.push({ deal, biz, miles });
    }
    return out.sort((a, b) => a.miles - b.miles);
  }, [deals, bizMap, state, now, consumer]);

  const filtered = useMemo(() => {
    if (chip === 'all') return nearby;
    if (chip === 'saved') return nearby.filter((i) => consumer.savedDealIds.includes(i.deal.id));
    return nearby.filter((i) => i.biz.category === chip);
  }, [nearby, chip, consumer.savedDealIds]);

  // One map pin per business that has at least one deal in the current filter.
  const pins = useMemo<MapPin[]>(() => {
    const byBiz = new Map<string, FeedItem[]>();
    for (const item of filtered) byBiz.set(item.biz.id, [...(byBiz.get(item.biz.id) ?? []), item]);
    return Array.from(byBiz.values()).map((items) => ({
      id: items[0].biz.id,
      emoji: items[0].biz.emoji,
      label: dealLabel(items[0].deal),
      extra: items.length - 1,
      lat: items[0].biz.lat,
      lng: items[0].biz.lng,
    }));
  }, [filtered]);

  const selectedItems = useMemo(
    () => (selectedBizId ? filtered.filter((i) => i.biz.id === selectedBizId) : []),
    [filtered, selectedBizId],
  );

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

  const walletRows = useMemo(() => {
    const rows = myPasses.flatMap((pass) => {
      const deal = deals.find((d) => d.id === pass.dealId);
      const biz = deal ? bizMap.get(deal.businessId) : undefined;
      if (!deal || !biz) return [];
      return [{ pass, deal, biz, status: passStatus(deal, pass, now) }];
    });
    const usable = (s: string) => s === 'active' || s === 'scheduled' || s === 'paused';
    return {
      active: rows.filter((r) => usable(r.status)),
      expired: rows.filter((r) => !usable(r.status)),
    };
  }, [myPasses, deals, bizMap, now]);

  const backToDemo = () =>
    updateConsumer({
      lat: DEFAULT_CENTER.lat,
      lng: DEFAULT_CENTER.lng,
      locationLabel: 'Maple Square (demo district)',
    });

  const locate = async () => {
    setLocating(true);
    try {
      const pos = await getBrowserLocation();
      updateConsumer({ lat: pos.lat, lng: pos.lng, locationLabel: 'Your current location' });
      notify('Location updated. The sample shops are in a demo district.', 'info');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not get your location.', 'error');
    } finally {
      setLocating(false);
    }
  };

  const handleUpvote = (id: string) => {
    if (upvoted.has(id)) return;
    upvoteSpotted(id);
    setUpvoted(new Set(upvoted).add(id));
  };

  const exploring = tab === 'explore';
  const showList = !exploring || wide || view === 'list';
  const showMap = exploring && (wide || view === 'map');

  const mapPanel = (
    <div className="relative h-[calc(100dvh-17rem)] min-h-[380px] overflow-hidden rounded-3xl ring-1 ring-neutral-200 lg:h-[calc(100dvh-8rem)]">
      <DealMap
        pins={pins}
        center={{ lat: consumer.lat, lng: consumer.lng }}
        radiusMiles={consumer.radiusMiles}
        selectedId={selectedBizId}
        onSelect={setSelectedBizId}
        onLocate={locate}
        locating={locating}
      />
      {pins.length === 0 && (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-2xl bg-white/95 p-3 text-center text-sm font-medium text-neutral-600 shadow-lg">
          No deals in range. Widen your radius or jump to the demo district.
        </div>
      )}
      {selectedItems.length > 0 && (
        <div className="absolute inset-x-3 bottom-3 z-[600] max-h-[55%] overflow-y-auto rounded-3xl bg-white p-3 shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <p className="truncate text-sm font-semibold text-neutral-900">
              {selectedItems[0].biz.emoji} {selectedItems[0].biz.name}
              <span className="font-normal text-neutral-500"> · {formatMiles(selectedItems[0].miles)}</span>
            </p>
            <button
              type="button"
              onClick={() => setSelectedBizId(null)}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-1.5">
            {selectedItems.map((item) => (
              <li key={item.deal.id}>
                <button
                  type="button"
                  onClick={() => setOpenDealId(item.deal.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-neutral-50 p-3 text-left active:bg-neutral-100"
                >
                  <span
                    className="rounded-lg px-2 py-1 text-xs font-extrabold"
                    style={{ backgroundColor: item.deal.brandColor, color: readableText(item.deal.brandColor) }}
                  >
                    {dealLabel(item.deal)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-900">{item.deal.title}</span>
                    <span className="block text-xs text-neutral-500">{timeLeft(item.deal.expiresAt, now)}</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 text-neutral-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] bg-neutral-50 pb-24 lg:max-w-6xl lg:pb-10">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-neutral-50/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-white">
              <Icon name="pin" className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[17px] font-bold tracking-tight text-neutral-900">LocalHints</span>
          </div>

          <div className="flex items-center gap-2">
            <nav className="mr-2 hidden items-center gap-1 lg:flex" aria-label="Sections">
              <TopTab active={exploring} onClick={() => setTab('explore')}>
                Explore
              </TopTab>
              <TopTab active={tab === 'wallet'} onClick={() => setTab('wallet')}>
                Wallet
                {walletRows.active.length + notifications.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-neutral-900 px-1.5 text-[10px] font-bold text-white">
                    {walletRows.active.length + notifications.length}
                  </span>
                )}
              </TopTab>
              <button
                type="button"
                onClick={() => setSpotOpen(true)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Spot a deal
              </button>
            </nav>
            <Link
              href="/business"
              className="hidden rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 sm:block"
            >
              For businesses
            </Link>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label="Open profile"
              className="flex items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 text-sm font-semibold text-neutral-800 ring-1 ring-neutral-200 active:bg-neutral-100"
            >
              <span>{consumer.points} pts</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                {consumer.name.slice(0, 1).toUpperCase()}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 lg:px-6">
        {/* Title + location */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight text-neutral-900">
              {exploring ? 'Deals near you' : 'Your wallet'}
            </h1>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="mt-1 flex items-center gap-1 text-sm text-neutral-500"
            >
              <Icon name="pin" className="h-4 w-4" />
              <span className="truncate">{consumer.locationLabel}</span>
              <span>· within {consumer.radiusMiles} mi</span>
            </button>
          </div>

          {exploring && !wide && (
            <div className="flex rounded-full bg-neutral-200/70 p-1" role="tablist" aria-label="View">
              <ViewButton active={view === 'list'} onClick={() => setView('list')} icon="list" label="List" />
              <ViewButton active={view === 'map'} onClick={() => setView('map')} icon="map" label="Map" />
            </div>
          )}
        </div>

        {exploring && (
          <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <ChipButton active={chip === 'all'} onClick={() => setChip('all')}>
              All {nearby.length > 0 && <span className="ml-1 opacity-60">{nearby.length}</span>}
            </ChipButton>
            <ChipButton active={chip === 'saved'} onClick={() => setChip('saved')}>
              Saved
            </ChipButton>
            {CATEGORIES.map((c) => (
              <ChipButton key={c.id} active={chip === c.id} onClick={() => setChip(c.id)}>
                {c.emoji} {c.label}
              </ChipButton>
            ))}
          </div>
        )}

        <div className={`mt-5 ${exploring && wide ? 'grid grid-cols-[440px_minmax(0,1fr)] items-start gap-6' : ''}`}>
          {showList && (
            <main className="min-w-0 space-y-7">
              {exploring && (
                <>
                  {chip === 'all' && endingSoon.length > 0 && (
                    <section>
                      <SectionTitle>Ending soon</SectionTitle>
                      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 lg:mx-0 lg:px-0">
                        {endingSoon.map((item) => (
                          <button
                            key={item.deal.id}
                            type="button"
                            onClick={() => setOpenDealId(item.deal.id)}
                            style={{ backgroundColor: item.deal.brandColor, color: readableText(item.deal.brandColor) }}
                            className="relative w-[212px] shrink-0 snap-start overflow-hidden rounded-3xl p-4 text-left active:scale-[0.98]"
                          >
                            <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-black/20" />
                            <span className="relative block">
                              <span className="flex items-center gap-1.5 text-xs font-semibold opacity-90">
                                <span className="text-base">{item.biz.emoji}</span>
                                <span className="truncate">{item.biz.name}</span>
                              </span>
                              <span className="mt-4 block text-3xl font-extrabold leading-none tracking-tight">
                                {dealLabel(item.deal)}
                              </span>
                              <span className="mt-1.5 line-clamp-2 block text-sm font-medium leading-snug opacity-95">
                                {item.deal.title}
                              </span>
                              <span className="mt-3 block text-xs font-semibold opacity-85">
                                {timeLeft(item.deal.expiresAt, now)} · {formatMiles(item.miles)}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <SectionTitle>{chip === 'saved' ? 'Saved deals' : 'Nearby'}</SectionTitle>
                    {filtered.length === 0 ? (
                      <EmptyState
                        title={chip === 'saved' ? 'No saved deals yet' : 'No deals in range'}
                        body={
                          chip === 'saved'
                            ? 'Tap the heart on any deal to keep it here.'
                            : 'Widen your radius in your profile, or jump back to the demo district where the sample shops live.'
                        }
                        action={chip !== 'saved' ? { label: 'Go to demo district', onClick: backToDemo } : undefined}
                      />
                    ) : (
                      <ul className="space-y-2.5">
                        {filtered.map((item) => (
                          <DealRow
                            key={item.deal.id}
                            item={item}
                            now={now}
                            saved={consumer.savedDealIds.includes(item.deal.id)}
                            hasPass={myPasses.some((p) => p.dealId === item.deal.id)}
                            onOpen={() => setOpenDealId(item.deal.id)}
                            onSave={() => toggleSave(item.deal.id)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>

                  {chip === 'all' && comingUp.length > 0 && (
                    <section>
                      <SectionTitle>Opens soon</SectionTitle>
                      <ul className="space-y-2.5">
                        {comingUp.map(({ deal, biz, miles }) => (
                          <li key={deal.id}>
                            <button
                              type="button"
                              onClick={() => setOpenDealId(deal.id)}
                              className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left ring-1 ring-neutral-200"
                            >
                              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-2xl">
                                {biz.emoji}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs text-neutral-500">
                                  {biz.name} · {formatMiles(miles)}
                                </span>
                                <span className="block truncate font-semibold text-neutral-900">{deal.title}</span>
                              </span>
                              <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                                {deal.recurring ? (nextOpenText(deal.recurring, now) ?? 'Scheduled') : 'Scheduled'}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {chip === 'all' && neighborDeals.length > 0 && (
                    <section>
                      <SectionTitle>Spotted by neighbors</SectionTitle>
                      <ul className="space-y-2.5">
                        {neighborDeals.map((s) => (
                          <li key={s.id} className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/70">
                            <p className="text-xs font-medium text-amber-800">
                              {s.businessName} · {formatMiles(haversineMiles(consumer, s))} · {relativeTime(s.createdAt, now)}
                            </p>
                            <p className="mt-1 font-semibold text-neutral-900">{s.title}</p>
                            {s.details && <p className="mt-1 text-sm text-neutral-600">{s.details}</p>}
                            <button
                              type="button"
                              onClick={() => handleUpvote(s.id)}
                              disabled={upvoted.has(s.id)}
                              className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 disabled:opacity-60"
                            >
                              Still valid · {s.upvotes}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] text-neutral-400">Community tips are not verified by the business.</p>
                    </section>
                  )}

                  <section className="rounded-3xl bg-neutral-900 p-5 text-white">
                    <p className="text-lg font-bold">Own a local business?</p>
                    <p className="mt-1 text-sm text-neutral-300">
                      Put your deals in customers&apos; phones. Free to start, set up in minutes.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href="/business"
                        className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900"
                      >
                        List your business
                      </Link>
                      <Link
                        href="/admin"
                        className="rounded-full px-4 py-2.5 text-sm font-semibold text-neutral-300 ring-1 ring-neutral-700"
                      >
                        Admin sign in
                      </Link>
                    </div>
                  </section>
                </>
              )}

              {tab === 'wallet' && (
                <>
                  {notifications.length > 0 && (
                    <section>
                      <div className="mb-2.5 flex items-center justify-between">
                        <SectionTitle inline>Wallet updates</SectionTitle>
                        <button type="button" onClick={clearNotifications} className="text-xs font-semibold text-neutral-500">
                          Clear
                        </button>
                      </div>
                      <ul className="space-y-2">
                        {notifications.map((n) => {
                          const body = (
                            <>
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                                <Icon name={NOTE_ICON[n.kind] ?? 'bell'} className="h-[18px] w-[18px]" />
                              </span>
                              <span className="min-w-0 flex-1 text-left">
                                <span className="block text-sm font-medium leading-snug">{n.message}</span>
                                <span className="mt-0.5 block text-[11px] text-white/60">
                                  {relativeTime(n.createdAt, now)}
                                  {n.dealId ? ' · Tap to view' : ''}
                                </span>
                              </span>
                            </>
                          );
                          return (
                            <li key={n.id}>
                              {n.dealId ? (
                                <button
                                  type="button"
                                  onClick={() => setOpenDealId(n.dealId ?? null)}
                                  className="flex w-full items-center gap-3 rounded-2xl bg-neutral-900 p-3 text-white"
                                >
                                  {body}
                                </button>
                              ) : (
                                <div className="flex items-center gap-3 rounded-2xl bg-neutral-900 p-3 text-white">{body}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  {myPasses.length === 0 ? (
                    <EmptyState title="Your wallet is empty" body="Add a pass from the Explore tab." />
                  ) : (
                    <>
                      <WalletSection title="Passes" rows={walletRows.active} now={now} onOpen={setOpenDealId} />
                      {walletRows.expired.length > 0 && (
                        <WalletSection title="Expired passes" rows={walletRows.expired} now={now} onOpen={setOpenDealId} />
                      )}
                    </>
                  )}
                </>
              )}
            </main>
          )}

          {showMap && <div className={wide ? 'sticky top-20' : ''}>{mapPanel}</div>}
        </div>
      </div>

      {/* Thumb-friendly bottom navigation (phones) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-neutral-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-4">
          <NavButton active={exploring} icon="compass" label="Explore" onClick={() => setTab('explore')} />
          <NavButton
            active={tab === 'wallet'}
            icon="wallet"
            label="Wallet"
            badge={walletRows.active.length + notifications.length}
            onClick={() => setTab('wallet')}
          />
          <NavButton active={false} icon="camera" label="Spot" onClick={() => setSpotOpen(true)} />
          <NavButton active={false} icon="user" label="Profile" onClick={() => setProfileOpen(true)} />
        </div>
      </nav>

      <WalletPassModal
        dealId={openDealId}
        onClose={() => setOpenDealId(null)}
        onOpenDeal={(id) => setOpenDealId(id)}
      />
      <DealSpotterModal open={spotOpen} onClose={() => setSpotOpen(false)} />
      <ConsumerProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

function SectionTitle({ children, inline }: { children: ReactNode; inline?: boolean }) {
  return (
    <h2 className={`${inline ? '' : 'mb-2.5'} text-[13px] font-semibold uppercase tracking-wider text-neutral-500`}>
      {children}
    </h2>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-7 text-center">
      <p className="font-semibold text-neutral-900">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-500">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function DealRow({
  item,
  now,
  saved,
  hasPass,
  onOpen,
  onSave,
}: {
  item: FeedItem;
  now: number;
  saved: boolean;
  hasPass: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const { deal, biz, miles } = item;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpen();
        }}
        className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-neutral-200 transition active:scale-[0.99]"
      >
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl"
          style={{ backgroundColor: `${deal.brandColor}1f` }}
        >
          {biz.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-neutral-500">
            {biz.name} · {formatMiles(miles)}
          </p>
          <p className="truncate text-[15px] font-semibold leading-snug text-neutral-900">{deal.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] font-extrabold"
              style={{ backgroundColor: deal.brandColor, color: readableText(deal.brandColor) }}
            >
              {dealLabel(deal)}
            </span>
            {deal.shareUpgrade && (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                Share → {dealLabel(deal, deal.shareUpgrade.upgradedValue)}
              </span>
            )}
            {deal.punchVisits > 1 && (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                {deal.punchVisits}-visit card
              </span>
            )}
            <span className={`text-[11px] font-medium ${isUrgent(deal.expiresAt, now) ? 'text-rose-600' : 'text-neutral-500'}`}>
              {timeLeft(deal.expiresAt, now)}
            </span>
            {hasPass && (
              <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-700">
                In wallet
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label={saved ? 'Remove from saved' : 'Save deal'}
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            saved ? 'text-rose-500' : 'text-neutral-300'
          }`}
        >
          <Icon name="heart" filled={saved} className="h-5 w-5" />
        </button>
      </div>
    </li>
  );
}

function WalletSection({
  title,
  rows,
  now,
  onOpen,
}: {
  title: string;
  rows: Array<{
    pass: Pass;
    deal: Deal;
    biz: Business;
    status: ReturnType<typeof passStatus>;
  }>;
  now: number;
  onOpen: (dealId: string) => void;
}) {
  if (rows.length === 0 && title === 'Passes') {
    return (
      <section>
        <SectionTitle>{title}</SectionTitle>
        <p className="rounded-2xl bg-white p-4 text-sm text-neutral-500 ring-1 ring-neutral-200">
          No active passes right now.
        </p>
      </section>
    );
  }
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-3">
        {rows.map(({ pass, deal, biz, status }) => {
          const dead = status === 'complete' || status === 'expired' || status === 'voided';
          const upgraded = isPassUpgraded(deal, pass);
          const badge =
            status === 'active'
              ? deal.punchVisits > 1
                ? `${pass.stamps}/${deal.punchVisits} stamps`
                : timeLeft(deal.expiresAt, now)
              : status === 'voided'
                ? 'Ended by merchant'
                : status === 'complete'
                  ? 'Redeemed'
                  : status === 'scheduled'
                    ? 'Scheduled'
                    : status;
          return (
            <li key={pass.id}>
              <button
                type="button"
                onClick={() => onOpen(deal.id)}
                style={{ backgroundColor: deal.brandColor, color: readableText(deal.brandColor) }}
                className={`relative flex w-full items-center gap-3 overflow-hidden rounded-3xl p-4 text-left active:scale-[0.99] ${
                  dead ? 'opacity-55 saturate-50' : ''
                }`}
              >
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-black/20" />
                <span className="relative text-3xl">{biz.emoji}</span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium opacity-80">{biz.name}</span>
                  <span className="block truncate font-bold">
                    {dealLabel(deal, upgraded && deal.shareUpgrade ? deal.shareUpgrade.upgradedValue : undefined)} · {deal.title}
                  </span>
                  <span className="mt-1 block font-mono text-xs opacity-80">{pass.code}</span>
                </span>
                <span className="relative shrink-0 rounded-full bg-black/20 px-2.5 py-1 text-xs font-semibold capitalize">
                  {badge}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-100'
      }`}
    >
      {children}
    </button>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
        active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}

function TopTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
        active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
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
  icon: IconName;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
        active ? 'text-neutral-900' : 'text-neutral-400'
      }`}
    >
      <Icon name={icon} className="h-6 w-6" />
      {label}
      {badge ? (
        <span className="absolute right-[26%] top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
