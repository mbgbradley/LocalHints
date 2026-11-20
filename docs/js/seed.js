/*
 * Demo data. Used in demo mode automatically, and by the Admin "Load demo data" button.
 * Every demo business can sign in with password: demo1234
 * Example: owner@brewandbean.demo (Pro), owner@sunnybakery.demo (Free).
 */
import { emptyState, hashPassword, computeAfter, AVG_TICKET, DAY, HOUR, DEMO_CENTER } from './engine.js';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_LOGINS = [
  { email: 'owner@brewandbean.demo', note: 'Pro plan, approved, has past deals and analytics' },
  { email: 'owner@sunnybakery.demo', note: 'Free plan, approved' },
  { email: 'owner@luigis.demo', note: 'Pro plan, has a live Loop-In with Scoops' },
  { email: 'owner@scoops.demo', note: 'Free plan, approved (try accepting a Loop-In from Luigi’s)' },
  { email: 'owner@pagesbooks.demo', note: 'Pending approval (just signed up)' },
];

let seq = 0;
const id = (p) => p + 'seed' + (++seq).toString(36).padStart(4, '0');
const at = (lat, lng) => ({ lat: DEMO_CENTER.lat + lat, lng: DEMO_CENTER.lng + lng });

export async function buildSeed(now) {
  seq = 0;
  const s = emptyState();
  const pw = await hashPassword(DEMO_PASSWORD);
  const ev = (bizId, type, detail, when) => s.events.push({ id: id('e'), bizId, type, detail, at: when });

  const mk = (o) => {
    const b = {
      id: id('b'), passSalt: pw.salt, passHash: pw.hash, tier: 'free', pilotEndsAt: 0, pilotStartedAt: 0, status: 'approved',
      approvedAt: 0, closedAt: 0, logoV: 0, addressVerified: false, placeId: '', loginCount: 1, blurb: '', ...o,
    };
    b.addressRaw = b.address;
    s.businesses.push(b);
    ev(b.id, 'signup', 'Demo business', b.signedUpAt);
    if (b.approvedAt) ev(b.id, 'approved', 'Approved by admin', b.approvedAt);
    return b;
  };

  const brew = mk({ email: 'owner@brewandbean.demo', ownerName: 'Maria Lopez', name: 'Brew & Bean', category: 'cafe', emoji: '☕', address: '12 Maple Street', ...at(0.002, -0.004), blurb: 'Small-batch coffee since 2016.', tier: 'pro', signedUpAt: now - 120 * DAY, approvedAt: now - 119 * DAY, lastLoginAt: now - 1 * DAY, loginCount: 41 });
  const sunny = mk({ email: 'owner@sunnybakery.demo', ownerName: 'Sam Patel', name: 'Sunny Side Bakery', category: 'cafe', emoji: '🥐', address: '48 Oak Avenue', ...at(-0.004, 0.003), blurb: 'Fresh bread and pastries.', signedUpAt: now - 60 * DAY, approvedAt: now - 58 * DAY, lastLoginAt: now - 3 * DAY, loginCount: 14 });
  const taco = mk({ email: 'owner@tacocorner.demo', ownerName: 'Luis Ortega', name: 'Taco Corner', category: 'food', emoji: '🌮', address: '7 Elm Court', ...at(0.006, 0.005), blurb: 'Street tacos, made fresh.', signedUpAt: now - 35 * DAY, approvedAt: now - 34 * DAY, pilotStartedAt: now - 30 * DAY, pilotEndsAt: now + 30 * DAY, lastLoginAt: now - 2 * HOUR, loginCount: 22 });
  const luigi = mk({ email: 'owner@luigis.demo', ownerName: 'Luigi Romano', name: "Luigi's Pizzeria", category: 'food', emoji: '🍕', address: '90 Main Street', ...at(-0.001, -0.002), blurb: 'Wood-fired pizza by the slice.', tier: 'pro', signedUpAt: now - 80 * DAY, approvedAt: now - 79 * DAY, lastLoginAt: now - 5 * HOUR, loginCount: 30 });
  const scoops = mk({ email: 'owner@scoops.demo', ownerName: 'Priya Shah', name: 'Scoops Ice Cream', category: 'dessert', emoji: '🍦', address: '92 Main Street', ...at(-0.001, -0.0015), blurb: 'Small-batch ice cream.', signedUpAt: now - 45 * DAY, approvedAt: now - 44 * DAY, lastLoginAt: now - 9 * DAY, loginCount: 9 });
  const books = mk({ email: 'owner@pagesbooks.demo', ownerName: 'Ana Gomez', name: 'Page Turner Books', category: 'retail', emoji: '📚', address: '3 Library Lane', ...at(0.004, -0.006), blurb: 'Independent bookstore.', status: 'pending', signedUpAt: now - 2 * DAY, lastLoginAt: now - 2 * DAY, loginCount: 1 });
  const gym = mk({ email: 'owner@ironworks.demo', ownerName: 'Dan Kim', name: 'Iron Works Gym', category: 'fitness', emoji: '💪', address: '15 Industrial Way', ...at(0.009, 0.008), blurb: 'Strength training.', status: 'suspended', signedUpAt: now - 70 * DAY, approvedAt: now - 69 * DAY, lastLoginAt: now - 12 * DAY, loginCount: 6 });
  const clean = mk({ email: 'owner@oldtown.demo', ownerName: 'Grace Lee', name: 'Old Town Cleaners', category: 'services', emoji: '🧺', address: '210 Station Road', ...at(-0.008, 0.004), blurb: 'Dry cleaning and tailoring.', status: 'closed', signedUpAt: now - 150 * DAY, approvedAt: now - 149 * DAY, closedAt: now - 20 * DAY, lastLoginAt: now - 21 * DAY, loginCount: 8 });

  // Timeline extras so the admin history looks real.
  ev(brew.id, 'tier_changed', 'Changed from Free to Pro', now - 100 * DAY);
  ev(taco.id, 'pilot_started', '60-day Pro pilot', now - 30 * DAY);
  ev(luigi.id, 'tier_changed', 'Changed from Free to Pro', now - 60 * DAY);
  ev(gym.id, 'suspended', 'Reported by a customer for misleading offers', now - 11 * DAY);
  ev(clean.id, 'closed', 'Closed by the owner', now - 20 * DAY);
  ev(scoops.id, 'login', '', now - 9 * DAY);

  let consumer = 0;
  const addDeal = (b, o, views, saves, redeemed, shares = 0) => {
    const d = {
      id: id('d'), bizId: b.id, title: '', description: '', type: 'percent', value: 10, itemText: '', minSpend: 0, status: 'ended', isConcierge: false,
      startsAt: 0, endsAt: 0, createdAt: o.startsAt - DAY, publishedAt: o.startsAt, claimCap: 0, stamps: 1, color: '#0d9488', upgrade: null, views, ...o,
    };
    s.deals.push(d);
    ev(b.id, 'deal_created', d.title, d.createdAt);
    if (d.publishedAt) ev(b.id, 'deal_published', d.title, d.publishedAt);
    for (let i = 0; i < saves; i++) {
      const sh = i < shares ? 1 : 0;
      s.passes.push({
        id: id('p'), code: 'S' + consumer.toString(36).toUpperCase().padStart(5, '0'), referralCode: 'R' + String(consumer).padStart(7, '0'), kind: 'deal', dealId: d.id, bizId: b.id,
        consumerId: 'seed-consumer-' + consumer++, createdAt: d.startsAt + (i % 6) * HOUR + HOUR, stamps: i < redeemed ? d.stamps : 0, friendSaves: sh, lastRedeemAt: i < redeemed ? d.startsAt + 2 * DAY : 0,
      });
    }
    return d;
  };

  // Brew & Bean (Pro): three past deals and two live
  addDeal(brew, { title: '$1 off any latte', type: 'amount', value: 1, startsAt: now - 90 * DAY, endsAt: now - 83 * DAY }, 310, 62, 14, 6);
  addDeal(brew, { title: 'Buy one get one pastry', type: 'bogo', itemText: 'Buy any pastry, get a second free', startsAt: now - 60 * DAY, endsAt: now - 40 * DAY }, 420, 118, 61, 22);
  addDeal(brew, { title: '15% off morning orders', type: 'percent', value: 15, startsAt: now - 30 * DAY, endsAt: now - 16 * DAY }, 280, 54, 12, 4);
  addDeal(brew, { title: 'Coffee punch card', description: 'Buy 5 drinks, the 5th is free.', type: 'freeitem', itemText: 'Free drink after 5 stamps', stamps: 5, status: 'live', startsAt: now - 6 * DAY, endsAt: now + 24 * DAY }, 190, 41, 9, 0);
  addDeal(brew, { title: '20% off, upgrades to 30% with friends', description: 'Save it, share it, and get a bigger discount.', type: 'percent', value: 20, upgrade: { friendsNeeded: 2, upgradedValue: 30 }, status: 'live', startsAt: now - 2 * DAY, endsAt: now + 12 * DAY }, 120, 33, 4, 8);

  // Sunny Side (Free): suggested first deal edited and live, plus one ended
  addDeal(sunny, { title: '$2 off any drink', description: 'Treat yourself.', type: 'amount', value: 2, status: 'ended', startsAt: now - 30 * DAY, endsAt: now - 23 * DAY, isConcierge: true }, 140, 31, 8);
  addDeal(sunny, { title: 'Free cookie with any coffee', type: 'percent', value: 10, status: 'live', startsAt: now - 3 * DAY, endsAt: now + 4 * DAY }, 95, 22, 5);

  // Taco Corner (pilot)
  addDeal(taco, { title: 'Taco Tuesday: 2 for $5', type: 'bundle', value: 5, itemText: 'Two street tacos', status: 'live', startsAt: now - 4 * DAY, endsAt: now + 18 * DAY }, 260, 70, 18, 7);

  // Luigi's (Pro) with an active loop to Scoops
  const slice = addDeal(luigi, { title: 'Free garlic knots with any pizza', type: 'freeitem', itemText: 'Garlic knots with any whole pizza', status: 'live', startsAt: now - 5 * DAY, endsAt: now + 25 * DAY }, 210, 52, 15, 0);
  const slice2 = addDeal(luigi, { title: '$3 off a whole pie', type: 'amount', value: 3, status: 'live', startsAt: now - 1 * DAY, endsAt: now + 13 * DAY }, 64, 12, 2, 0);

  // Scoops (Free): suggested deal, not published yet
  const scoopDraft = addDeal(scoops, { title: '10% off any treat', description: 'Something sweet for less.', type: 'percent', value: 10, status: 'draft', isConcierge: true, startsAt: now - 3 * DAY, endsAt: now + 4 * DAY, publishedAt: 0 }, 0, 0, 0);
  void scoopDraft;
  // Page Turner (pending): suggested draft only
  s.deals.push({ id: id('d'), bizId: books.id, title: '15% off one item', description: 'Take 15% off one full-price item.', type: 'percent', value: 15, itemText: '', minSpend: 0, status: 'draft', isConcierge: true, startsAt: now - 2 * DAY, endsAt: now + 5 * DAY, createdAt: now - 2 * DAY, publishedAt: 0, claimCap: 0, stamps: 1, color: '#0d9488', upgrade: null, views: 0 });
  ev(books.id, 'deal_created', 'Suggested first deal: 15% off one item', now - 2 * DAY);

  // Gym (suspended) and cleaners (closed)
  const gd = addDeal(gym, { title: '$10 off your first class', type: 'amount', value: 10, status: 'suspended', suspendedFrom: 'live', startsAt: now - 14 * DAY, endsAt: now + 14 * DAY }, 80, 12, 1);
  void gd;
  addDeal(clean, { title: '10% off dry cleaning', type: 'percent', value: 10, status: 'ended', startsAt: now - 60 * DAY, endsAt: now - 53 * DAY }, 70, 9, 3);

  // Loop-In: Luigi's -> Scoops active; Brew -> Sunny pending (Sunny can accept)
  s.loops.push({ id: id('l'), fromBizId: luigi.id, fromDealId: slice.id, toBizId: scoops.id, rewardText: '$1 off any ice cream cone', status: 'active', createdAt: now - 10 * DAY });
  ev(luigi.id, 'loop_proposed', "Free garlic knots with Scoops: $1 off any ice cream cone", now - 11 * DAY);
  ev(scoops.id, 'loop_accepted', "Luigi's Pizzeria loop: $1 off any ice cream cone", now - 10 * DAY);
  const liveBrew = s.deals.find((d) => d.bizId === brew.id && d.status === 'live' && d.stamps === 5);
  s.loops.push({ id: id('l'), fromBizId: brew.id, fromDealId: liveBrew.id, toBizId: sunny.id, rewardText: '50 cents off any cookie', status: 'pending', createdAt: now - 1 * DAY });
  ev(brew.id, 'loop_proposed', 'Coffee punch card with Sunny Side Bakery: 50 cents off any cookie', now - 1 * DAY);
  ev(sunny.id, 'loop_proposed', 'Brew & Bean wants to loop in: 50 cents off any cookie', now - 1 * DAY);
  void slice2;

  // A few extra history events
  ev(brew.id, 'login', '', now - 1 * DAY);
  ev(taco.id, 'login', '', now - 2 * HOUR);
  ev(luigi.id, 'login', '', now - 5 * HOUR);
  ev(sunny.id, 'deal_edited', 'Free cookie with any coffee', now - 3 * DAY);

  // Second location (Pro) and a team for Brew & Bean
  brew.locations = [{ id: id('l'), name: 'Downtown', address: '200 Broad Street', ...at(0.008, 0.002), verified: false }];
  const downtown = brew.locations[0].id;
  const mkStaff = (o) => { const x = { id: id('s'), bizId: brew.id, method: 'qr', contact: '', status: 'accepted', locationId: 'main', createdAt: now - 40 * DAY, acceptedAt: now - 39 * DAY, invite: '', inviteExpiresAt: 0, ...o }; s.staff.push(x); return x; };
  const jo = mkStaff({ name: 'Jo (morning shift)', method: 'qr' });
  const kai = mkStaff({ name: 'Kai', method: 'sms', contact: '555 010 2233', locationId: downtown });
  mkStaff({ name: 'Riley', method: 'email', contact: 'riley@example.com', status: 'invited', createdAt: now - 1 * DAY, acceptedAt: 0, invite: 'demoinviteriley0000001', inviteExpiresAt: now + 6 * DAY });
  mkStaff({ name: 'Sasha', method: 'email', contact: 'sasha@example.com', status: 'suspended', createdAt: now - 60 * DAY, acceptedAt: now - 59 * DAY });
  mkStaff({ name: 'Mo (left the company)', method: 'qr', status: 'cancelled', createdAt: now - 70 * DAY, acceptedAt: now - 69 * DAY, cancelledAt: now - 20 * DAY });
  for (const p of s.passes) if (p.friendSaves > 0) p.sharedAt = p.createdAt + HOUR;
  ev(brew.id, 'staff_invited', 'Jo (morning shift) (QR)', now - 40 * DAY);
  ev(brew.id, 'staff_accepted', 'Jo (morning shift)', now - 39 * DAY);
  ev(brew.id, 'staff_invited', 'Riley (EMAIL)', now - 1 * DAY);

  // Redemption log built from the redeemed passes (before / after the deal, who rang it up, where)
  let n = 0;
  for (const p of s.passes) {
    if (p.kind !== 'deal' || !p.stamps) continue;
    const d = s.deals.find((x) => x.id === p.dealId);
    const b = s.businesses.find((x) => x.id === p.bizId);
    for (let k = 0; k < p.stamps; k++, n++) {
      const calc = computeAfter(d, Math.round(AVG_TICKET[b.category] * (0.8 + (n % 7) * 0.12) * 100) / 100);
      let staffId = '', locationId = 'main';
      if (b.id === brew.id) {
        const who = n % 4;
        if (who === 1) staffId = jo.id;
        if (who === 2) { staffId = kai.id; locationId = downtown; }
        if (who === 3) locationId = downtown;
      }
      s.redemptions.push({ id: id('r'), bizId: b.id, dealId: d.id, passId: p.id, staffId, locationId, at: Math.min(now - HOUR, d.startsAt + ((n * 7) % 9) * 0.7 * DAY + 3 * HOUR), before: calc.before, after: calc.after, exact: calc.exact });
    }
  }

  const dev = (n, extra = {}) => ({ id: 'seed-consumer-' + n, hash: 'A1B2C3D4E5F6071' + n, ip: '203.0.113.' + (10 + n), ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile Safari', screen: '390x844', tz: 'America/New_York', lang: 'en-US', platform: 'iPhone', ...extra });
  s.tips.push(
    { id: id('t'), consumerId: 'seed-consumer-1', name: 'Hot Pot House', address: '55 Pine Street', note: 'Lunch special: 20% off before 2pm', category: 'food', lat: null, lng: null, photo: '', contact: 'dana@example.com', consent: true, status: 'pending', at: now - 1 * DAY, approvedAt: 0, device: dev(1) },
    { id: id('t'), consumerId: 'seed-consumer-2', name: 'Fresh Cuts Barber', address: '4 Market Square', note: 'First haircut free for students on Mondays', category: 'beauty', lat: null, lng: null, photo: '', contact: '', consent: false, status: 'approved', at: now - 4 * DAY, approvedAt: now - 3 * DAY, device: dev(2) },
    { id: id('t'), consumerId: 'seed-consumer-3', name: 'Blue Door Yoga', address: '9 Birch Lane', note: 'Free community class on Sundays', category: 'fitness', lat: null, lng: null, photo: '', contact: '', consent: false, status: 'pending', at: now - 3 * HOUR, approvedAt: 0, device: dev(3) },
    { id: id('t'), consumerId: 'seed-consumer-2', name: 'Sweet Spot Creamery', address: '12 Harbor Road', note: 'Buy one scoop, get one free after 6pm', category: 'dessert', lat: null, lng: null, photo: '', contact: '', consent: false, status: 'approved', at: now - 1.5 * DAY, approvedAt: now - 1 * DAY, device: dev(2) },
    { id: id('t'), consumerId: 'seed-consumer-4', name: 'Page Turner Books', address: '88 Elm Street', note: '15% off used books every Saturday', category: 'retail', lat: null, lng: null, photo: '', contact: '', consent: false, status: 'approved', at: now - 9 * DAY, approvedAt: now - 8 * DAY, device: dev(4) },
  );
  s.events.sort((a, z) => a.at - z.at);
  return s;
}
