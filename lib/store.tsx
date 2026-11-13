'use client';

/**
 * LocalHints state layer.
 *
 * This is the ONLY file that knows where data lives (browser localStorage in the
 * prototype). To move to Supabase + Stripe, replace the bodies of the actions in
 * `actions` below with API calls; the components only ever call `useStore()`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { buildSeed, DEMO_OWNER_ID } from '@/data/seed';
import {
  BLAST_MAX_CHARS,
  BLAST_MIN_CHARS,
  FREE_DEAL_DURATION_DAYS,
  POINTS,
  TIER_LIMITS,
  type AppState,
  type Blast,
  type Business,
  type Consumer,
  type CreateDealInput,
  type Deal,
  type DealStatus,
  type ModerationStatus,
  type Pass,
  type RegisterBusinessInput,
  type Role,
  type SpotDealInput,
  type Tier,
} from '@/types/localhints';

const STORAGE_KEY = 'localhints:v1';
const DAY = 86_400_000;

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function fail<T = undefined>(error: string): Result<T> {
  return { ok: false, error };
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function shortCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// ---------------------------------------------------------------------------
// Pure selectors (exported so components and a future server can share them)
// ---------------------------------------------------------------------------

export function claimsFor(state: AppState, dealId: string): Pass[] {
  return state.passes.filter((p) => p.dealId === dealId);
}

export function isDealExpired(deal: Deal, now: number): boolean {
  return new Date(deal.expiresAt).getTime() <= now;
}

/** A deal is "live" for consumers when it is unpaused, unexpired, under its claim cap and its business is approved. */
export function isDealLive(deal: Deal, state: AppState, now: number): boolean {
  if (deal.status !== 'live') return false;
  if (isDealExpired(deal, now)) return false;
  const biz = state.businesses.find((b) => b.id === deal.businessId);
  if (!biz || biz.status !== 'approved') return false;
  if (deal.claimLimit !== null && claimsFor(state, deal.id).length >= deal.claimLimit) return false;
  return true;
}

/** Deals that count against a business's tier cap: unpaused and unexpired. */
export function countActiveDeals(state: AppState, businessId: string, now: number): number {
  return state.deals.filter(
    (d) => d.businessId === businessId && d.status === 'live' && !isDealExpired(d, now),
  ).length;
}

export function blastsThisMonth(state: AppState, businessId: string, now: number): number {
  const ref = new Date(now);
  return state.blasts.filter((b) => {
    if (b.businessId !== businessId) return false;
    const sent = new Date(b.sentAt);
    return sent.getFullYear() === ref.getFullYear() && sent.getMonth() === ref.getMonth();
  }).length;
}

