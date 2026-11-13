import { DEFAULT_CENTER } from '@/lib/geo';
import type {
  AppState,
  Blast,
  Business,
  Category,
  Deal,
  DealKind,
  Pass,
  PassTheme,
  SpottedDeal,
} from '@/types/localhints';

export const DEMO_CONSUMER_ID = 'consumer-demo';
/** The business owner the "Business" role plays. Owns biz-bean (Pro) and biz-sunny (Free). */
export const DEMO_OWNER_ID = 'owner-demo';

/** Static neighborhood benchmarks (percent). Swap for a SQL aggregate later. */
export const CATEGORY_BENCHMARKS: Record<Category, { claimRate: number; redeemRate: number }> = {
  food: { claimRate: 13, redeemRate: 52 },
  coffee: { claimRate: 12, redeemRate: 48 },
  retail: { claimRate: 11, redeemRate: 41 },
  wellness: { claimRate: 10, redeemRate: 36 },
  services: { claimRate: 9, redeemRate: 44 },
  entertainment: { claimRate: 14, redeemRate: 39 },
};

/** Assumed average ticket (USD) per category, for the "revenue influenced" estimate. */
export const AVG_TICKET: Record<Category, number> = {
  food: 22,
  coffee: 9,
  retail: 28,
  wellness: 40,
  services: 24,
  entertainment: 18,
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const iso = (t: number): string => new Date(t).toISOString();

const at = (dLat: number, dLng: number): { lat: number; lng: number } => ({
  lat: DEFAULT_CENTER.lat + dLat,
  lng: DEFAULT_CENTER.lng + dLng,
});

interface DealSpec {
  id: string;
  businessId: string;
  title: string;
  description: string;
  kind: DealKind;
  value: number;
  terms: string;
  code: string;
  expiresInDays: number;
  claimLimit: number | null;
  viewCount: number;
  theme: PassTheme;
  claims: number;
  redeemed: number;
}

function genPasses(spec: DealSpec, now: number): Pass[] {
  const out: Pass[] = [];
  for (let i = 0; i < spec.claims; i++) {
    const claimedAt = now - ((i % 48) + 1) * HOUR;
    out.push({
      id: `seedpass-${spec.id}-${i}`,
      dealId: spec.id,
      consumerId: `seed-user-${i}`,
      code: `${spec.code}-S${String(i).padStart(3, '0')}`,
      claimedAt: iso(claimedAt),
      redeemedAt: i < spec.redeemed ? iso(claimedAt + 20 * 60_000) : null,
    });
  }
  return out;
}

export function buildSeed(now: number): AppState {
  const businesses: Business[] = [
    {
      id: 'biz-bean',
      ownerId: DEMO_OWNER_ID,
      name: 'Brew & Bean Coffee',
      category: 'coffee',
      emoji: '☕',
      address: '12 Maple Square',
      ...at(0.002, -0.003),
      blurb: 'Small-batch roasts and fresh pastries, baked every morning.',
      tier: 'pro',
      status: 'approved',
      createdAt: iso(now - 90 * DAY),
    },
    {
      id: 'biz-sunny',
      ownerId: DEMO_OWNER_ID,
      name: 'Sunny Side Bakery',
      category: 'food',
      emoji: '🥐',
      address: '48 Orchard Lane',
      ...at(-0.004, 0.002),
      blurb: 'Sourdough, croissants and custom cakes.',
      tier: 'free',
      status: 'approved',
      createdAt: iso(now - 40 * DAY),
    },
    {
      id: 'biz-iron',
      ownerId: 'owner-2',
      name: 'Ironclad Fitness',
      category: 'wellness',
      emoji: '💪',
      address: '230 Foundry Street',
      ...at(0.009, 0.006),
      blurb: 'Strength-focused gym with no contracts.',
      tier: 'pro',
      status: 'approved',
      createdAt: iso(now - 120 * DAY),
    },
    {
      id: 'biz-pages',
      ownerId: 'owner-3',
      name: 'Page Turner Books',
      category: 'retail',
      emoji: '📚',
      address: '7 Chapter Court',
      ...at(-0.007, -0.008),
      blurb: 'Independent bookstore with a reading nook.',
      tier: 'free',
      status: 'approved',
      createdAt: iso(now - 200 * DAY),
    },
    {
      id: 'biz-taco',
      ownerId: 'owner-4',
      name: 'Taco Lantern',
      category: 'food',
      emoji: '🌮',
      address: '91 Lantern Row',
      ...at(0.003, 0.005),
      blurb: 'Street-style tacos and agua fresca.',
      tier: 'pro',
      status: 'approved',
      createdAt: iso(now - 75 * DAY),
    },
    {
      id: 'biz-spin',
      ownerId: 'owner-5',
      name: 'Spin Cycle Laundry',
      category: 'services',
      emoji: '🧺',
      address: '15 Suds Avenue',
      ...at(-0.012, 0.004),
      blurb: 'Self-serve and wash-and-fold, open late.',
      tier: 'free',
      status: 'approved',
      createdAt: iso(now - 150 * DAY),
    },
    {
      id: 'biz-reel',
      ownerId: 'owner-6',
      name: 'Reel Deal Cinema',
      category: 'entertainment',
      emoji: '🎬',
      address: '300 Marquee Boulevard',
      ...at(0.016, -0.011),
      blurb: 'Neighborhood cinema with classics and new releases.',
      tier: 'pro',
      status: 'approved',
      createdAt: iso(now - 260 * DAY),
    },
    {
      id: 'biz-bloom',
      ownerId: 'owner-7',
      name: 'Bloom & Thread Florist',
      category: 'retail',
      emoji: '🌸',
      address: '3 Petal Passage',
      ...at(0.005, -0.006),
      blurb: 'Seasonal bouquets and workshop classes.',
      tier: 'free',
      status: 'pending',
      createdAt: iso(now - 1 * DAY),
    },
  ];

  const specs: DealSpec[] = [
    {
      id: 'deal-bean-latte',
      businessId: 'biz-bean',
      title: 'BOGO lattes before 10am',
      description: 'Buy any latte, get a second one free. Perfect for sharing the morning rush.',
      kind: 'bogo',
      value: 1,
      terms: 'Valid until 10am. Equal or lesser value. One per customer.',
      code: 'BEANBOGO',
      expiresInDays: 3,
      claimLimit: null,
      viewCount: 412,
      theme: 'amber',
      claims: 58,
      redeemed: 31,
    },
    {
      id: 'deal-bean-pastry',
      businessId: 'biz-bean',
      title: 'Free pastry with any large drink',
      description: 'Pick any pastry from the case when you order a large drink.',
      kind: 'freebie',
      value: 0,
      terms: 'While supplies last. Dine-in or takeaway.',
      code: 'BEANPASTRY',
      expiresInDays: 6,
      claimLimit: 120,
      viewCount: 188,
      theme: 'rose',
      claims: 21,
      redeemed: 9,
    },
    {
      id: 'deal-bean-expired',
      businessId: 'biz-bean',
      title: 'Pumpkin spice flight, 25% off',
      description: 'Three seasonal mini-lattes. Autumn in a tray.',
      kind: 'percent',
      value: 25,
      terms: 'Seasonal menu only.',
      code: 'PUMPKIN25',
      expiresInDays: -1,
      claimLimit: null,
      viewCount: 355,
      theme: 'amber',
      claims: 74,
      redeemed: 49,
    },
    {
      id: 'deal-sunny-loaf',
      businessId: 'biz-sunny',
      title: '20% off sourdough loaves',
      description: 'Our slow-fermented country sourdough, baked fresh each morning.',
      kind: 'percent',
      value: 20,
      terms: 'One loaf per visit.',
      code: 'SUNNY20',
      expiresInDays: 5,
      claimLimit: null,
      viewCount: 134,
      theme: 'indigo',
      claims: 17,
      redeemed: 8,
    },
    {
      id: 'deal-iron-trial',
      businessId: 'biz-iron',
      title: 'Free 3-day trial pass',
      description: 'Try every machine, class and the sauna. No credit card needed.',
      kind: 'freebie',
      value: 0,
      terms: 'New members only. Bring photo ID.',
      code: 'IRON3',
      expiresInDays: 10,
      claimLimit: 100,
      viewCount: 540,
      theme: 'slate',
      claims: 64,
      redeemed: 22,
    },
    {
      id: 'deal-iron-join',
      businessId: 'biz-iron',
      title: '$25 off your joining fee',
      description: 'Skip the startup cost and start lifting this week.',
      kind: 'amount',
      value: 25,
      terms: 'Annual or monthly memberships.',
      code: 'JOIN25',
      expiresInDays: 4,
      claimLimit: null,
      viewCount: 210,
      theme: 'emerald',
      claims: 19,
      redeemed: 7,
    },
    {
      id: 'deal-pages-5',
      businessId: 'biz-pages',
      title: '$5 off any purchase over $25',
      description: 'Grab a new read and a cozy corner to start it in.',
      kind: 'amount',
      value: 5,
      terms: 'Excludes gift cards and magazines.',
      code: 'PAGES5',
      expiresInDays: 8,
      claimLimit: null,
      viewCount: 96,
      theme: 'indigo',
      claims: 11,
      redeemed: 6,
    },
    {
      id: 'deal-taco-tue',
      businessId: 'biz-taco',
      title: 'Taco Tuesday 2-for-1',
      description: 'Every taco on the menu, two for the price of one.',
      kind: 'bogo',
      value: 1,
      terms: 'Dine-in only. Equal or lesser value.',
      code: 'TACO2X1',
      expiresInDays: 1.2,
      claimLimit: null,
      viewCount: 620,
      theme: 'rose',
      claims: 88,
      redeemed: 54,
    },
    {
      id: 'deal-taco-lunch',
      businessId: 'biz-taco',
      title: '15% off lunch combos',
      description: 'Two tacos, rice and a drink for less, weekdays 11am to 2pm.',
      kind: 'percent',
      value: 15,
      terms: 'Weekdays only.',
      code: 'LUNCH15',
      expiresInDays: 9,
      claimLimit: null,
      viewCount: 240,
      theme: 'amber',
      claims: 30,
      redeemed: 12,
    },
    {
      id: 'deal-spin-wash',
      businessId: 'biz-spin',
      title: 'Free dry cycle with any wash',
      description: 'Wash a load, dry it on us.',
      kind: 'freebie',
      value: 0,
      terms: 'Up to one standard dryer. Self-serve only.',
      code: 'DRYFREE',
      expiresInDays: 7,
      claimLimit: null,
      viewCount: 73,
      theme: 'indigo',
      claims: 9,
      redeemed: 4,
    },
    {
      id: 'deal-reel-matinee',
      businessId: 'biz-reel',
      title: '$4 off matinee tickets',
      description: 'Any showing before 4pm, any day of the week.',
      kind: 'amount',
      value: 4,
      terms: 'Tickets purchased at the box office.',
      code: 'MATINEE',
      expiresInDays: 12,
      claimLimit: 150,
      viewCount: 305,
      theme: 'slate',
      claims: 41,
      redeemed: 17,
    },
  ];

  const deals: Deal[] = specs.map((s) => ({
    id: s.id,
    businessId: s.businessId,
    title: s.title,
    description: s.description,
    kind: s.kind,
    value: s.value,
    terms: s.terms,
    code: s.code,
    createdAt: iso(now - (s.expiresInDays < 0 ? 14 : 5) * DAY),
    expiresAt: iso(now + s.expiresInDays * DAY),
    status: 'live',
    claimLimit: s.claimLimit,
    viewCount: s.viewCount,
    theme: s.theme,
  }));

  const passes: Pass[] = specs.flatMap((s) => genPasses(s, now));

  // Two passes for the demo consumer so the wallet is not empty.
  passes.unshift(
    {
      id: 'pass-demo-1',
      dealId: 'deal-taco-tue',
      consumerId: DEMO_CONSUMER_ID,
      code: 'TACO2X1-7QK2',
      claimedAt: iso(now - 2 * HOUR),
      redeemedAt: null,
    },
    {
      id: 'pass-demo-2',
      dealId: 'deal-bean-expired',
      consumerId: DEMO_CONSUMER_ID,
      code: 'PUMPKIN25-4MXA',
      claimedAt: iso(now - 6 * DAY),
      redeemedAt: iso(now - 5 * DAY),
    },
  );

  const spotted: SpottedDeal[] = [
    {
      id: 'spot-1',
      userId: 'neighbor-1',
      businessName: "Mario's Pizza",
      title: 'Slice + soda for $4 until 4pm',
      details: 'Saw the chalkboard sign out front. Plain or pepperoni.',
      category: 'food',
      ...at(0.001, 0.0015),
      status: 'pending',
      createdAt: iso(now - 3 * HOUR),
      upvotes: 4,
    },
    {
      id: 'spot-2',
      userId: 'neighbor-2',
      businessName: 'Corner Dry Cleaners',
      title: '50% off comforter cleaning this week',
      details: 'Poster in the window, ends Sunday.',
      category: 'services',
      ...at(-0.002, -0.004),
      status: 'pending',
      createdAt: iso(now - 9 * HOUR),
      upvotes: 1,
    },
    {
      id: 'spot-3',
      userId: 'neighbor-3',
      businessName: "Gizmo's Arcade",
      title: 'Free 5 tokens with any $10 card',
      details: 'Ask at the counter, no coupon needed.',
      category: 'entertainment',
      ...at(0.004, -0.002),
      status: 'approved',
      createdAt: iso(now - 1 * DAY),
      upvotes: 12,
    },
    {
      id: 'spot-4',
      userId: DEMO_CONSUMER_ID,
      businessName: 'Green Leaf Juice',
      title: 'Buy one get one smoothies on Fridays',
      details: 'Mentioned on their Instagram story.',
      category: 'wellness',
      ...at(0.0025, 0.0035),
      status: 'pending',
      createdAt: iso(now - 5 * HOUR),
      upvotes: 0,
    },
  ];

  const blasts: Blast[] = [
    {
      id: 'blast-1',
      businessId: 'biz-bean',
      message: '☕ Rainy day special: BOGO lattes until 10am. Show your LocalHints pass!',
      radiusMiles: 1.5,
      reach: 165,
      sentAt: iso(now - 6 * DAY),
    },
  ];

  return {
    version: 1,
    role: 'consumer',
    activeBusinessId: 'biz-bean',
    consumer: {
      id: DEMO_CONSUMER_ID,
      name: 'Alex',
      lat: DEFAULT_CENTER.lat,
      lng: DEFAULT_CENTER.lng,
      locationLabel: 'Maple Square (demo district)',
      radiusMiles: 3,
      categories: [],
      points: 120,
      savedDealIds: [],
    },
    businesses,
    deals,
    passes,
    spotted,
    blasts,
  };
}
