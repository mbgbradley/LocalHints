// LocalHints domain model. Every shape in the app lives here so that a future
// Supabase (PostgreSQL + PostGIS) schema can be derived from one file.

export type Tier = 'free' | 'pro';
export type Category =
  | 'food'
  | 'coffee'
  | 'retail'
  | 'wellness'
  | 'services'
  | 'entertainment';
export type DealKind = 'percent' | 'amount' | 'bogo' | 'freebie' | 'bundle';
export type BusinessStatus = 'pending' | 'approved' | 'suspended';
/** draft = concierge-generated, waiting for the owner's approval. ended = voided on every phone. */
export type DealStatus = 'draft' | 'live' | 'paused' | 'ended';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export type ExpirationMode = 'fixed' | 'rolling' | 'recurring';
export type RedemptionMethod = 'qr' | 'code' | 'tap';
export type PerCustomerLimit = 'once' | 'weekly' | 'unlimited';
/** 1 = single-use coupon, otherwise a stamp card with that many visits. */
export type PunchVisits = 1 | 3 | 5 | 10;

export interface LatLng {
  lat: number;
  lng: number;
}

export const CATEGORIES: ReadonlyArray<{ id: Category; label: string; emoji: string }> = [
  { id: 'food', label: 'Food', emoji: '🍽️' },
  { id: 'coffee', label: 'Coffee', emoji: '☕' },
  { id: 'retail', label: 'Retail', emoji: '🛍️' },
  { id: 'wellness', label: 'Wellness', emoji: '💪' },
  { id: 'services', label: 'Services', emoji: '🧰' },
  { id: 'entertainment', label: 'Fun', emoji: '🎬' },
];

// ---------------------------------------------------------------------------
// Monetization rules (single source of truth, enforced in lib/store.tsx)
// ---------------------------------------------------------------------------

export interface TierLimits {
  label: string;
  priceMonthlyUsd: number;
  /** Annual billing = 2 months free. */
  priceAnnualUsd: number;
  /** null = unlimited. Counted per calendar month. */
  dealsPerMonth: number | null;
  /** Wallet saves across all of a business's deals per calendar month. null = unlimited. */
  savesPerMonth: number | null;
  /** The 5-group Pro coupon builder: BOGO/free item/bundle, min spend, punch cards, share-to-upgrade,
   *  Main Street Loop, rolling/recurring schedules, scarcity cap, branding, POS codes, limits. */
  proBuilder: boolean;
  /** Lock-screen updates to everyone who saved a pass. */
  passPush: boolean;
  /** Neighborhood Drops: deal alerts to opted-in shoppers within a radius. Per calendar month. */
  dropsPerMonth: number;
  /** Views -> saves -> friend shares -> redemptions funnel. */
  funnelAnalytics: boolean;
  /** Comparison against the category average in the area. */
  benchmarks: boolean;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    label: 'Free Starter',
    priceMonthlyUsd: 0,
    priceAnnualUsd: 0,
    dealsPerMonth: 2,
    savesPerMonth: 50,
    proBuilder: false,
    passPush: false,
    dropsPerMonth: 0,
    funnelAnalytics: false,
    benchmarks: false,
  },
  pro: {
    label: 'Pro',
    priceMonthlyUsd: 29,
    priceAnnualUsd: 290,
    dealsPerMonth: null,
    savesPerMonth: null,
    proBuilder: true,
    passPush: true,
    dropsPerMonth: 4,
    funnelAnalytics: true,
    benchmarks: true,
  },
};

/** The pilot: this many businesses get Pro free for PILOT_DAYS. */
export const PILOT_SLOTS = 5;
export const PILOT_DAYS = 60;

/** Free-tier deals always run for exactly this many days. */
export const FREE_DEAL_DURATION_DAYS = 7;
export const DEFAULT_BRAND_COLOR = '#4f46e5';
export const PUSH_MAX_CHARS = 100;
export const PUSH_MIN_CHARS = 10;
export const DROP_MIN_MILES = 0.5;
export const DROP_MAX_MILES = 5;
/** Simulated density of opted-in shoppers, used for reach estimates in the prototype. */
export const SIM_SHOPPERS_PER_SQ_MILE = 45;
export const WEEK_MS = 7 * 24 * 3_600_000;

/** Loyalty points awarded to the consumer. */
export const POINTS = { claim: 5, redeem: 20, spotApproved: 25 } as const;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Business {
  id: string;
  /** BusinessAccount.id */
  ownerId: string;
  name: string;
  category: Category;
  emoji: string;
  address: string;
  lat: number;
  lng: number;
  blurb: string;
  tier: Tier;
  status: BusinessStatus;
  /** While in the future, the business gets Pro features for free (the pilot). */
  pilotEndsAt: string | null;
  createdAt: string;
}

export interface ShareUpgrade {
  /** How many friend saves unlock the upgraded offer. */
  friendsNeeded: 1 | 2 | 3;
  /** New percent / dollar value (must be higher than the base value). */
  upgradedValue: number;
}

export interface RecurringSchedule {
  /** 0 = Sunday ... 6 = Saturday */
  days: number[];
  /** Local hours, 0-23. The offer is live from startHour up to (not including) endHour. */
  startHour: number;
  endHour: number;
}