/** Simulated audience size. A real implementation would be a PostGIS ST_DWithin count. */
export function estimateReach(radiusMiles: number): number {
  return Math.round(60 + radiusMiles * 70);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ToastTone = 'success' | 'error' | 'info';
interface ToastMsg {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface StoreActions {
  notify: (message: string, tone?: ToastTone) => void;
  setRole: (role: Role) => void;
  setActiveBusiness: (id: string) => void;
  updateConsumer: (patch: Partial<Consumer>) => void;
  toggleSave: (dealId: string) => void;
  trackView: (dealId: string) => void;
  claimDeal: (dealId: string) => Result<Pass>;
  redeemPass: (passId: string) => Result;
  redeemByCode: (businessId: string, code: string) => Result<{ dealTitle: string }>;
  spotDeal: (input: SpotDealInput) => Result;
  upvoteSpotted: (id: string) => void;
  registerBusiness: (input: RegisterBusinessInput) => Result<Business>;
  upgradeTier: (businessId: string, tier: Tier) => void;
  createDeal: (input: CreateDealInput) => Result<Deal>;
  setDealStatus: (dealId: string, status: DealStatus) => void;
  sendBlast: (businessId: string, message: string, radiusMiles: number) => Result<Blast>;
  approveBusiness: (id: string) => void;
  suspendBusiness: (id: string) => void;
  reinstateBusiness: (id: string) => void;
  moderateSpotted: (id: string, approve: boolean) => void;
  resetDemo: () => void;
}

export interface StoreApi extends StoreActions {
  state: AppState;
  /** Wall clock in ms, refreshed every 30 seconds so countdowns stay current. */
  now: number;
  ownedBusinesses: Business[];
  activeBusiness: Business | null;
}

const StoreContext = createContext<StoreApi | null>(null);

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

const TOAST_STYLES: Record<ToastTone, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
  info: 'bg-slate-900 text-white',
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState<number>(0);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const ref = useRef<AppState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage (or seed) on the client only, avoiding SSR mismatches.
  useEffect(() => {
    let loaded: AppState | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        if (parsed && parsed.version === 1) loaded = parsed;
      }
    } catch {
      loaded = null;
    }
    const initial = loaded ?? buildSeed(Date.now());
    ref.current = initial;
    setState(initial);
    setNow(Date.now());
  }, []);

  // Persist on every change.
  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the prototype keeps working in memory */
    }
  }, [state]);

  // Tick the clock for countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const commit = useCallback((updater: (s: AppState) => AppState) => {
    const current = ref.current;
    if (!current) return;
    const next = updater(current);
    ref.current = next;
    setState(next);
  }, []);

  const actions = useMemo<StoreActions>(() => {
    const get = (): AppState => {
      if (!ref.current) throw new Error('Store not hydrated');
      return ref.current;
    };

    const patchBusiness = (id: string, patch: Partial<Business>) =>
      commit((s) => ({
        ...s,
        businesses: s.businesses.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }));

    const finishRedeem = (passId: string, consumerId: string, at: number) =>
      commit((s) => ({
        ...s,
        passes: s.passes.map((p) =>
          p.id === passId ? { ...p, redeemedAt: new Date(at).toISOString() } : p,
        ),
        consumer:
          s.consumer.id === consumerId
            ? { ...s.consumer, points: s.consumer.points + POINTS.redeem }
            : s.consumer,
      }));

    return {
      notify,

      setRole: (role) =>
        commit((s) => {
          const owned = s.businesses.filter((b) => b.ownerId === DEMO_OWNER_ID);
          const activeValid = owned.some((b) => b.id === s.activeBusinessId);
          return {
            ...s,
            role,
            activeBusinessId: activeValid ? s.activeBusinessId : (owned[0]?.id ?? null),
          };
        }),

      setActiveBusiness: (id) => commit((s) => ({ ...s, activeBusinessId: id })),

      updateConsumer: (patch) => commit((s) => ({ ...s, consumer: { ...s.consumer, ...patch } })),

      toggleSave: (dealId) =>
        commit((s) => {
          const saved = s.consumer.savedDealIds.includes(dealId);
          return {
            ...s,
            consumer: {
              ...s.consumer,
              savedDealIds: saved
                ? s.consumer.savedDealIds.filter((id) => id !== dealId)
                : [...s.consumer.savedDealIds, dealId],
            },
          };
        }),

      trackView: (dealId) =>
        commit((s) => ({
          ...s,
          deals: s.deals.map((d) => (d.id === dealId ? { ...d, viewCount: d.viewCount + 1 } : d)),
        })),

      claimDeal: (dealId) => {
        const s = get();
        const t = Date.now();
        const deal = s.deals.find((d) => d.id === dealId);
        if (!deal) return fail('That deal no longer exists.');
        if (!isDealLive(deal, s, t)) return fail('This deal is no longer available.');
        if (s.passes.some((p) => p.dealId === dealId && p.consumerId === s.consumer.id)) {
          return fail('You already have this pass.');
        }
        const pass: Pass = {
          id: uid('pass'),
          dealId,
          consumerId: s.consumer.id,
          code: `${deal.code}-${shortCode()}`,
          claimedAt: new Date(t).toISOString(),
          redeemedAt: null,
        };
        commit((st) => ({
          ...st,
          passes: [pass, ...st.passes],
          consumer: { ...st.consumer, points: st.consumer.points + POINTS.claim },
        }));
        notify(`Pass added to your wallet (+${POINTS.claim} pts)`);
        return ok(pass);
      },

      redeemPass: (passId) => {
        const s = get();
        const t = Date.now();
        const pass = s.passes.find((p) => p.id === passId);
        if (!pass) return fail('Pass not found.');
        if (pass.redeemedAt) return fail('This pass was already redeemed.');
        const deal = s.deals.find((d) => d.id === pass.dealId);
        if (!deal || isDealExpired(deal, t)) return fail('This pass has expired.');
        finishRedeem(pass.id, pass.consumerId, t);
        notify(`Redeemed! Enjoy (+${POINTS.redeem} pts)`);
        return ok(undefined);
      },

      redeemByCode: (businessId, code) => {
        const s = get();
        const t = Date.now();
        const needle = code.trim().toUpperCase();
        if (needle.length < 4) return fail('Enter the full pass code.');
        const bizDealIds = new Set(
          s.deals.filter((d) => d.businessId === businessId).map((d) => d.id),
        );
        const pass = s.passes.find(
          (p) => p.code.toUpperCase() === needle && bizDealIds.has(p.dealId),
        );
        if (!pass) return fail('No pass matches that code for this business.');
        if (pass.redeemedAt) return fail('That pass was already redeemed.');
        const deal = s.deals.find((d) => d.id === pass.dealId);
        if (!deal) return fail('Deal not found.');
        if (isDealExpired(deal, t)) return fail('That pass has expired.');
        finishRedeem(pass.id, pass.consumerId, t);
        notify('Pass redeemed');
        return ok({ dealTitle: deal.title });
      },

      spotDeal: (input) => {
        const name = input.businessName.trim();
        const title = input.title.trim();
        if (name.length < 2) return fail('Add the business name.');
        if (title.length < 6) return fail('Describe the deal in a few more words.');
        const s = get();
        const spot = {
          id: uid('spot'),
          userId: s.consumer.id,
          businessName: name,
          title,
          details: input.details.trim(),
          category: input.category,
          lat: input.lat,
          lng: input.lng,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
          upvotes: 0,
        };
        commit((st) => ({ ...st, spotted: [spot, ...st.spotted] }));
        notify(`Thanks! We will review it (+${POINTS.spotApproved} pts if approved)`);
        return ok(undefined);
      },

      upvoteSpotted: (id) =>
        commit((s) => ({
          ...s,
          spotted: s.spotted.map((d) => (d.id === id ? { ...d, upvotes: d.upvotes + 1 } : d)),
        })),

      registerBusiness: (input) => {
        const name = input.name.trim();
        if (name.length < 2) return fail('Enter your business name.');
        if (input.address.trim().length < 4) return fail('Enter a street address.');
        const biz: Business = {
          id: uid('biz'),
          ownerId: DEMO_OWNER_ID,
          name,
          category: input.category,
          emoji: input.emoji,
          address: input.address.trim(),
          lat: input.lat,
          lng: input.lng,
          blurb: input.blurb.trim(),
          tier: 'free',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        commit((s) => ({
          ...s,
          businesses: [...s.businesses, biz],
          activeBusinessId: biz.id,
        }));
        notify('Submitted for review');
        return ok(biz);
      },

      upgradeTier: (businessId, tier) => {
        patchBusiness(businessId, { tier });
        notify(tier === 'pro' ? 'Welcome to Pro!' : 'Switched to the Free plan', 'info');
      },

      createDeal: (input) => {
        const s = get();
        const t = Date.now();
        const biz = s.businesses.find((b) => b.id === input.businessId);
        if (!biz) return fail('Business not found.');
        if (biz.status !== 'approved') {
          return fail('Your business must be approved before you can publish deals.');
        }
        const limits = TIER_LIMITS[biz.tier];
        if (countActiveDeals(s, biz.id, t) >= limits.maxActiveDeals) {
          return fail(
            biz.tier === 'free'
              ? 'The Free plan allows 1 active deal. Pause it or upgrade to Pro.'
              : `You have reached the limit of ${limits.maxActiveDeals} active deals.`,
          );
        }
        const title = input.title.trim();
        if (title.length < 3 || title.length > 60) return fail('Title must be 3 to 60 characters.');
        if (!limits.customCoupons && (input.kind === 'bogo' || input.kind === 'freebie')) {
          return fail('BOGO and free-gift coupons are a Pro feature.');
        }
        let value = Math.round(input.value);
        if (input.kind === 'percent' && (value < 1 || value > 90)) {
          return fail('Percent off must be between 1 and 90.');
        }
        if (input.kind === 'amount' && (value < 1 || value > 500)) {
          return fail('Amount off must be between $1 and $500.');
        }
        if (input.kind === 'bogo') value = 1;
        if (input.kind === 'freebie') value = 0;
        const code = input.code.trim().toUpperCase();
        if (!/^[A-Z0-9]{3,12}$/.test(code)) return fail('Code must be 3 to 12 letters or numbers.');

        const durationDays = limits.customCoupons
          ? Math.min(30, Math.max(1, Math.round(input.durationDays)))
          : FREE_DEAL_DURATION_DAYS;
        const claimLimit =
          limits.customCoupons && input.claimLimit && input.claimLimit > 0
            ? Math.round(input.claimLimit)
            : null;

        const deal: Deal = {
          id: uid('deal'),
          businessId: biz.id,
          title,
          description: input.description.trim(),
          kind: input.kind,
          value,
          terms: input.terms.trim(),
          code,
          createdAt: new Date(t).toISOString(),
          expiresAt: new Date(t + durationDays * DAY).toISOString(),
          status: 'live',
          claimLimit,
          viewCount: 0,
          theme: limits.customCoupons ? input.theme : 'indigo',
        };
        commit((st) => ({ ...st, deals: [deal, ...st.deals] }));
        notify('Deal published');
        return ok(deal);
      },

      setDealStatus: (dealId, status) => {
        commit((s) => ({
          ...s,
          deals: s.deals.map((d) => (d.id === dealId ? { ...d, status } : d)),
        }));
        notify(status === 'paused' ? 'Deal paused' : 'Deal is live again', 'info');
      },

      sendBlast: (businessId, message, radiusMiles) => {
        const s = get();
        const t = Date.now();
        const biz = s.businesses.find((b) => b.id === businessId);
        if (!biz) return fail('Business not found.');
        if (biz.status !== 'approved') return fail('Your business must be approved first.');
        const limits = TIER_LIMITS[biz.tier];
        if (limits.blastsPerMonth === 0) return fail('Blasts are a Pro feature.');
        if (blastsThisMonth(s, biz.id, t) >= limits.blastsPerMonth) {
          return fail(`You have used all ${limits.blastsPerMonth} blasts for this month.`);
        }
        const text = message.trim();
        if (text.length < BLAST_MIN_CHARS) return fail('Write a little more (at least 10 characters).');
        if (text.length > BLAST_MAX_CHARS) return fail(`Keep it under ${BLAST_MAX_CHARS} characters.`);
        const blast: Blast = {
          id: uid('blast'),
          businessId: biz.id,
          message: text,
          radiusMiles,
          reach: estimateReach(radiusMiles),
          sentAt: new Date(t).toISOString(),
        };
        commit((st) => ({ ...st, blasts: [blast, ...st.blasts] }));
        notify(`Blast sent to about ${blast.reach} neighbors`);
        return ok(blast);
      },

      approveBusiness: (id) => {
        patchBusiness(id, { status: 'approved' });
        notify('Business approved');
      },
      suspendBusiness: (id) => {
        patchBusiness(id, { status: 'suspended' });
        notify('Business suspended', 'info');
      },
      reinstateBusiness: (id) => {
        patchBusiness(id, { status: 'approved' });
        notify('Business reinstated', 'info');
      },

      moderateSpotted: (id, approve) => {
        commit((s) => {
          const spot = s.spotted.find((d) => d.id === id);
          if (!spot) return s;
          const award = approve && spot.userId === s.consumer.id ? POINTS.spotApproved : 0;
          const status: ModerationStatus = approve ? 'approved' : 'rejected';
          return {
            ...s,
            spotted: s.spotted.map((d) => (d.id === id ? { ...d, status } : d)),
            consumer: { ...s.consumer, points: s.consumer.points + award },
          };
        });
        notify(approve ? 'Community deal approved' : 'Community deal rejected', 'info');
      },

      resetDemo: () => {
        commit((s) => ({ ...buildSeed(Date.now()), role: s.role }));
        notify('Demo data reset', 'info');
      },
    };
  }, [commit, notify]);

  const api = useMemo<StoreApi | null>(() => {
    if (!state) return null;
    const owned = state.businesses.filter((b) => b.ownerId === DEMO_OWNER_ID);
    const active = owned.find((b) => b.id === state.activeBusinessId) ?? owned[0] ?? null;
    return { ...actions, state, now, ownedBusinesses: owned, activeBusiness: active };
  }, [actions, state, now]);

  if (!api) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-medium text-slate-500">
        Loading LocalHints…
      </div>
    );
  }

  return (
    <StoreContext.Provider value={api}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-none fixed left-1/2 top-16 z-[70] w-[calc(100%-2rem)] max-w-sm animate-pop-in"
        >
          <div
            className={`rounded-2xl px-4 py-3 text-center text-sm font-semibold shadow-lg ${TOAST_STYLES[toast.tone]}`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </StoreContext.Provider>
  );
}
