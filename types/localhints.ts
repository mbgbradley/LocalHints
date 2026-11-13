// LocalHints domain model. Every shape in the app lives here so that a future
// Supabase (PostgreSQL + PostGIS) schema can be derived from one file.

export type Role = 'consumer' | 'business' | 'admin';
export type Tier = 'free' | 'pro';
export type Category =
  | 'food'
  | 'coffee'
  | 'retail'
  | 'wellness'
  | 'services'
  | 'entertainment';
export type DealKind = 'percent' | 'amount' | 'bogo' | 'freebie';
export type BusinessStatus = 'pending' | 'approved' | 'suspended';
export type DealStatus = 'live' | 'paused';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export type PassTheme = 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate';

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
  priceUsd: number;
  maxActiveDeals: number;
  blastsPerMonth: number;
  /** Unlocks BOGO/freebie deals, custom duration, claim caps, themes, custom codes. */
  customCoupons: boolean;
  /** Unlocks category benchmarks in analytics. */
  benchmarks: boolean;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    label: 'Free',
    priceUsd: 0,
    maxActiveDeals: 1,
    blastsPerMonth: 0,
    customCoupons: false,
    benchmarks: false,
  },
  pro: {
    label: 'Pro',
    priceUsd: 29,
    maxActiveDeals: 25,
    blastsPerMonth: 4,
    customCoupons: true,
    benchmarks: true,
  },
};

/** Free-tier deals always run for exactly this many days. */
export const FREE_DEAL_DURATION_DAYS = 7;
export const BLAST_MAX_CHARS = 140;
export const BLAST_MIN_CHARS = 10;

/** Loyalty points awarded to the consumer. */
export const POINTS = { claim: 5, redeem: 20, spotApproved: 25 } as const;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Business {
  id: string;
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
  createdAt: string;
}

export interface Deal {
  id: string;
  businessId: string;
  title: string;
  description: string;
  kind: DealKind;
  /** Percent (1-90) or dollars. Ignored for bogo/freebie. */
  value: number;
  terms: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  status: DealStatus;
  /** null = unlimited claims */
  claimLimit: number | null;
  viewCount: number;
  theme: PassTheme;
}

export interface Pass {
  id: string;
  dealId: string;
  consumerId: string;
  /** Unique per pass, e.g. BEANBOGO-7QK2. The cashier enters this to redeem. */
  code: string;
  claimedAt: string;
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

export interface Blast {
  id: string;
  businessId: string;
  message: string;
  radiusMiles: number;
  reach: number;
  sentAt: string;
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
  points: number;
  savedDealIds: string[];
}

export interface AppState {
  version: 1;
  role: Role;
  activeBusinessId: string | null;
  consumer: Consumer;
  businesses: Business[];
  deals: Deal[];
  passes: Pass[];
  spotted: SpottedDeal[];
  blasts: Blast[];
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
  terms: string;
  code: string;
  durationDays: number;
  claimLimit: number | null;
  theme: PassTheme;
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