export interface Deal {
  id: string;
  businessId: string;
  title: string;
  description: string;
  kind: DealKind;
  /** percent, dollars off, or bundle price. Unused for bogo/freebie. */
  value: number;
  /** BOGO: buy X ... */
  buyQty: number;
  /** ... get Y free. */
  getQty: number;
  terms: string;
  /** Promo code (3-15 chars). Shown on the pass when redemptionMethod is "code". */
  code: string;
  minSpend: number | null;
  punchVisits: PunchVisits;
  perCustomerLimit: PerCustomerLimit;
  shareUpgrade: ShareUpgrade | null;
  /** Main Street Loop: a neighboring, non-competing business to cross-promote. */
  partnerBusinessId: string | null;
  expirationMode: ExpirationMode;
  /** End of the campaign. For "rolling" and "recurring" this is a long campaign window. */
  expiresAt: string;
  /** Rolling mode: each pass expires this many hours after it is saved. */
  rollingHours: number | null;
  recurring: RecurringSchedule | null;
  /** "First N people to save". null = unlimited. */
  claimLimit: number | null;
  /** Hex color that tints the whole wallet card. */
  brandColor: string;
  redemptionMethod: RedemptionMethod;
  /** True when the system auto-generated this deal for the owner to approve. */
  concierge: boolean;
  createdAt: string;
  status: DealStatus;
  viewCount: number;
}

export interface Pass {
  id: string;
  dealId: string;
  consumerId: string;
  /** Unique per pass, e.g. BEANBOGO-7QK2. The cashier enters or scans it. */
  code: string;
  /** Share link slug, e.g. alex-42 -> localhints.com/p/alex-42 */
  referralCode: string;
  /** Pass id of the friend whose link brought this save in. */
  referredBy: string | null;
  claimedAt: string;
  /** Visits stamped so far (single-use passes use 0 or 1). */
  stamps: number;
  /** Friends who saved through this pass's link. */
  friendSaves: number;
  lastRedeemedAt: string | null;
  /** Set when the pass is fully used up (card complete or single-use redeemed). */
  redeemedAt: string | null;
}

export interface SpottedDeal {
  id: string;
  userId: string;
  businessName: string;
  title: string;
  details: string;
  category: Category;
  lat: number;
  lng: number;
  status: ModerationStatus;
  createdAt: string;
  upvotes: number;
}

/** A "Pass Push": a lock-screen update to everyone holding one of the business's passes. */
export interface PassPush {
  id: string;
  businessId: string;
  message: string;
  recipients: number;
  sentAt: string;
}

/**
 * A "Neighborhood Drop": reaches opted-in shoppers whose saved location is within `radiusMiles` of the
 * business, inviting them to add a deal to their wallet. (Wallet passes cannot be pushed to people who
 * have not saved one; see docs/WALLET_RADIUS_PUSH.md.)
 */
export interface Drop {
  id: string;
  businessId: string;
  dealId: string;
  message: string;
  radiusMiles: number;
  /** Estimated opted-in shoppers inside the radius at send time. */
  reach: number;
  sentAt: string;
}

/** What the consumer would see as a lock-screen / Wallet update. */
export interface WalletNotification {
  id: string;
  kind: 'upgrade' | 'friend' | 'ended' | 'push' | 'drop';
  message: string;
  /** Deal to open when the notification is tapped. */
  dealId?: string;
  createdAt: string;
}

/** A business owner login. Prototype: stored in the browser. Production: Supabase Auth. */
export interface BusinessAccount {
  id: string;
  email: string;
  ownerName: string;
  /** Hex PBKDF2-SHA256 salt and hash. Plain passwords are never stored. */
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface Consumer {
  id: string;
  name: string;
  lat: number;
  lng: number;
  locationLabel: string;
  radiusMiles: number;
  /** Preferred categories are boosted in the feed. Empty = no preference. */
  categories: Category[];
  /** Opted in to Neighborhood Drops from businesses near this location. */
  notifyNearby: boolean;
  points: number;
  savedDealIds: string[];
}

export interface AppState {
  version: 3;
  /** Signed-in business account (prototype session). */
  sessionAccountId: string | null;
  accounts: BusinessAccount[];
  activeBusinessId: string | null;
  consumer: Consumer;
  businesses: Business[];
  deals: Deal[];
  passes: Pass[];
  spotted: SpottedDeal[];
  pushes: PassPush[];
  drops: Drop[];
  notifications: WalletNotification[];
}

// ---------------------------------------------------------------------------
// Action inputs
// ---------------------------------------------------------------------------

export interface CreateDealInput {
  businessId: string;
  title: string;
  description: string;
  kind: DealKind;
  value: number;
  buyQty: number;
  getQty: number;
  terms: string;
  code: string;
  minSpend: number | null;
  punchVisits: PunchVisits;
  perCustomerLimit: PerCustomerLimit;
  shareUpgrade: ShareUpgrade | null;
  partnerBusinessId: string | null;
  expirationMode: ExpirationMode;
  /** YYYY-MM-DD, used when expirationMode is "fixed". */
  expiresOn: string;
  rollingHours: number | null;
  recurring: RecurringSchedule | null;
  claimLimit: number | null;
  brandColor: string;
  redemptionMethod: RedemptionMethod;
}

export interface SignUpInput {
  ownerName: string;
  email: string;
  password: string;
  business: RegisterBusinessInput;
}

export interface RegisterBusinessInput {
  name: string;
  category: Category;
  emoji: string;
  address: string;
  blurb: string;
  lat: number;
  lng: number;
}

export interface SpotDealInput {
  businessName: string;
  title: string;
  details: string;
  category: Category;
  lat: number;
  lng: number;
}
