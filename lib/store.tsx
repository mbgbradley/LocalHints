'use client';

/**
 * LocalHints state layer.
 *
 * This is the ONLY file that knows where data lives (browser localStorage in the
 * prototype). To move to Supabase + Stripe + Apple/Google Wallet pass updates, replace the
 * bodies of the actions in `actions` below with API calls; components only call `useStore()`.
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
import { buildSeed, conciergeDealFor, DEMO_ACCOUNT_ID, DEMO_EMAIL, DEMO_PASSWORD } from '@/data/seed';
import { hashPassword, passwordProblem, validateEmail, verifyPassword } from '@/lib/auth';
import { haversineMiles } from '@/lib/geo';
import { dealLabel } from '@/components/ui/format';
import {
  DEFAULT_BRAND_COLOR,
  DROP_MAX_MILES,
  DROP_MIN_MILES,
  FREE_DEAL_DURATION_DAYS,
  PILOT_DAYS,
  PILOT_SLOTS,
  POINTS,
  PUSH_MAX_CHARS,
  PUSH_MIN_CHARS,
  SIM_SHOPPERS_PER_SQ_MILE,
  TIER_LIMITS,
  WEEK_MS,
  type AppState,
  type Business,
  type BusinessAccount,
  type Consumer,
  type CreateDealInput,
  type Deal,
  type Drop,
  type ModerationStatus,
  type Pass,
  type PassPush,
  type RegisterBusinessInput,
  type SignUpInput,
  type SpotDealInput,
  type Tier,
  type TierLimits,
  type WalletNotification,
} from '@/types/localhints';

const STORAGE_KEY = 'localhints:v3';
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

function uniquePassCode(dealCode: string, passes: Pass[]): string {
  for (let i = 0; i < 20; i++) {
    const code = `${dealCode}-${shortCode()}`;
    if (!passes.some((p) => p.code === code)) return code;
  }
  return `${dealCode}-${shortCode()}${shortCode()}`;
}

function uniqueReferral(name: string, passes: Pass[]): string {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) || 'friend';
  for (let i = 0; i < 50; i++) {
    const code = `${slug}-${10 + Math.floor(Math.random() * 90)}`;
    if (!passes.some((p) => p.referralCode === code)) return code;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

function addNote(
  list: WalletNotification[],
  kind: WalletNotification['kind'],
  message: string,
  dealId?: string,
): WalletNotification[] {
  const note: WalletNotification = { id: uid('note'), kind, message, dealId, createdAt: new Date().toISOString() };
  return [note, ...list].slice(0, 20);
}

// ---------------------------------------------------------------------------
// Pure selectors (exported so components and a future server can share them)
// ---------------------------------------------------------------------------

export function isPilotActive(biz: Business, now: number): boolean {
  return biz.pilotEndsAt !== null && new Date(biz.pilotEndsAt).getTime() > now;
}

/** Pilot businesses get Pro features for free until the pilot ends. */
export function effectiveTier(biz: Business, now: number): Tier {
  return isPilotActive(biz, now) ? 'pro' : biz.tier;
}

export function limitsFor(biz: Business, now: number): TierLimits {
  return TIER_LIMITS[effectiveTier(biz, now)];
}

export function pilotSlotsUsed(state: AppState, now: number): number {
  return state.businesses.filter((b) => isPilotActive(b, now)).length;
}

export function claimsFor(state: AppState, dealId: string): Pass[] {
  return state.passes.filter((p) => p.dealId === dealId);
}

export function isDealExpired(deal: Deal, now: number): boolean {
  return new Date(deal.expiresAt).getTime() <= now;
}

/** Recurring ("slow-hours") deals are only open inside their weekly window. */
export function isDealOpenNow(deal: Deal, now: number): boolean {
  if (deal.expirationMode !== 'recurring' || !deal.recurring) return true;
  const d = new Date(now);
  return (
    deal.recurring.days.includes(d.getDay()) &&
    d.getHours() >= deal.recurring.startHour &&
    d.getHours() < deal.recurring.endHour
  );
}

/** Live for consumers: unpaused, unexpired, in its window, under its cap, business approved. */
export function isDealLive(deal: Deal, state: AppState, now: number): boolean {
  if (deal.status !== 'live') return false;
  if (isDealExpired(deal, now)) return false;
  if (!isDealOpenNow(deal, now)) return false;
  const biz = state.businesses.find((b) => b.id === deal.businessId);
  if (!biz || biz.status !== 'approved') return false;
  if (deal.claimLimit !== null && claimsFor(state, deal.id).length >= deal.claimLimit) return false;
  return true;
}

