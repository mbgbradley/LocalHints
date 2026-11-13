import { DEFAULT_CENTER } from '@/lib/geo';
import {
  DEFAULT_BRAND_COLOR,
  type AppState,
  type Business,
  type Category,
  type Deal,
  type Pass,
  type PassPush,
  type SpottedDeal,
} from '@/types/localhints';

export const DEMO_CONSUMER_ID = 'consumer-demo';
/** Demo business login. Owns biz-bean (Pro), biz-sunny (Free) and biz-taco (pilot). The account record is created asynchronously in the store (password hashing is async). */
export const DEMO_ACCOUNT_ID = 'acct-demo';
export const DEMO_EMAIL = 'owner@brewandbean.demo';
export const DEMO_PASSWORD = 'demo1234';

/**
 * Static neighborhood benchmarks (percent). Swap for a SQL aggregate later.
 * claimRate = saves / views, redeemRate = redemptions / saves.
 */
export const CATEGORY_BENCHMARKS: Record<Category, { claimRate: number; redeemRate: number }> = {
  food: { claimRate: 13, redeemRate: 19 },
  coffee: { claimRate: 12, redeemRate: 24 },
  retail: { claimRate: 11, redeemRate: 21 },
  wellness: { claimRate: 10, redeemRate: 18 },
  services: { claimRate: 9, redeemRate: 22 },
  entertainment: { claimRate: 14, redeemRate: 20 },
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

/**
 * "Concierge first deal": a ready-to-launch draft generated from a business's public info,
 * so a new owner only has to preview it and tap Go Live (zero typing).
 */
export function conciergeDealFor(biz: Business, now: number, id: string): Deal {
  const templates: Record<
    Category,
    { title: string; kind: Deal['kind']; value: number; description: string }
  > = {
    coffee: {
      title: 'Free pastry with any drink',
      kind: 'freebie',
      value: 0,
      description: `Pick any pastry when you order a drink at ${biz.name}.`,
    },
    food: {
      title: 'Free appetizer with any entree',
      kind: 'freebie',
      value: 0,
      description: `Start your meal at ${biz.name} with a free appetizer.`,
    },
    retail: {
      title: '10% off your first purchase',
      kind: 'percent',
      value: 10,
      description: `Welcome to ${biz.name}. Show this pass at checkout.`,
    },
    wellness: {
      title: 'Free 3-day trial pass',
      kind: 'freebie',
      value: 0,
      description: `Try everything ${biz.name} offers, no commitment.`,
    },
    services: {
      title: '15% off your first visit',
      kind: 'percent',
      value: 15,
      description: `New customers save at ${biz.name}.`,
    },
    entertainment: {
      title: '$3 off any ticket',
      kind: 'amount',
      value: 3,
      description: `Enjoy a night out at ${biz.name} for less.`,
    },
  };
  const t = templates[biz.category];
  const prefix = biz.name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'HINT';
  return {
    id,
    businessId: biz.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    value: t.value,
    buyQty: 1,
    getQty: 1,
    terms: 'One per customer. Show this pass at the counter.',
    code: `${prefix}${t.kind === 'freebie' ? 'FREE' : t.value}`,
    minSpend: null,
    punchVisits: 1,
    perCustomerLimit: 'once',
    shareUpgrade: null,
    partnerBusinessId: null,
    expirationMode: 'fixed',
    expiresAt: iso(now + 14 * DAY),
    rollingHours: null,
    recurring: null,
    claimLimit: null,
    brandColor: DEFAULT_BRAND_COLOR,
    redemptionMethod: 'qr',
    concierge: true,
    createdAt: iso(now),
    status: 'draft',
    viewCount: 0,
  };
}

/** Everything a seed deal needs to say; defaults fill the rest. */
type DealSpec = Partial<Deal> &
  Pick<Deal, 'id' | 'businessId' | 'title' | 'description' | 'kind' | 'code' | 'brandColor'> & {
    expiresInDays: number;
    claims: number;
    redeemed: number;
  };

function toDeal(s: DealSpec, now: number): Deal {
  return {
    id: s.id,
    businessId: s.businessId,
    title: s.title,
    description: s.description,
    kind: s.kind,
    value: s.value ?? 0,
    buyQty: s.buyQty ?? 1,
    getQty: s.getQty ?? 1,
    terms: s.terms ?? '',
    code: s.code,
    minSpend: s.minSpend ?? null,
    punchVisits: s.punchVisits ?? 1,
    perCustomerLimit: s.perCustomerLimit ?? 'once',
    shareUpgrade: s.shareUpgrade ?? null,
    partnerBusinessId: s.partnerBusinessId ?? null,
    expirationMode: s.expirationMode ?? 'fixed',
    expiresAt: iso(now + s.expiresInDays * DAY),
    rollingHours: s.rollingHours ?? null,
    recurring: s.recurring ?? null,
    claimLimit: s.claimLimit ?? null,
    brandColor: s.brandColor,
    redemptionMethod: s.redemptionMethod ?? 'qr',
    concierge: false,
    createdAt: iso(now - (s.expiresInDays < 0 ? 14 : 5) * DAY),
    status: 'live',
    viewCount: s.viewCount ?? 0,
  };
}

function genPasses(deal: Deal, claims: number, redeemed: number, now: number): Pass[] {
  const out: Pass[] = [];
  const slug = deal.code.slice(0, 4).toLowerCase();
  for (let i = 0; i < claims; i++) {
    const claimedAt = now - ((i % 48) + 1) * HOUR;
    const done = i < redeemed;
    const stamps = done ? deal.punchVisits : deal.punchVisits > 1 ? i % deal.punchVisits : 0;
    const completes = done && (deal.punchVisits > 1 || deal.perCustomerLimit === 'once');
    out.push({
      id: `seedpass-${deal.id}-${i}`,
      dealId: deal.id,
      consumerId: `seed-user-${i}`,
      code: `${deal.code}-S${String(i).padStart(3, '0')}`,
      referralCode: `s${i}-${slug}`,
      referredBy: null,
      claimedAt: iso(claimedAt),
      stamps: done ? Math.max(1, stamps) : stamps,
      friendSaves: i % 5 === 0 ? 1 : 0,
      lastRedeemedAt: done ? iso(claimedAt + 20 * 60_000) : null,
      redeemedAt: completes ? iso(claimedAt + 20 * 60_000) : null,
    });
  }
  return out;
}

export function buildSeed(now: number): AppState {
  const businesses: Business[] = [
    {
      id: 'biz-bean',
      ownerId: DEMO_ACCOUNT_ID,
      name: 'Brew & Bean Coffee',
      category: 'coffee',
      emoji: '☕',
      address: '12 Maple Square',
      ...at(0.002, -0.003),
      blurb: 'Small-batch roasts and fresh pastries, baked every morning.',
      tier: 'pro',
      status: 'approved',
      pilotEndsAt: null,
      createdAt: iso(now - 90 * DAY),
    },
    {
      id: 'biz-sunny',
      ownerId: DEMO_ACCOUNT_ID,
      name: 'Sunny Side Bakery',
      category: 'food',
      emoji: '🥐',
      address: '48 Orchard Lane',
      ...at(-0.004, 0.002),
      blurb: 'Sourdough, croissants and custom cakes.',
      tier: 'free',
      status: 'approved',
      pilotEndsAt: null,
      createdAt: iso(now - 40 * DAY),
    },
    {
      id: 'biz-taco',
      ownerId: DEMO_ACCOUNT_ID,
      name: 'Taco Lantern',
      category: 'food',
      emoji: '🌮',
      address: '91 Lantern Row',
      ...at(0.003, 0.005),
      blurb: 'Street-style tacos and agua fresca.',
      tier: 'free',
      status: 'approved',
      pilotEndsAt: iso(now + 52 * DAY),
      createdAt: iso(now - 8 * DAY),
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
      pilotEndsAt: null,
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
      pilotEndsAt: null,
      createdAt: iso(now - 200 * DAY),
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
      pilotEndsAt: null,
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
      pilotEndsAt: null,
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
      pilotEndsAt: null,
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
      terms: 'Valid until 10am. Equal or lesser value.',
      code: 'BEANBOGO',
      brandColor: '#d97706',
      expiresInDays: 3,
      viewCount: 412,
      claims: 58,
      redeemed: 31,
    },
    {
      id: 'deal-bean-punch',
      businessId: 'biz-bean',
      title: 'Buy 4 lattes, the 5th is free',
      description: 'A stamp card that lives in your phone. Collect 5 visits and the next latte is on us.',
      kind: 'freebie',
      terms: 'One stamp per visit.',
      code: 'BEANCARD',
      brandColor: '#78350f',
      punchVisits: 5,
      perCustomerLimit: 'unlimited',
      redemptionMethod: 'tap',
      expiresInDays: 25,
      viewCount: 266,
      claims: 40,
      redeemed: 6,
    },
    {
      id: 'deal-bean-pastry',
      businessId: 'biz-bean',
      title: 'Free pastry with any large drink',
      description: 'Pick any pastry from the case when you order a large drink.',
      kind: 'freebie',
      terms: 'While supplies last. Dine-in or takeaway.',
      code: 'BEANPASTRY',
      brandColor: '#e11d48',
      partnerBusinessId: 'biz-sunny',
      claimLimit: 120,
      expiresInDays: 6,
      viewCount: 188,
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
      brandColor: '#d97706',
      expiresInDays: -1,
      viewCount: 355,
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
      brandColor: '#4f46e5',
      expiresInDays: 5,
      viewCount: 134,
      claims: 17,
      redeemed: 8,
    },
    {
      id: 'deal-taco-tue',
      businessId: 'biz-taco',
      title: 'Taco Tuesday 2-for-1',
      description: 'Every taco on the menu, two for the price of one. Opens automatically on Tuesdays and Wednesdays.',
      kind: 'bogo',
      terms: 'Dine-in only. Equal or lesser value.',
      code: 'TACO2X1',
      brandColor: '#e11d48',
      expirationMode: 'recurring',
      recurring: { days: [2, 3], startHour: 11, endHour: 22 },
      partnerBusinessId: 'biz-reel',
      expiresInDays: 60,
      viewCount: 620,
      claims: 88,
      redeemed: 54,
    },
    {
      id: 'deal-taco-lunch',
      businessId: 'biz-taco',
      title: '15% off lunch combos',
      description: 'Two tacos, rice and a drink for less. Share your pass with a friend to upgrade it.',
      kind: 'percent',
      value: 15,
      terms: 'Weekdays only.',
      code: 'LUNCH15',
      brandColor: '#d97706',
      shareUpgrade: { friendsNeeded: 2, upgradedValue: 25 },
      expiresInDays: 9,
      viewCount: 240,
      claims: 30,
      redeemed: 12,
    },
    {
      id: 'deal-iron-trial',
      businessId: 'biz-iron',
      title: 'Free 3-day trial pass',
      description: 'Try every machine, class and the sauna. No credit card needed.',
      kind: 'freebie',
      terms: 'New members only. Bring photo ID.',
      code: 'IRON3',
      brandColor: '#1e293b',
      claimLimit: 100,
      expiresInDays: 10,
      viewCount: 540,
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
      brandColor: '#059669',
      shareUpgrade: { friendsNeeded: 1, upgradedValue: 40 },
      expiresInDays: 4,
      viewCount: 210,
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
      minSpend: 25,
      terms: 'Excludes gift cards and magazines.',
      code: 'PAGES5',
      brandColor: '#4f46e5',
      expiresInDays: 8,
      viewCount: 96,
      claims: 11,
      redeemed: 6,
    },
    {
      id: 'deal-spin-wash',
      businessId: 'biz-spin',
      title: 'Free dry cycle with any wash',
      description: 'Wash a load, dry it on us.',
      kind: 'freebie',
      terms: 'Up to one standard dryer. Self-serve only.',
      code: 'DRYFREE',
      brandColor: '#4f46e5',
      expiresInDays: 7,
      viewCount: 73,
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
      brandColor: '#1e293b',
      redemptionMethod: 'code',
      partnerBusinessId: 'biz-taco',
      claimLimit: 150,
      expiresInDays: 12,
      viewCount: 305,
      claims: 41,
      redeemed: 17,
    },
  ];

  const deals: Deal[] = specs.map((s) => toDeal(s, now));
  const passes: Pass[] = specs.flatMap((s, i) => genPasses(deals[i], s.claims, s.redeemed, now));

  // Passes for the demo consumer so the wallet shows different pass types.
  const demo = (p: Partial<Pass> & Pick<Pass, 'id' | 'dealId' | 'code' | 'referralCode'>): Pass => ({
    consumerId: DEMO_CONSUMER_ID,
    referredBy: null,
    claimedAt: iso(now - 2 * HOUR),
    stamps: 0,
    friendSaves: 0,
    lastRedeemedAt: null,
    redeemedAt: null,
    ...p,
  });
  passes.unshift(
    demo({ id: 'pass-demo-lunch', dealId: 'deal-taco-lunch', code: 'LUNCH15-7QK2', referralCode: 'alex-42' }),
    demo({
      id: 'pass-demo-card',
      dealId: 'deal-bean-punch',
      code: 'BEANCARD-3NPX',
      referralCode: 'alex-17',
      claimedAt: iso(now - 3 * DAY),
      stamps: 2,
      lastRedeemedAt: iso(now - 1 * DAY),
    }),
    demo({ id: 'pass-demo-taco', dealId: 'deal-taco-tue', code: 'TACO2X1-9ZLD', referralCode: 'alex-63' }),
    demo({
      id: 'pass-demo-old',
      dealId: 'deal-bean-expired',
      code: 'PUMPKIN25-4MXA',
      referralCode: 'alex-08',
      claimedAt: iso(now - 6 * DAY),
      stamps: 1,
      lastRedeemedAt: iso(now - 5 * DAY),
      redeemedAt: iso(now - 5 * DAY),
    }),
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

  const pushes: PassPush[] = [
    {
      id: 'push-1',
      businessId: 'biz-bean',
      message: '☕ Rainy day special: show this pass for a free cookie with any latte!',
      recipients: 52,
      sentAt: iso(now - 6 * DAY),
    },
  ];

  return {
    version: 3,
    sessionAccountId: null,
    accounts: [],
    activeBusinessId: null,
    consumer: {
      id: DEMO_CONSUMER_ID,
      name: 'Alex',
      lat: DEFAULT_CENTER.lat,
      lng: DEFAULT_CENTER.lng,
      locationLabel: 'Maple Square (demo district)',
      radiusMiles: 3,
      categories: [],
      notifyNearby: true,
      points: 120,
      savedDealIds: [],
    },
    businesses,
    deals,
    passes,
    spotted,
    pushes,
    drops: [],
    notifications: [],
  };
}