/** True for deals that exist in the feed even if currently outside a recurring window. */
export function isDealRunning(deal: Deal, state: AppState, now: number): boolean {
  if (deal.status !== 'live' || isDealExpired(deal, now)) return false;
  const biz = state.businesses.find((b) => b.id === deal.businessId);
  return !!biz && biz.status === 'approved';
}

function sameMonth(iso: string, now: number): boolean {
  const a = new Date(iso);
  const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Published (non-draft) deals created this calendar month. Counts toward the Free quota. */
export function dealsThisMonth(state: AppState, businessId: string, now: number): number {
  return state.deals.filter(
    (d) => d.businessId === businessId && d.status !== 'draft' && sameMonth(d.createdAt, now),
  ).length;
}

/** Wallet saves (new passes) across all of a business's deals this calendar month. */
export function savesThisMonth(state: AppState, businessId: string, now: number): number {
  const ids = new Set(state.deals.filter((d) => d.businessId === businessId).map((d) => d.id));
  return state.passes.filter((p) => ids.has(p.dealId) && sameMonth(p.claimedAt, now)).length;
}

export function dropsThisMonth(state: AppState, businessId: string, now: number): number {
  return state.drops.filter((d) => d.businessId === businessId && sameMonth(d.sentAt, now)).length;
}

/** Simulated opted-in shoppers inside a radius. Production: a PostGIS ST_DWithin count of opted-in users. */
export function estimateDropReach(radiusMiles: number): number {
  return Math.round(Math.PI * radiusMiles * radiusMiles * SIM_SHOPPERS_PER_SQ_MILE);
}

export function dealQuotaReached(state: AppState, biz: Business, now: number): boolean {
  const cap = limitsFor(biz, now).dealsPerMonth;
  return cap !== null && dealsThisMonth(state, biz.id, now) >= cap;
}

export function saveCapReached(state: AppState, biz: Business, now: number): boolean {
  const cap = limitsFor(biz, now).savesPerMonth;
  return cap !== null && savesThisMonth(state, biz.id, now) >= cap;
}

/** When this specific pass stops working (rolling passes expire a set time after saving). */
export function passExpiresAt(deal: Deal, pass: Pass): number {
  const end = new Date(deal.expiresAt).getTime();
  if (deal.expirationMode === 'rolling' && deal.rollingHours) {
    return Math.min(end, new Date(pass.claimedAt).getTime() + deal.rollingHours * 3_600_000);
  }
  return end;
}

export type PassStatus = 'active' | 'complete' | 'expired' | 'voided' | 'paused' | 'scheduled';

export function passStatus(deal: Deal, pass: Pass, now: number): PassStatus {
  if (pass.redeemedAt) return 'complete';
  if (deal.status === 'ended') return 'voided';
  if (passExpiresAt(deal, pass) <= now) return 'expired';
  if (deal.status === 'paused') return 'paused';
  if (!isDealOpenNow(deal, now)) return 'scheduled';
  return 'active';
}

/** Share-to-upgrade: the pass shows the upgraded offer once enough friends have saved. */
export function isPassUpgraded(deal: Deal, pass: Pass): boolean {
  return !!deal.shareUpgrade && pass.friendSaves >= deal.shareUpgrade.friendsNeeded;
}

/** Passes that would receive a Pass Push for this business (still usable now or later). */
export function passHolders(state: AppState, businessId: string, now: number): Pass[] {
  const deals = new Map(state.deals.filter((d) => d.businessId === businessId).map((d) => [d.id, d]));
  return state.passes.filter((p) => {
    const deal = deals.get(p.dealId);
    if (!deal) return false;
    const status = passStatus(deal, p, now);
    return status === 'active' || status === 'scheduled' || status === 'paused';
  });
}

function redemptionBlocker(deal: Deal, pass: Pass, t: number): string | null {
  const status = passStatus(deal, pass, t);
  if (status === 'complete') return 'That pass is already fully redeemed.';
  if (status === 'voided') return 'The merchant ended this offer.';
  if (status === 'expired') return 'That pass has expired.';
  if (status === 'paused') return 'This offer is paused by the merchant.';
  if (status === 'scheduled') return 'This offer is not active right now.';
  if (
    deal.perCustomerLimit === 'weekly' &&
    pass.lastRedeemedAt &&
    t - new Date(pass.lastRedeemedAt).getTime() < WEEK_MS
  ) {
    return 'Limit reached: one redemption per week.';
  }
  return null;
}

function redemptionOutcome(deal: Deal, pass: Pass): { stamps: number; complete: boolean } {
  const stamps = pass.stamps + 1;
  const complete =
    (deal.punchVisits > 1 && stamps >= deal.punchVisits) ||
    (deal.punchVisits === 1 && deal.perCustomerLimit === 'once');
  return { stamps, complete };
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
  signUp: (input: SignUpInput) => Promise<Result<Business>>;
  signIn: (email: string, password: string) => Promise<Result>;
  signOut: () => void;
  setActiveBusiness: (id: string) => void;
  updateConsumer: (patch: Partial<Consumer>) => void;
  toggleSave: (dealId: string) => void;
  trackView: (dealId: string) => void;
  claimDeal: (dealId: string) => Result<Pass>;
  /** Simulates a friend opening someone's share link and saving their own pass. */
  saveViaReferral: (referralCode: string) => Result<{ upgraded: boolean }>;
  redeemPass: (passId: string) => Result;
  redeemByCode: (
    businessId: string,
    code: string,
  ) => Result<{ dealTitle: string; stamps: number; total: number; complete: boolean }>;
  clearNotifications: () => void;
  spotDeal: (input: SpotDealInput) => Result;
  upvoteSpotted: (id: string) => void;
  registerBusiness: (input: RegisterBusinessInput) => Result<Business>;
  upgradeTier: (businessId: string, tier: Tier, billing?: 'monthly' | 'annual') => void;
  enrollPilot: (businessId: string) => Result;
  endPilot: (businessId: string) => void;
  createDeal: (input: CreateDealInput) => Result<Deal>;
  publishDraft: (dealId: string) => Result<Deal>;
  discardDraft: (dealId: string) => void;
  setDealStatus: (dealId: string, status: 'live' | 'paused') => void;
  /** Voids the deal on every phone: passes show "Offer ended by merchant". */
  endDeal: (dealId: string) => void;
  sendPassPush: (businessId: string, message: string) => Result<PassPush>;
  /** Neighborhood Drop: alert opted-in shoppers within a radius about one of the business's live deals. */
  sendDrop: (
    businessId: string,
    dealId: string,
    message: string,
    radiusMiles: number,
  ) => Result<{ drop: Drop; deliveredToDemoShopper: boolean }>;
  approveBusiness: (id: string) => void;
  suspendBusiness: (id: string) => void;
  reinstateBusiness: (id: string) => void;
  moderateSpotted: (id: string, approve: boolean) => void;
  resetDemo: () => Promise<void>;
}

export interface StoreApi extends StoreActions {
  state: AppState;
  /** Wall clock in ms, refreshed every 30 seconds so countdowns stay current. */
  now: number;
  /** The signed-in business owner, or null. */
  account: BusinessAccount | null;
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

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Fresh demo data plus the demo business login (hashed at runtime). */
async function buildInitialState(now: number): Promise<AppState> {
  const seed = buildSeed(now);
  try {
    const { salt, hash } = await hashPassword(DEMO_PASSWORD);
    seed.accounts = [
      {
        id: DEMO_ACCOUNT_ID,
        email: DEMO_EMAIL,
        ownerName: 'Demo Owner',
        salt,
        passwordHash: hash,
        createdAt: new Date(now - 90 * DAY).toISOString(),
      },
    ];
  } catch {
    // No Web Crypto (plain-HTTP LAN address): the demo login is unavailable until opened over HTTPS.
    seed.accounts = [];
  }
  return seed;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState<number>(0);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const ref = useRef<AppState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage (or seed) on the client only, avoiding SSR mismatches.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded: AppState | null = null;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppState;
          if (parsed && parsed.version === 3) loaded = parsed;
        }
      } catch {
        loaded = null;
      }
      const initial = loaded ?? (await buildInitialState(Date.now()));
      if (cancelled) return;
      ref.current = initial;
      setState(initial);
      setNow(Date.now());
    })();
    return () => {
      cancelled = true;
    };
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
    setNow(Date.now());
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

    const patchDeal = (id: string, patch: Partial<Deal>) =>
      commit((s) => ({
        ...s,
        deals: s.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      }));

    const applyRedeem = (passId: string, t: number) =>
      commit((s) => {
        const pass = s.passes.find((p) => p.id === passId);
        const deal = pass ? s.deals.find((d) => d.id === pass.dealId) : undefined;
        if (!pass || !deal) return s;
        const { stamps, complete } = redemptionOutcome(deal, pass);
        const at = new Date(t).toISOString();
        return {
          ...s,
          passes: s.passes.map((p) =>
            p.id === passId
              ? { ...p, stamps, lastRedeemedAt: at, redeemedAt: complete ? at : p.redeemedAt }
              : p,
          ),
          consumer:
            pass.consumerId === s.consumer.id
              ? { ...s.consumer, points: s.consumer.points + POINTS.redeem }
              : s.consumer,
        };
      });

    /** Shared checks for creating or publishing a deal. */
    const publishChecks = (biz: Business | undefined, t: number): string | null => {
      if (!biz) return 'Business not found.';
      if (biz.status !== 'approved') {
        return 'Your business must be approved before you can publish deals.';
      }
      const s = get();
      if (dealQuotaReached(s, biz, t)) {
        const cap = limitsFor(biz, t).dealsPerMonth;
        return `The Free Starter plan includes ${cap} deals per month. Upgrade to Pro for unlimited deals.`;
      }
      return null;
    };

    /** Validates input and builds a pending Free business plus its concierge draft deal. */
    const buildBusiness = (
      ownerId: string,
      input: RegisterBusinessInput,
    ): Result<{ biz: Business; draft: Deal }> => {
      const name = input.name.trim();
      if (name.length < 2) return fail('Enter your business name.');
      if (input.address.trim().length < 4) return fail('Enter a street address.');
      const t = Date.now();
      const biz: Business = {
        id: uid('biz'),
        ownerId,
        name,
        category: input.category,
        emoji: input.emoji,
        address: input.address.trim(),
        lat: input.lat,
        lng: input.lng,
        blurb: input.blurb.trim(),
        tier: 'free',
        status: 'pending',
        pilotEndsAt: null,
        createdAt: new Date(t).toISOString(),
      };
      // Concierge first deal: a ready-made draft so the owner only has to approve it.
      return ok({ biz, draft: conciergeDealFor(biz, t, uid('deal')) });
    };

    return {
      notify,

      signUp: async (input) => {
        const email = input.email.trim().toLowerCase();
        const ownerName = input.ownerName.trim();
        if (ownerName.length < 2) return fail('Enter your name.');
        if (!validateEmail(email)) return fail('Enter a valid email address.');
        const problem = passwordProblem(input.password);
        if (problem) return fail(problem);
        if (get().accounts.some((a) => a.email === email)) {
          return fail('An account with that email already exists. Sign in instead.');
        }
        const built = buildBusiness('pending-account', input.business);
        if (!built.ok) return fail(built.error);
        let creds: { salt: string; hash: string };
        try {
          creds = await hashPassword(input.password);
        } catch (e) {
          return fail(e instanceof Error ? e.message : 'Could not secure your password.');
        }
        const account: BusinessAccount = {
          id: uid('acct'),
          email,
          ownerName,
          salt: creds.salt,
          passwordHash: creds.hash,
          createdAt: new Date().toISOString(),
        };
        const { biz, draft } = built.data;
        const owned: Business = { ...biz, ownerId: account.id };
        commit((s) => ({
          ...s,
          accounts: [...s.accounts, account],
          sessionAccountId: account.id,
          businesses: [...s.businesses, owned],
          deals: [draft, ...s.deals],
          activeBusinessId: owned.id,
        }));
        notify('Account created. We drafted your first deal.');
        return ok(owned);
      },

      signIn: async (email, password) => {
        const needle = email.trim().toLowerCase();
        const account = get().accounts.find((a) => a.email === needle);
        let valid = false;
        try {
          // Always run the hash so a missing account takes about as long as a wrong password.
          valid = account
            ? await verifyPassword(password, account.salt, account.passwordHash)
            : (await verifyPassword(password, '00'.repeat(16), '0'.repeat(64)), false);
        } catch (e) {
          return fail(e instanceof Error ? e.message : 'Could not sign in.');
        }
        if (!account || !valid) return fail('Incorrect email or password.');
        commit((s) => {
          const owned = s.businesses.filter((b) => b.ownerId === account.id);
          return { ...s, sessionAccountId: account.id, activeBusinessId: owned[0]?.id ?? null };
        });
        notify(`Welcome back, ${account.ownerName.split(' ')[0]}`, 'info');
        return ok(undefined);
      },

      signOut: () => {
        commit((s) => ({ ...s, sessionAccountId: null, activeBusinessId: null }));
        notify('Signed out', 'info');
      },

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
        const biz = deal ? s.businesses.find((b) => b.id === deal.businessId) : undefined;
        if (!deal || !biz) return fail('That deal no longer exists.');
        if (!isDealLive(deal, s, t)) return fail('This deal is not available right now.');
        if (saveCapReached(s, biz, t)) {
          return fail('This offer has reached its save limit for the month. Try again next month.');
        }
        if (s.passes.some((p) => p.dealId === dealId && p.consumerId === s.consumer.id)) {
          return fail('You already have this pass.');
        }
        const pass: Pass = {
          id: uid('pass'),
          dealId,
          consumerId: s.consumer.id,
          code: uniquePassCode(deal.code, s.passes),
          referralCode: uniqueReferral(s.consumer.name, s.passes),
          referredBy: null,
          claimedAt: new Date(t).toISOString(),
          stamps: 0,
          friendSaves: 0,
          lastRedeemedAt: null,
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

      saveViaReferral: (referralCode) => {
        const s = get();
        const t = Date.now();
        const source = s.passes.find((p) => p.referralCode === referralCode.trim().toLowerCase());
        if (!source) return fail('That share link is not valid.');
        const deal = s.deals.find((d) => d.id === source.dealId);
        const biz = deal ? s.businesses.find((b) => b.id === deal.businessId) : undefined;
        if (!deal || !biz) return fail('That offer no longer exists.');
        if (!isDealLive(deal, s, t)) return fail('This offer is not available to new friends right now.');
        if (saveCapReached(s, biz, t)) return fail('This offer is at its save limit for the month.');

        const friendId = uid('friend');
        const friendPass: Pass = {
          id: uid('pass'),
          dealId: deal.id,
          consumerId: friendId,
          code: uniquePassCode(deal.code, s.passes),
          referralCode: uniqueReferral('friend', s.passes),
          referredBy: source.id,
          claimedAt: new Date(t).toISOString(),
          stamps: 0,
          friendSaves: 0,
          lastRedeemedAt: null,
          redeemedAt: null,
        };
        const after = source.friendSaves + 1;
        const needed = deal.shareUpgrade ? deal.shareUpgrade.friendsNeeded : null;
        const upgraded = deal.shareUpgrade !== null && source.friendSaves < (needed ?? 0) && after >= (needed ?? 0);

        let message: string;
        let kind: WalletNotification['kind'];
        if (upgraded && deal.shareUpgrade) {
          kind = 'upgrade';
          message = `Your friend saved the deal! Your ${biz.name} pass just upgraded to ${dealLabel(
            deal,
            deal.shareUpgrade.upgradedValue,
          )}.`;
        } else {
          kind = 'friend';
          message = `A friend saved your ${biz.name} pass${needed ? ` (${Math.min(after, needed)} of ${needed})` : ''}.`;
        }

        commit((st) => ({
          ...st,
          passes: [
            friendPass,
            ...st.passes.map((p) => (p.id === source.id ? { ...p, friendSaves: after } : p)),
          ],
          notifications:
            source.consumerId === st.consumer.id ? addNote(st.notifications, kind, message) : st.notifications,
        }));
        notify(upgraded ? 'Pass upgraded! Check your wallet.' : 'Friend saved the deal', 'info');
        return ok({ upgraded });
      },

      redeemPass: (passId) => {
        const s = get();
        const t = Date.now();
        const pass = s.passes.find((p) => p.id === passId);
        if (!pass) return fail('Pass not found.');
        const deal = s.deals.find((d) => d.id === pass.dealId);
        if (!deal) return fail('Offer not found.');
        if (deal.redemptionMethod !== 'tap') {
          return fail('Ask the cashier to scan or enter your code.');
        }
        const blocked = redemptionBlocker(deal, pass, t);
        if (blocked) return fail(blocked);
        applyRedeem(pass.id, t);
        const { stamps, complete } = redemptionOutcome(deal, pass);
        notify(
          deal.punchVisits > 1 && !complete
            ? `Stamp added: ${stamps} of ${deal.punchVisits} (+${POINTS.redeem} pts)`
            : `Redeemed! Enjoy (+${POINTS.redeem} pts)`,
        );
        return ok(undefined);
      },

      redeemByCode: (businessId, code) => {
        const s = get();
        const t = Date.now();
        const needle = code.trim().toUpperCase();
        if (needle.length < 4) return fail('Enter the full pass code.');
        const bizDeals = new Map(
          s.deals.filter((d) => d.businessId === businessId).map((d) => [d.id, d]),
        );
        const pass = s.passes.find((p) => p.code.toUpperCase() === needle && bizDeals.has(p.dealId));
        if (!pass) return fail('No pass matches that code for this business.');
        const deal = bizDeals.get(pass.dealId);
        if (!deal) return fail('Offer not found.');
        const blocked = redemptionBlocker(deal, pass, t);
        if (blocked) return fail(blocked);
        const outcome = redemptionOutcome(deal, pass);
        applyRedeem(pass.id, t);
        notify(
          deal.punchVisits > 1 && !outcome.complete
            ? `Stamp ${outcome.stamps} of ${deal.punchVisits} added`
            : 'Pass redeemed',
        );
        return ok({
          dealTitle: deal.title,
          stamps: outcome.stamps,
          total: deal.punchVisits,
          complete: outcome.complete,
        });
      },

      clearNotifications: () => commit((s) => ({ ...s, notifications: [] })),

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
        const s = get();
        if (!s.sessionAccountId) return fail('Sign in to add a business.');
        const built = buildBusiness(s.sessionAccountId, input);
        if (!built.ok) return fail(built.error);
        const { biz, draft } = built.data;
        commit((st) => ({
          ...st,
          businesses: [...st.businesses, biz],
          deals: [draft, ...st.deals],
          activeBusinessId: biz.id,
        }));
        notify('Submitted. We drafted your first deal for you.');
        return ok(biz);
      },

      upgradeTier: (businessId, tier, billing = 'monthly') => {
        patchBusiness(businessId, { tier });
        notify(
          tier === 'pro'
            ? `Welcome to Pro (${billing === 'annual' ? 'annual, 2 months free' : 'monthly'})!`
            : 'Switched to the Free Starter plan',
          'info',
        );
      },

      enrollPilot: (businessId) => {
        const s = get();
        const t = Date.now();
        const biz = s.businesses.find((b) => b.id === businessId);
        if (!biz) return fail('Business not found.');
        if (isPilotActive(biz, t)) return fail('Already in the pilot.');
        if (pilotSlotsUsed(s, t) >= PILOT_SLOTS) {
          return fail(`All ${PILOT_SLOTS} pilot spots are taken.`);
        }
        patchBusiness(businessId, { pilotEndsAt: new Date(t + PILOT_DAYS * DAY).toISOString() });
        notify(`${biz.name} joined the pilot: Pro free for ${PILOT_DAYS / 30} months`);
        return ok(undefined);
      },

      endPilot: (businessId) => {
        patchBusiness(businessId, { pilotEndsAt: null });
        notify('Pilot ended', 'info');
      },

      createDeal: (input) => {
        const s = get();
        const t = Date.now();
        const biz = s.businesses.find((b) => b.id === input.businessId);
        const blocked = publishChecks(biz, t);
        if (blocked || !biz) return fail(blocked ?? 'Business not found.');
        const pro = limitsFor(biz, t).proBuilder;

        const title = input.title.trim();
        if (title.length < 3 || title.length > 60) return fail('Title must be 3 to 60 characters.');

        if (!pro && input.kind !== 'percent' && input.kind !== 'amount') {
          return fail('BOGO, free-item and bundle offers are Pro features.');
        }

        let value = Math.round(input.value);
        if (input.kind === 'percent' && (value < 1 || value > 90)) {
          return fail('Percent off must be between 1 and 90.');
        }
        if (input.kind === 'amount' && (value < 1 || value > 500)) {
          return fail('Amount off must be between $1 and $500.');
        }
        if (input.kind === 'bundle' && (value < 1 || value > 1000)) {
          return fail('Bundle price must be between $1 and $1000.');
        }
        if (input.kind === 'bogo' || input.kind === 'freebie') value = 0;
        const buyQty = Math.min(10, Math.max(1, Math.round(input.buyQty)));
        const getQty = Math.min(10, Math.max(1, Math.round(input.getQty)));

        const code = input.code.trim().toUpperCase();
        if (!/^[A-Z0-9]{3,15}$/.test(code)) return fail('Code must be 3 to 15 letters or numbers.');

        // Free Starter only gets the basics: everything else is reset to defaults.
        const punchVisits = pro ? input.punchVisits : 1;
        let perCustomerLimit = pro ? input.perCustomerLimit : 'once';
        if (punchVisits > 1 && perCustomerLimit === 'once') perCustomerLimit = 'unlimited';
        const minSpend = pro && input.minSpend && input.minSpend > 0 ? Math.round(input.minSpend) : null;
        const claimLimit = pro && input.claimLimit && input.claimLimit > 0 ? Math.round(input.claimLimit) : null;
        const brandColor = pro && HEX.test(input.brandColor) ? input.brandColor : DEFAULT_BRAND_COLOR;
        const redemptionMethod = pro ? input.redemptionMethod : 'qr';

        let shareUpgrade = pro ? input.shareUpgrade : null;
        if (shareUpgrade) {
          if (input.kind !== 'percent' && input.kind !== 'amount') {
            return fail('Share-to-upgrade works with percent-off or dollar-off deals.');
          }
          const max = input.kind === 'percent' ? 90 : 500;
          if (shareUpgrade.upgradedValue <= value || shareUpgrade.upgradedValue > max) {
            return fail('The upgraded offer must be bigger than the base offer.');
          }
          shareUpgrade = {
            friendsNeeded: shareUpgrade.friendsNeeded,
            upgradedValue: Math.round(shareUpgrade.upgradedValue),
          };
        }

        let partnerBusinessId: string | null = null;
        if (pro && input.partnerBusinessId) {
          const partner = s.businesses.find((b) => b.id === input.partnerBusinessId);
          if (!partner || partner.status !== 'approved' || partner.id === biz.id) {
            return fail('Pick an approved neighboring business for your Main Street Loop.');
          }
          partnerBusinessId = partner.id;
        }

        let expirationMode = pro ? input.expirationMode : 'fixed';
        let expiresAt: number;
        let rollingHours: number | null = null;
        let recurring = null as CreateDealInput['recurring'];
        if (expirationMode === 'rolling') {
          rollingHours = Math.round(input.rollingHours ?? 0);
          if (rollingHours < 1 || rollingHours > 720) return fail('Rolling timer must be 1 to 720 hours.');
          expiresAt = t + 30 * DAY;
        } else if (expirationMode === 'recurring') {
          const r = input.recurring;
          if (!r || r.days.length === 0) return fail('Pick at least one day for the recurring schedule.');
          if (r.startHour >= r.endHour) return fail('The end hour must be after the start hour.');
          recurring = { days: [...r.days].sort((a, b) => a - b), startHour: r.startHour, endHour: r.endHour };
          expiresAt = t + 90 * DAY;
        } else {
          expirationMode = 'fixed';
          if (!pro) {
            expiresAt = t + FREE_DEAL_DURATION_DAYS * DAY;
          } else {
            const end = new Date(`${input.expiresOn}T23:59:59`).getTime();
            if (!Number.isFinite(end) || end <= t) return fail('Pick an end date in the future.');
            if (end > t + 90 * DAY) return fail('Fixed end dates can be at most 90 days out.');
            expiresAt = end;
          }
        }

        const deal: Deal = {
          id: uid('deal'),
          businessId: biz.id,
          title,
          description: input.description.trim(),
          kind: input.kind,
          value,
          buyQty,
          getQty,
          terms: input.terms.trim(),
          code,
          minSpend,
          punchVisits,
          perCustomerLimit,
          shareUpgrade,
          partnerBusinessId,
          expirationMode,
          expiresAt: new Date(expiresAt).toISOString(),
          rollingHours,
          recurring,
          claimLimit,
          brandColor,
          redemptionMethod,
          concierge: false,
          createdAt: new Date(t).toISOString(),
          status: 'live',
          viewCount: 0,
        };
        commit((st) => ({ ...st, deals: [deal, ...st.deals] }));
        notify('Deal published');
        return ok(deal);
      },

      publishDraft: (dealId) => {
        const s = get();
        const t = Date.now();
        const deal = s.deals.find((d) => d.id === dealId);
        if (!deal || deal.status !== 'draft') return fail('That draft is no longer available.');
        const biz = s.businesses.find((b) => b.id === deal.businessId);
        const blocked = publishChecks(biz, t);
        if (blocked) return fail(blocked);
        const live: Deal = {
          ...deal,
          status: 'live',
          createdAt: new Date(t).toISOString(),
          expiresAt: new Date(t + 14 * DAY).toISOString(),
        };
        commit((st) => ({ ...st, deals: st.deals.map((d) => (d.id === dealId ? live : d)) }));
        notify('You are live!');
        return ok(live);
      },

      discardDraft: (dealId) => {
        commit((s) => ({ ...s, deals: s.deals.filter((d) => !(d.id === dealId && d.status === 'draft')) }));
        notify('Draft discarded', 'info');
      },

      setDealStatus: (dealId, status) => {
        const deal = get().deals.find((d) => d.id === dealId);
        if (!deal || (deal.status !== 'live' && deal.status !== 'paused')) return;
        patchDeal(dealId, { status });
        notify(
          status === 'paused'
            ? 'Paused: passes show "paused" until you resume'
            : 'Live again: existing passes reactivated, no re-download needed',
          'info',
        );
      },

      endDeal: (dealId) => {
        const s = get();
        const deal = s.deals.find((d) => d.id === dealId);
        if (!deal || deal.status === 'ended') return;
        const biz = s.businesses.find((b) => b.id === deal.businessId);
        const holdsPass = s.passes.some(
          (p) => p.dealId === dealId && p.consumerId === s.consumer.id && !p.redeemedAt,
        );
        commit((st) => ({
          ...st,
          deals: st.deals.map((d) => (d.id === dealId ? { ...d, status: 'ended' as const } : d)),
          notifications: holdsPass
            ? addNote(
                st.notifications,
                'ended',
                `${biz ? biz.name : 'A merchant'} ended "${deal.title}". Your pass moved to Expired Passes.`,
              )
            : st.notifications,
        }));
        notify('Deal ended on every phone', 'info');
      },

      sendPassPush: (businessId, message) => {
        const s = get();
        const t = Date.now();
        const biz = s.businesses.find((b) => b.id === businessId);
        if (!biz) return fail('Business not found.');
        if (biz.status !== 'approved') return fail('Your business must be approved first.');
        if (!limitsFor(biz, t).passPush) return fail('Pass Push is a Pro feature.');
        const text = message.trim();
        if (text.length < PUSH_MIN_CHARS) return fail('Write a little more (at least 10 characters).');
        if (text.length > PUSH_MAX_CHARS) return fail(`Keep it under ${PUSH_MAX_CHARS} characters.`);
        const holders = passHolders(s, biz.id, t);
        if (holders.length === 0) return fail('Nobody holds an active pass yet.');
        const push: PassPush = {
          id: uid('push'),
          businessId: biz.id,
          message: text,
          recipients: holders.length,
          sentAt: new Date(t).toISOString(),
        };
        const consumerHolds = holders.some((p) => p.consumerId === s.consumer.id);
        commit((st) => ({
          ...st,
          pushes: [push, ...st.pushes],
          notifications: consumerHolds
            ? addNote(st.notifications, 'push', `${biz.name}: ${text}`)
            : st.notifications,
        }));
        notify(`Pass Push delivered to ${push.recipients} phones`);
        return ok(push);
      },

      sendDrop: (businessId, dealId, message, radiusMiles) => {
        const s = get();
        const t = Date.now();
        const biz = s.businesses.find((b) => b.id === businessId);
        if (!biz) return fail('Business not found.');
        if (biz.status !== 'approved') return fail('Your business must be approved first.');
        const limits = limitsFor(biz, t);
        if (limits.dropsPerMonth === 0) return fail('Neighborhood Drops are a Pro feature.');
        if (dropsThisMonth(s, biz.id, t) >= limits.dropsPerMonth) {
          return fail(`You have used all ${limits.dropsPerMonth} drops for this month.`);
        }
        const deal = s.deals.find((d) => d.id === dealId && d.businessId === biz.id);
        if (!deal || !isDealLive(deal, s, t)) return fail('Pick one of your live deals to send.');
        const text = message.trim();
        if (text.length < PUSH_MIN_CHARS) return fail('Write a little more (at least 10 characters).');
        if (text.length > PUSH_MAX_CHARS) return fail(`Keep it under ${PUSH_MAX_CHARS} characters.`);
        if (!(radiusMiles >= DROP_MIN_MILES && radiusMiles <= DROP_MAX_MILES)) {
          return fail(`Choose a radius between ${DROP_MIN_MILES} and ${DROP_MAX_MILES} miles.`);
        }
        const drop: Drop = {
          id: uid('drop'),
          businessId: biz.id,
          dealId: deal.id,
          message: text,
          radiusMiles,
          reach: estimateDropReach(radiusMiles),
          sentAt: new Date(t).toISOString(),
        };
        // The demo shopper receives it only if opted in AND physically inside the radius.
        const inside = haversineMiles(s.consumer, biz) <= radiusMiles;
        const delivered = s.consumer.notifyNearby && inside;
        commit((st) => ({
          ...st,
          drops: [drop, ...st.drops],
          notifications: delivered
            ? addNote(st.notifications, 'drop', `${biz.name} is nearby: ${text}`, deal.id)
            : st.notifications,
        }));
        notify(`Drop sent to about ${drop.reach} nearby shoppers`);
        return ok({ drop, deliveredToDemoShopper: delivered });
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

      resetDemo: async () => {
        const fresh = await buildInitialState(Date.now());
        commit(() => fresh);
        notify('Demo data reset', 'info');
      },
    };
  }, [commit, notify]);

  const api = useMemo<StoreApi | null>(() => {
    if (!state) return null;
    const account = state.accounts.find((a) => a.id === state.sessionAccountId) ?? null;
    const owned = account ? state.businesses.filter((b) => b.ownerId === account.id) : [];
    const active = owned.find((b) => b.id === state.activeBusinessId) ?? owned[0] ?? null;
    return { ...actions, state, now, account, ownedBusinesses: owned, activeBusiness: active };
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
          className="pointer-events-none fixed left-1/2 top-4 z-[70] w-[calc(100%-2rem)] max-w-sm animate-pop-in"
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
