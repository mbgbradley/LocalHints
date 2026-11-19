/*
 * LocalHints engine: ALL business rules and the whole HTTP-style API live in this one file.
 *
 * The same file runs in two places:
 *   1. Cloudflare Worker (live mode)  -> worker/index.js imports it. Data lives in Cloudflare KV.
 *   2. The browser (demo mode)        -> js/api.js imports it. Data lives in localStorage.
 *
 * It has no dependencies. It uses only Web standards (fetch, WebCrypto, TextEncoder) that both
 * places provide. Change a rule here and both modes change together.
 *
 * Entry point: handle(ctx, req) -> { status, body }
 *   ctx = { store, env, fetch, demo, origin, seed?, autoSeed? }
 *   req = { method, path, query, body, headers, ip }
 */

// ---------------------------------------------------------------- constants

export const DAY = 864e5;
export const HOUR = 36e5;
export const UNLIMITED = 1e9;

export const CATEGORIES = [
  { id: 'food', label: 'Food & Drink', emoji: '🍕' },
  { id: 'cafe', label: 'Coffee & Bakery', emoji: '☕' },
  { id: 'dessert', label: 'Dessert', emoji: '🍦' },
  { id: 'retail', label: 'Shopping', emoji: '🛍️' },
  { id: 'beauty', label: 'Beauty & Wellness', emoji: '✂️' },
  { id: 'fitness', label: 'Fitness', emoji: '💪' },
  { id: 'services', label: 'Services', emoji: '🛠️' },
  { id: 'fun', label: 'Entertainment', emoji: '🎬' },
];
const CAT_IDS = CATEGORIES.map((c) => c.id);

export const LIMITS = {
  free: { dealsPerMonth: 2, savesPerMonth: 50, dropsPerMonth: 0, staff: 2, locations: 1 },
  pro: { dealsPerMonth: UNLIMITED, savesPerMonth: UNLIMITED, dropsPerMonth: 4, staff: 15, locations: 10 },
};
export const PILOT = { slots: 5, days: 60 };
const TIP_LIFE = 30 * DAY; // a spotted deal stays live this long after approval
const RESET_LIFE = HOUR; // password reset links work for 1 hour
export const PRICE = { monthly: 29, yearly: 290 };
export const DEAL_TYPES = ['percent', 'amount', 'bogo', 'freeitem', 'bundle'];
export const FREE_DEAL_TYPES = ['percent', 'amount'];
export const DEMO_CENTER = { lat: 40.744, lng: -73.9903 };

export const AVG_TICKET = { food: 18, cafe: 9, dessert: 7, retail: 35, beauty: 45, fitness: 30, services: 60, fun: 20 };
export const BENCH = {
  food: { saveRate: 0.2, redeemRate: 0.35 },
  cafe: { saveRate: 0.24, redeemRate: 0.42 },
  dessert: { saveRate: 0.22, redeemRate: 0.4 },
  retail: { saveRate: 0.15, redeemRate: 0.25 },
  beauty: { saveRate: 0.12, redeemRate: 0.3 },
  fitness: { saveRate: 0.1, redeemRate: 0.22 },
  services: { saveRate: 0.1, redeemRate: 0.28 },
  fun: { saveRate: 0.18, redeemRate: 0.3 },
};

export const EVENT_LABELS = {
  signup: 'Signed up',
  approved: 'Approved by admin',
  suspended: 'Suspended by admin',
  reinstated: 'Reinstated by admin',
  closed: 'Account closed',
  reopened: 'Account reopened',
  login: 'Logged in',
  deal_created: 'New deal created',
  deal_published: 'Deal published',
  deal_edited: 'Deal edited',
  deal_status: 'Deal status changed',
  deal_deleted: 'Draft deleted',
  tier_changed: 'Plan changed',
  upgrade_requested: 'Asked to upgrade to Pro',
  pilot_started: 'Pilot started',
  pilot_ended: 'Pilot ended',
  loop_proposed: 'Loop-In proposed',
  loop_accepted: 'Loop-In accepted',
  loop_declined: 'Loop-In declined',
  loop_ended: 'Loop-In ended',
  drop_sent: 'Neighborhood Drop sent',
  push_sent: 'Pass Push sent',
  redeem: 'Redeemed a pass',
  profile_updated: 'Profile updated',
  logo_updated: 'Logo updated',
  staff_invited: 'Team member invited',
  staff_accepted: 'Team member accepted',
  staff_suspended: 'Team member suspended',
  staff_reinstated: 'Team member reinstated',
  staff_removed: 'Team member cancelled',
  location_added: 'Location added',
  location_removed: 'Location removed',
  password_reset_requested: 'Password reset requested',
  password_reset: 'Password changed',
};

// ---------------------------------------------------------------- small helpers

const enc = new TextEncoder();
const ok = (body, status = 200) => ({ status, body });
const err = (message, status = 400, extra) => ({ status, body: { error: message, ...(extra || {}) } });

function rand(n = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}
const uid = (p) => p + rand(10);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(n = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
const monthKey = (ms) => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const sameMonth = (a, b) => monthKey(a) === monthKey(b);
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function haversineMiles(a, b) {
  const R = 3958.8;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function emptyState() {
  return {
    v: 1,
    businesses: [],
    deals: [],
    passes: [],
    events: [],
    loops: [],
    drops: [],
    subscribers: [],
    alerts: [],
    tips: [],
    redemptions: [],
    staff: [],
    rate: {},
    secret: null,
  };
}

// ---------------------------------------------------------------- crypto (passwords, tokens)

function toB64u(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function signToken(secret, payload) {
  const body = toB64u(enc.encode(JSON.stringify(payload)));
  return body + '.' + (await hmac(secret, body));
}
async function readToken(secret, token, now) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!safeEqual(sig, await hmac(secret, body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}
// Cloudflare Workers allow at most 100,000 PBKDF2 iterations.
const PBKDF2_ITERATIONS = 100000;
export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? fromB64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { salt: toB64u(salt), hash: toB64u(bits) };
}
async function sha256(s) {
  return toB64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export function validEmail(e) {
  return typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
export function passwordProblem(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Password needs at least one letter and one number.';
  if (p.length > 100) return 'Password is too long.';
  return null;
}

// ---------------------------------------------------------------- rate limiting (stored in state)

function limited(state, key, now) {
  const r = state.rate[key];
  return !!(r && r.until > now);
}
function failure(state, key, now, max = 5, windowMs = 15 * 60 * 1000) {
  const r = state.rate[key] && state.rate[key].reset > now ? state.rate[key] : { n: 0, reset: now + windowMs, until: 0 };
  r.n += 1;
  if (r.n >= max) r.until = now + windowMs;
  state.rate[key] = r;
}
function clearFailures(state, key) {
  delete state.rate[key];
}
function pruneRate(state, now) {
  for (const k of Object.keys(state.rate)) if (state.rate[k].reset < now && state.rate[k].until < now) delete state.rate[k];
}
function hit(state, key, now, max, windowMs) {
  // counts every call (not only failures); returns true when over the limit
  const r = state.rate[key] && state.rate[key].reset > now ? state.rate[key] : { n: 0, reset: now + windowMs, until: 0 };
  r.n += 1;
  state.rate[key] = r;
  return r.n > max;
}

// ---------------------------------------------------------------- domain helpers

export function effectiveTier(b, now) {
  return b.pilotEndsAt && b.pilotEndsAt > now ? 'pro' : b.tier;
}
export function isPilot(b, now) {
  return !!(b.pilotEndsAt && b.pilotEndsAt > now);
}
export function limitsFor(b, now) {
  return LIMITS[effectiveTier(b, now)];
}
/** The kind of discount a deal has once upgraded (% or $). Older deals saved before this option use the deal's own kind. */
export const upgradedType = (d) => (d.upgrade && d.upgrade.upgradedType) || d.type;
export function dealLabel(d, upgraded) {
  const up = !!(upgraded && d.upgrade);
  const v = up ? d.upgrade.upgradedValue : d.value;
  const t = up ? upgradedType(d) : d.type;
  if (t === 'percent') return `${v}% OFF`;
  if (t === 'amount') return `$${v} OFF`;
  if (d.type === 'bogo') return 'BUY 1 GET 1';
  if (d.type === 'freeitem') return 'FREE ITEM';
  return `$${d.value} BUNDLE`;
}
export function isLive(d, b, now) {
  return d.status === 'live' && b.status === 'approved' && d.startsAt <= now && now < d.endsAt;
}
export function passStatus(p, d, b, now) {
  if (b.status === 'suspended' || b.status === 'closed') return 'suspended';
  if (p.kind === 'loop') {
    if (p.stamps >= 1) return 'complete';
    return now > p.expiresAt ? 'expired' : 'active';
  }
  if (!d) return 'ended';
  if (d.status === 'suspended') return 'suspended';
  if (d.status === 'ended') return 'ended';
  if (d.status === 'paused') return 'paused';
  if (p.stamps >= d.stamps) return 'complete';
  if (now >= d.endsAt) return 'expired';
  if (now < d.startsAt) return 'scheduled';
  return 'active';
}
const upgradedPass = (d, p) => !!(d && d.upgrade && p.friendSaves >= d.upgrade.friendsNeeded);

const getBiz = (s, id) => s.businesses.find((b) => b.id === id);
const getDeal = (s, id) => s.deals.find((d) => d.id === id);

function log(state, ctx, bizId, type, detail) {
  state.events.push({ id: uid('e'), bizId, type, detail: detail || '', at: ctx.now });
  if (state.events.length > 5000) state.events.splice(0, state.events.length - 5000);
}
function alertTo(state, ctx, consumerId, kind, title, body, extra) {
  state.alerts.push({ id: uid('a'), consumerId, kind, title, body, at: ctx.now, ...(extra || {}) });
  if (state.alerts.length > 20000) state.alerts.splice(0, state.alerts.length - 20000);
}

const CONCIERGE = {
  food: { title: '15% off your meal', description: 'Show this pass at the counter for 15% off your order.', type: 'percent', value: 15 },
  cafe: { title: '$2 off any drink', description: 'Treat yourself. $2 off any handcrafted drink.', type: 'amount', value: 2 },
  dessert: { title: '10% off any treat', description: 'Something sweet for less. Show this pass at checkout.', type: 'percent', value: 10 },
  retail: { title: '15% off one item', description: 'Take 15% off one full-price item.', type: 'percent', value: 15 },
  beauty: { title: '$10 off your visit', description: 'Welcome in. $10 off any service.', type: 'amount', value: 10 },
  fitness: { title: '$10 off your first class', description: 'Try us out. $10 off your first class or day pass.', type: 'amount', value: 10 },
  services: { title: '10% off your first service', description: 'New neighbors get 10% off their first service.', type: 'percent', value: 10 },
  fun: { title: '$3 off admission', description: 'Enjoy $3 off admission for one guest.', type: 'amount', value: 3 },
};

function makeConcierge(b, now) {
  const t = CONCIERGE[b.category] || CONCIERGE.food;
  return {
    id: uid('d'), bizId: b.id, ...t,
    itemText: '', minSpend: 0, status: 'draft', isConcierge: true,
    startsAt: now, endsAt: now + 7 * DAY, createdAt: now, publishedAt: 0,
    claimCap: 0, stamps: 1, color: '#0d9488', upgrade: null, views: 0,
  };
}

// ---------------------------------------------------------------- deal validation

function normalizeDeal(biz, inp, now, existing) {
  const pro = effectiveTier(biz, now) === 'pro';
  const pick = (k, dflt) => (inp[k] !== undefined ? inp[k] : existing ? existing[k] : dflt);

  const title = clean(pick('title', ''), 60);
  if (title.length < 3) return { error: 'Give the deal a title (3 to 60 characters).' };
  const description = clean(pick('description', ''), 240);
  const type = pick('type', 'percent');
  if (!DEAL_TYPES.includes(type)) return { error: 'Unknown deal type.' };
  if (!pro && !FREE_DEAL_TYPES.includes(type)) {
    return { error: 'The Free plan supports % off and $ off deals. Upgrade to Pro for buy-one-get-one, free item and bundle deals.', upgrade: true };
  }

  let value = Number(pick('value', 0));
  let itemText = '';
  if (type === 'percent') {
    if (!Number.isInteger(value) || value < 1 || value > 90) return { error: 'Percent off must be a whole number from 1 to 90.' };
  } else if (type === 'amount' || type === 'bundle') {
    if (!isNum(value) || value < 1 || value > 500) return { error: 'Dollar amount must be between 1 and 500.' };
    value = Math.round(value * 100) / 100;
  } else value = 0;
  if (type === 'bogo' || type === 'freeitem' || type === 'bundle') {
    itemText = clean(pick('itemText', ''), 80);
    if (itemText.length < 3) return { error: 'Say what the customer gets (3 to 80 characters).' };
  }

  // start / end. A deal that has already started keeps its start; otherwise it starts now or later (max 60 days ahead).
  const isStarted = !!(existing && existing.status !== 'draft' && existing.startsAt <= now);
  let startsAt = existing && isStarted ? existing.startsAt : inp.startsAt !== undefined ? Number(inp.startsAt) : now;
  if (!isNum(startsAt)) startsAt = now;
  if (!isStarted) startsAt = Math.min(Math.max(startsAt, now), now + 60 * DAY);
  let endsAt = startsAt + 7 * DAY;
  if (pro) {
    const keep = isStarted && existing ? existing.endsAt : endsAt;
    const wanted = Number(inp.endsAt !== undefined ? inp.endsAt : keep);
    if (isNum(wanted)) endsAt = wanted;
    if (endsAt < startsAt + HOUR) return { error: 'The deal must run for at least one hour.' };
    if (endsAt > startsAt + 90 * DAY) return { error: 'Deals can run for at most 90 days.' };
  } else if (isStarted && existing) endsAt = existing.endsAt;

  // Pro-only extras. On Free they are reset, even if someone bypasses the form.
  let minSpend = 0, claimCap = 0, stamps = 1, color = '#0d9488', upgrade = null;
  if (pro) {
    minSpend = Number(pick('minSpend', 0)) || 0;
    if (minSpend < 0 || minSpend > 500) return { error: 'Minimum spend must be between 0 and 500.' };
    claimCap = Math.floor(Number(pick('claimCap', 0)) || 0);
    if (claimCap < 0 || claimCap > 100000) return { error: 'Claim limit must be between 1 and 100000 (or empty for no limit).' };
    stamps = Math.floor(Number(pick('stamps', 1)) || 1);
    if (![1, 3, 5, 10].includes(stamps)) return { error: 'Punch cards can have 1, 3, 5 or 10 stamps.' };
    color = String(pick('color', '#0d9488'));
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Brand color must look like #0d9488.' };
    const up = pick('upgrade', null);
    if (up && up.friendsNeeded) {
      if (type !== 'percent' && type !== 'amount') return { error: 'Share-to-upgrade works with % off and $ off deals.' };
      const fn = Math.floor(Number(up.friendsNeeded));
      const uv = Number(up.upgradedValue);
      const ut = up.upgradedType === 'percent' || up.upgradedType === 'amount' ? up.upgradedType : type;
      if (!(fn >= 1 && fn <= 10)) return { error: 'Friends needed must be between 1 and 10.' };
      if (!isNum(uv) || uv <= 0 || (ut === 'percent' && uv > 90) || (ut === 'amount' && uv > 500)) {
        return { error: ut === 'percent' ? 'The upgraded offer must be between 1% and 90%.' : 'The upgraded offer must be between $1 and $500.' };
      }
      if (ut === type && uv <= value) return { error: 'The upgraded offer must be bigger than the starting offer.' };
      upgrade = { friendsNeeded: fn, upgradedValue: uv, upgradedType: ut };
    }
  }
  return { fields: { title, description, type, value, itemText, minSpend, startsAt, endsAt, claimCap, stamps, color, upgrade } };
}

// ---------------------------------------------------------------- address verification (Google Geocoding)

async function geocode(ctx, address) {
  const key = ctx.env && ctx.env.GOOGLE_MAPS_API_KEY;
  if (!key || !ctx.fetch) return { unavailable: true, reason: 'not_configured' };
  let data;
  try {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(address) +
      (ctx.env.GOOGLE_REGION ? '&region=' + encodeURIComponent(ctx.env.GOOGLE_REGION) : '') + '&key=' + encodeURIComponent(key);
    data = await (await ctx.fetch(url)).json();
  } catch {
    return { unavailable: true, reason: 'network' };
  }
  if (data.status === 'ZERO_RESULTS') return { ok: false, error: 'We could not find that address. Check the street, city and state.' };
  if (data.status !== 'OK' || !data.results || !data.results[0]) return { unavailable: true, reason: data.status || 'error' };
  const r = data.results[0];
  const streetLevel = (r.types || []).some((t) => ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest'].includes(t));
  if (!streetLevel) return { ok: false, error: 'That looks like a general area, not a street address. Add the street number and name.', formatted: r.formatted_address };
  return {
    ok: true,
    formatted: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    placeId: r.place_id,
    partial: !!r.partial_match,
  };
}

// ---------------------------------------------------------------- public views

function logoShown(b, now) {
  return !!b.logoV && effectiveTier(b, now) === 'pro';
}
function bizPublic(b, now) {
  return { id: b.id, name: b.name, category: b.category, emoji: b.emoji, address: b.address, lat: b.lat, lng: b.lng, blurb: b.blurb, hasLogo: logoShown(b, now), logoV: b.logoV,
    locations: (b.locations || []).map((l) => ({ id: l.id, name: l.name, address: l.address, lat: l.lat, lng: l.lng })) };
}
function loopFor(state, d, now) {
  const l = state.loops.find((x) => x.fromDealId === d.id && x.status === 'active');
  if (!l) return null;
  const partner = getBiz(state, l.toBizId);
  if (!partner || partner.status !== 'approved') return null;
  return { id: l.id, rewardText: l.rewardText, partner: bizPublic(partner, now) };
}
function dealPublic(state, d, now, extra) {
  const b = getBiz(state, d.bizId);
  const saves = state.passes.filter((p) => p.dealId === d.id).length;
  return {
    id: d.id, title: d.title, description: d.description, type: d.type, value: d.value, itemText: d.itemText,
    minSpend: d.minSpend, startsAt: d.startsAt, endsAt: d.endsAt, status: d.status, label: dealLabel(d),
    stamps: d.stamps, color: d.color, upgrade: d.upgrade, claimCap: d.claimCap,
    spotsLeft: d.claimCap ? Math.max(0, d.claimCap - saves) : null,
    biz: bizPublic(b, now), loop: loopFor(state, d, now), ...(extra || {}),
  };
}
function passPublic(state, p, now) {
  const d = p.dealId ? getDeal(state, p.dealId) : null;
  const b = getBiz(state, p.bizId);
  const up = upgradedPass(d, p);
  let loop = null;
  if (p.kind === 'loop') {
    const l = state.loops.find((x) => x.id === p.loopId);
    const src = l && getBiz(state, l.fromBizId);
    loop = { rewardText: p.rewardText, from: src ? bizPublic(src, now) : null };
  }
  return {
    id: p.id, code: p.code, kind: p.kind, status: passStatus(p, d, b, now), stamps: p.stamps,
    stampsNeeded: p.kind === 'loop' ? 1 : d ? d.stamps : 1, createdAt: p.createdAt, expiresAt: p.expiresAt || (d ? d.endsAt : 0),
    referralCode: p.referralCode, friendSaves: p.friendSaves, upgraded: up,
    label: d ? dealLabel(d, up) : p.rewardText, loop,
    deal: d ? dealPublic(state, d, now) : null, biz: bizPublic(b, now),
  };
}

function usage(state, b, now) {
  return {
    dealsPublished: state.deals.filter((d) => d.bizId === b.id && d.publishedAt && sameMonth(d.publishedAt, now)).length,
    saves: state.passes.filter((p) => p.bizId === b.id && p.kind === 'deal' && sameMonth(p.createdAt, now)).length,
    drops: state.drops.filter((x) => x.bizId === b.id && sameMonth(x.at, now)).length,
  };
}
function dealMetrics(state, d) {
  const passes = state.passes.filter((p) => p.dealId === d.id && p.kind === 'deal');
  const saves = passes.length;
  const redemptions = passes.filter((p) => p.stamps > 0).length;
  const shares = passes.reduce((n, p) => n + p.friendSaves, 0);
  return { views: d.views || 0, saves, shares, redemptions };
}
function ownerDeal(state, d, now) {
  const b = getBiz(state, d.bizId);
  return { ...dealPublic(state, d, now), isConcierge: !!d.isConcierge, publishedAt: d.publishedAt, createdAt: d.createdAt, suspendedFrom: d.suspendedFrom || null, live: isLive(d, b, now), metrics: dealMetrics(state, d) };
}
function bizPrivate(state, b, now) {
  return {
    id: b.id, email: b.email, ownerName: b.ownerName, name: b.name, category: b.category, emoji: b.emoji,
    address: b.address, addressVerified: b.addressVerified, lat: b.lat, lng: b.lng, blurb: b.blurb,
    tier: b.tier, effectiveTier: effectiveTier(b, now), pilotEndsAt: b.pilotEndsAt, status: b.status,
    signedUpAt: b.signedUpAt, approvedAt: b.approvedAt, lastLoginAt: b.lastLoginAt, closedAt: b.closedAt,
    hasLogo: !!b.logoV, logoV: b.logoV, logoShown: logoShown(b, now),
    limits: limitsFor(b, now), usage: usage(state, b, now), locations: locationList(b),
  };
}

// ---------------------------------------------------------------- wallet payloads

function pemToBuf(pem) {
  const b = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out.buffer;
}
async function signRS256(pem, data) {
  const key = await crypto.subtle.importKey('pkcs8', pemToBuf(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return toB64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(data)));
}
async function walletPayloads(ctx, state, p, now) {
  const d = p.dealId ? getDeal(state, p.dealId) : null;
  const b = getBiz(state, p.bizId);
  const status = passStatus(p, d, b, now);
  const up = upgradedPass(d, p);
  const label = d ? dealLabel(d, up) : p.rewardText;
  const title = d ? d.title : 'Loop reward';
  const color = d ? d.color : '#0d9488';
  const expires = p.expiresAt || (d ? d.endsAt : now + 14 * DAY);
  const voided = ['suspended', 'ended', 'expired', 'complete'].includes(status);
  const env = ctx.env || {};
  const barcode = 'LH-' + p.code;

  const apple = {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_ID || 'pass.com.localhints.offer',
    teamIdentifier: env.APPLE_TEAM_ID || 'TEAMID0000',
    serialNumber: p.id,
    organizationName: 'LocalHints',
    description: `${title} at ${b.name}`,
    logoText: b.name,
    foregroundColor: 'rgb(255,255,255)',
    backgroundColor: color,
    labelColor: 'rgb(230,255,250)',
    barcodes: [{ format: 'PKBarcodeFormatQR', message: barcode, messageEncoding: 'iso-8859-1', altText: p.code }],
    locations: [{ latitude: b.lat, longitude: b.lng, relevantText: `${b.name} is nearby: ${label}` }],
    maxDistance: 300,
    expirationDate: new Date(expires).toISOString(),
    voided,
    coupon: {
      primaryFields: [{ key: 'offer', label: b.name.toUpperCase(), value: label, changeMessage: 'Your offer changed to %@' }],
      secondaryFields: [{ key: 'deal', label: 'DEAL', value: title }],
      auxiliaryFields: [
        { key: 'stamps', label: 'STAMPS', value: `${p.stamps} / ${d ? d.stamps : 1}`, changeMessage: 'Stamp card: %@' },
        { key: 'ends', label: 'ENDS', value: new Date(expires).toISOString().slice(0, 10), dateStyle: 'PKDateStyleShort' },
      ],
      backFields: [
        { key: 'where', label: 'Where', value: b.address },
        { key: 'code', label: 'Pass code', value: p.code },
      ],
    },
  };
  if (env.APPLE_WEB_SERVICE_URL) {
    apple.webServiceURL = env.APPLE_WEB_SERVICE_URL;
    apple.authenticationToken = (await hmac(ctx.secret, 'apple:' + p.id)).slice(0, 32);
  }

  const issuer = env.GOOGLE_WALLET_ISSUER_ID || '0000000000000000000';
  const classId = `${issuer}.localhints_offer`;
  const googleClass = { id: classId, issuerName: 'LocalHints', provider: 'LocalHints', title: 'LocalHints deal', redemptionChannel: 'INSTORE', reviewStatus: 'UNDER_REVIEW' };
  const googleObject = {
    id: `${issuer}.${p.id}`,
    classId,
    state: voided ? 'INACTIVE' : 'ACTIVE',
    barcode: { type: 'QR_CODE', value: barcode, alternateText: p.code },
    validTimeInterval: { start: { date: new Date(d ? d.startsAt : p.createdAt).toISOString() }, end: { date: new Date(expires).toISOString() } },
    locations: [{ latitude: b.lat, longitude: b.lng }],
    textModulesData: [
      { header: b.name, body: `${title}: ${label}`, id: 'offer' },
      { header: 'Stamps', body: `${p.stamps} / ${d ? d.stamps : 1}`, id: 'stamps' },
      { header: 'Where', body: b.address, id: 'where' },
    ],
  };
  let saveUrl = null;
  if (env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_WALLET_PRIVATE_KEY && env.GOOGLE_WALLET_ISSUER_ID) {
    const header = toB64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claims = toB64u(enc.encode(JSON.stringify({
      iss: env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL, aud: 'google', typ: 'savetowallet',
      iat: Math.floor(now / 1000), origins: ctx.origin ? [ctx.origin] : [],
      payload: { offerClasses: [googleClass], offerObjects: [googleObject] },
    })));
    const sig = await signRS256(env.GOOGLE_WALLET_PRIVATE_KEY.replace(/\\n/g, '\n'), `${header}.${claims}`);
    saveUrl = `https://pay.google.com/gp/v/save/${header}.${claims}.${sig}`;
  }
  return { apple, google: { class: googleClass, object: googleObject, saveUrl }, appleSigned: false };
}

// ---------------------------------------------------------------- routing

function match(pattern, path) {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export async function handle(ctx0, req) {
  const now = ctx0.now ? ctx0.now() : Date.now();
  const ctx = { ...ctx0, now };
  let state = await ctx.store.load();
  if (!state) state = ctx.autoSeed && ctx.seed ? await ctx.seed(now) : emptyState();
  ctx.secret = (ctx.env && ctx.env.SESSION_SECRET) || state.secret || (state.secret = rand(40));
  pruneRate(state, now);
  state.redemptions ||= [];
  state.staff ||= [];
  const c = { ctx, state, req, now, query: req.query || {}, body: req.body && typeof req.body === 'object' ? req.body : {} };

  for (const [method, pattern, fn] of ROUTES) {
    if (method !== req.method) continue;
    const params = match(pattern, req.path);
    if (!params) continue;
    c.params = params;
    try {
      const res = await fn(c);
      if (req.method !== 'GET' || c.dirty) await ctx.store.save(state);
      return res;
    } catch (e) {
      console.error('engine error', e);
      return err('Something went wrong. Please try again.', 500);
    }
  }
  return err('Not found.', 404);
}

async function authBiz(c) {
  const t = bearer(c.req);
  const p = await readToken(c.ctx.secret, t, c.now);
  if (!p || p.role !== 'business') return null;
  const b = getBiz(c.state, p.id);
  if (!b || b.status === 'closed') return null;
  if (b.pwChangedAt && (p.iat || 0) < b.pwChangedAt) return null;
  return b;
}
async function authAdmin(c) {
  const p = await readToken(c.ctx.secret, bearer(c.req), c.now);
  return !!(p && p.role === 'admin');
}
function bearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}
const NEED_LOGIN = () => err('Please sign in again.', 401);
const ipOf = (c) => c.req.ip || 'unknown';
const consumerOf = (c) => clean(c.query.consumerId || c.body.consumerId, 60);

// ---------------------------------------------------------------- public routes

async function routeHealth(c) {
  const env = c.ctx.env || {};
  return ok({
    ok: true, mode: c.ctx.demo ? 'demo' : 'live', addressCheck: !!env.GOOGLE_MAPS_API_KEY,
    googleWallet: !!(env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_WALLET_PRIVATE_KEY && env.GOOGLE_WALLET_ISSUER_ID),
    categories: CATEGORIES, limits: LIMITS, pilot: PILOT, price: PRICE,
  });
}

async function routeDeals(c) {
  const { state, now, query } = c;
  const here = isNum(+query.lat) && isNum(+query.lng) && query.lat !== undefined && query.lat !== '' ? { lat: +query.lat, lng: +query.lng } : null;
  const out = [];
  for (const d of state.deals) {
    const b = getBiz(state, d.bizId);
    if (!b || !isLive(d, b, now)) continue;
    const full = d.claimCap && state.passes.filter((p) => p.dealId === d.id).length >= d.claimCap;
    const row = dealPublic(state, d, now, { soldOut: !!full });
    if (here) row.distance = haversineMiles(here, { lat: b.lat, lng: b.lng });
    out.push(row);
  }
  out.sort((a, b) => (here ? a.distance - b.distance : b.startsAt - a.startsAt));
  const tips = state.tips.filter((t) => tipIsLive(t, now)).slice(-10).map(tipPublic);
  return ok({ deals: out, tips });
}

async function routeView(c) {
  const d = getDeal(c.state, clean(c.body.dealId, 40));
  if (d) {
    d.views = (d.views || 0) + 1;
  }
  return ok({ ok: true });
}

async function routeShare(c) {
  const p = c.state.passes.find((x) => x.id === clean(c.body.passId, 60) && x.consumerId === clean(c.body.consumerId, 60));
  if (!p) return err('Pass not found.', 404);
  if (!p.sharedAt) p.sharedAt = c.now;
  return ok({ ok: true });
}

async function routeClaim(c) {
  const { state, now, body } = c;
  const consumerId = clean(body.consumerId, 60);
  if (!consumerId) return err('Missing shopper id.');
  const d = getDeal(state, clean(body.dealId, 40));
  const b = d && getBiz(state, d.bizId);
  if (!d || !b) return err('That deal was not found.', 404);
  const existing = state.passes.find((p) => p.dealId === d.id && p.consumerId === consumerId && p.kind === 'deal');
  if (existing) return ok({ pass: passPublic(state, existing, now), already: true });
  if (!isLive(d, b, now)) return err('This deal is not available right now.');
  const saves = state.passes.filter((p) => p.dealId === d.id).length;
  if (d.claimCap && saves >= d.claimCap) return err('Sorry, all the spots for this deal are taken.');
  if (usage(state, b, now).saves >= limitsFor(b, now).savesPerMonth) return err('This business has reached its monthly limit of saved passes. Try again next month.');

  const pass = {
    id: uid('p'), code: makeCode(), referralCode: makeCode(8), kind: 'deal', dealId: d.id, bizId: b.id, consumerId,
    createdAt: now, stamps: 0, friendSaves: 0, lastRedeemAt: 0,
  };
  state.passes.push(pass);
  const ref = clean(body.ref, 12).toUpperCase();
  if (ref) {
    const src = state.passes.find((p) => p.referralCode === ref && p.dealId === d.id && p.consumerId !== consumerId);
    if (src) {
      const before = upgradedPass(d, src);
      src.friendSaves += 1;
      if (!before && upgradedPass(d, src)) {
        alertTo(state, c.ctx, src.consumerId, 'upgrade', 'Your pass was upgraded!', `Your friend saved the deal. It is now ${dealLabel(d, true)} at ${b.name}.`, { dealId: d.id, bizId: b.id });
      }
    }
  }
  return ok({ pass: passPublic(state, pass, now) });
}

// Un-hearting a deal removes its pass from the shopper's wallet. A pass that has already been used stays (it is part of the sales record).
async function routeUnsave(c) {
  const { state, body } = c;
  const consumerId = clean(body.consumerId, 60);
  if (!consumerId) return err('Missing shopper id.');
  const i = state.passes.findIndex((p) => p.dealId === clean(body.dealId, 40) && p.consumerId === consumerId && p.kind === 'deal');
  if (i < 0) return ok({ removed: false });
  const p = state.passes[i];
  if (p.stamps > 0 || state.redemptions.some((r) => r.passId === p.id)) return err('This pass was already used at the shop, so it stays in My Deals.');
  state.passes.splice(i, 1);
  return ok({ removed: true });
}

async function routePasses(c) {
  const consumerId = consumerOf(c);
  if (!consumerId) return ok({ passes: [] });
  const list = c.state.passes.filter((p) => p.consumerId === consumerId).sort((a, b) => b.createdAt - a.createdAt).map((p) => passPublic(c.state, p, c.now));
  return ok({ passes: list });
}

async function routeWallet(c) {
  const consumerId = consumerOf(c);
  const p = c.state.passes.find((x) => x.id === c.params.id && x.consumerId === consumerId);
  if (!p) return err('Pass not found.', 404);
  const w = await walletPayloads(c.ctx, c.state, p, c.now);
  if (c.params.platform === 'google') {
    return ok({ platform: 'google', payload: w.google, saveUrl: w.google.saveUrl, ready: !!w.google.saveUrl });
  }
  if (c.params.platform === 'apple') return ok({ platform: 'apple', payload: w.apple, ready: false, note: 'Apple needs a signed .pkpass file. See guides/WALLET_RADIUS_PUSH.md.' });
  return err('Unknown wallet.', 404);
}

async function routeSubscribe(c) {
  const { state, body, now } = c;
  const consumerId = clean(body.consumerId, 60);
  if (!consumerId) return err('Missing shopper id.');
  let s = state.subscribers.find((x) => x.consumerId === consumerId);
  if (!s) state.subscribers.push((s = { consumerId, notify: false, lat: 0, lng: 0, updatedAt: now }));
  s.notify = !!body.notify;
  if (s.notify) {
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err('We need your location to send nearby alerts.');
    s.lat = Math.round(lat * 100) / 100; // about 1 km. We never store an exact position.
    s.lng = Math.round(lng * 100) / 100;
  } else {
    s.lat = 0;
    s.lng = 0;
  }
  s.updatedAt = now;
  return ok({ notify: s.notify });
}

async function routeAlerts(c) {
  const consumerId = consumerOf(c);
  const list = c.state.alerts.filter((a) => a.consumerId === consumerId).sort((a, b) => b.at - a.at).slice(0, 50);
  const sub = c.state.subscribers.find((s) => s.consumerId === consumerId);
  return ok({ alerts: list, notify: !!(sub && sub.notify) });
}


async function routeLogo(c) {
  const b = getBiz(c.state, c.params.id);
  const data = b && b.logoV ? await c.ctx.store.getBlob('logo:' + b.id) : null;
  if (!data) return err('No logo.', 404);
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(data);
  if (!m) return err('No logo.', 404);
  return { status: 200, body: { raw: { contentType: m[1], base64: m[2] } } };
}

async function routeVerifyAddress(c) {
  const address = clean(c.body.address, 160);
  if (address.length < 6) return err('Type the full street address first.');
  if (hit(c.state, 'geo:' + ipOf(c), c.now, 30, HOUR)) return err('Too many address checks. Please try again later.', 429);
  const g = await geocode(c.ctx, address);
  if (g.unavailable) return ok({ available: false, reason: g.reason });
  if (!g.ok) return ok({ available: true, ok: false, error: g.error, suggestion: g.formatted || null });
  const shared = c.state.businesses.filter((b) => b.placeId === g.placeId && b.status !== 'closed').length;
  return ok({ available: true, ok: true, formatted: g.formatted, lat: g.lat, lng: g.lng, placeId: g.placeId, partial: g.partial, sharedWith: shared });
}

// ---------------------------------------------------------------- business routes

async function routeSignup(c) {
  const { state, body, now } = c;
  if (hit(state, 'signup:' + ipOf(c), now, 8, HOUR)) return err('Too many sign-ups from this network. Please try again later.', 429);
  const email = clean(body.email, 120).toLowerCase();
  const ownerName = clean(body.ownerName, 60);
  const name = clean(body.name, 60);
  const category = body.category;
  if (ownerName.length < 2) return err('Enter your name.');
  if (!validEmail(email)) return err('Enter a valid email address.');
  const pw = passwordProblem(body.password);
  if (pw) return err(pw);
  if (name.length < 2) return err('Enter your business name.');
  if (!CAT_IDS.includes(category)) return err('Pick a category.');
  const address = clean(body.address, 160);
  if (address.length < 6) return err('Enter your street address.');
  if (state.businesses.some((b) => b.email === email)) return err('An account with this email already exists. Try signing in.');

  let lat, lng, formatted = address, placeId = '', verified = false;
  const g = await geocode(c.ctx, address);
  if (g.unavailable) {
    lat = Number(body.lat); lng = Number(body.lng);
    if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err('We need a map location for your business. Tap "Use my current location".');
  } else if (!g.ok) {
    return err(g.error);
  } else {
    ({ lat, lng, placeId } = g);
    formatted = g.formatted;
    verified = true;
  }
  const hp = await hashPassword(body.password);
  const emoji = firstEmoji(clean(body.emoji, 40)) || CATEGORIES.find((x) => x.id === category).emoji;
  const b = {
    id: uid('b'), email, ownerName, passSalt: hp.salt, passHash: hp.hash, name, category, emoji,
    address: formatted, addressRaw: address, addressVerified: verified, placeId, lat, lng, blurb: clean(body.blurb, 120),
    tier: 'free', pilotEndsAt: 0, pilotStartedAt: 0, status: 'pending', signedUpAt: now, approvedAt: 0,
    lastLoginAt: now, loginCount: 1, closedAt: 0, logoV: 0,
  };
  state.businesses.push(b);
  log(state, c.ctx, b.id, 'signup', verified ? `Address verified with Google: ${formatted}` : 'Address not verified (check was unavailable)');
  const draft = makeConcierge(b, now);
  state.deals.push(draft);
  log(state, c.ctx, b.id, 'deal_created', `Suggested first deal: ${draft.title}`);
  const token = await signToken(c.ctx.secret, { role: 'business', id: b.id, iat: now, exp: now + 12 * HOUR });
  return ok({ token, business: bizPrivate(state, b, now) }, 201);
}

async function routeLogin(c) {
  const { state, body, now } = c;
  const email = clean(body.email, 120).toLowerCase();
  const key = 'login:' + email + '|' + ipOf(c);
  if (limited(state, key, now)) return err('Too many attempts. Please wait 15 minutes and try again.', 429);
  const b = state.businesses.find((x) => x.email === email);
  const good = b && typeof body.password === 'string' && safeEqual((await hashPassword(body.password, b.passSalt)).hash, b.passHash);
  if (!good) {
    failure(state, key, now);
    return err('Email or password is not right.', 401);
  }
  if (b.status === 'closed') return err('This account was closed. Contact LocalHints support to reopen it.', 403);
  clearFailures(state, key);
  b.lastLoginAt = now;
  b.loginCount = (b.loginCount || 0) + 1;
  log(state, c.ctx, b.id, 'login', '');
  const token = await signToken(c.ctx.secret, { role: 'business', id: b.id, iat: now, exp: now + 12 * HOUR });
  return ok({ token, business: bizPrivate(state, b, now) });
}

function loopView(state, l, now) {
  const from = getBiz(state, l.fromBizId), to = getBiz(state, l.toBizId), d = getDeal(state, l.fromDealId);
  return { id: l.id, status: l.status, rewardText: l.rewardText, createdAt: l.createdAt, from: bizPublic(from, now), to: bizPublic(to, now), fromDealTitle: d ? d.title : '' };
}

async function routeMe(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, now } = c;
  const deals = state.deals.filter((d) => d.bizId === b.id).sort((a, z) => z.createdAt - a.createdAt).map((d) => ownerDeal(state, d, now));
  const loops = state.loops.filter((l) => (l.fromBizId === b.id || l.toBizId === b.id) && l.status !== 'ended' && l.status !== 'declined').map((l) => loopView(state, l, now));
  const events = state.events.filter((e) => e.bizId === b.id).sort((a, z) => z.at - a.at).slice(0, 80);
  return ok({ business: bizPrivate(state, b, now), deals, loops, events, now });
}

async function routePartners(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const list = c.state.businesses
    .filter((x) => x.id !== b.id && x.status === 'approved')
    .map((x) => ({ ...bizPublic(x, c.now), liveDeals: c.state.deals.filter((d) => d.bizId === x.id && isLive(d, x, c.now)).length }));
  return ok({ partners: list });
}

async function routeProfile(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  const name = clean(body.name ?? b.name, 60);
  if (name.length < 2) return err('Enter your business name.');
  const changes = [];
  if (name !== b.name) changes.push('name');
  b.name = name;
  if (body.blurb !== undefined) { b.blurb = clean(body.blurb, 120); changes.push('description'); }
  if (body.emoji !== undefined && firstEmoji(clean(body.emoji, 40))) { b.emoji = firstEmoji(clean(body.emoji, 40)); changes.push('icon'); }
  if (body.address !== undefined && clean(body.address, 160) !== b.address) {
    const address = clean(body.address, 160);
    if (address.length < 6) return err('Enter your street address.');
    const g = await geocode(c.ctx, address);
    if (g.unavailable) {
      const lat = Number(body.lat), lng = Number(body.lng);
      if (!isNum(lat) || !isNum(lng)) return err('We need a map location for the new address. Tap "Use my current location".');
      Object.assign(b, { address, addressRaw: address, addressVerified: false, placeId: '', lat, lng });
    } else if (!g.ok) return err(g.error);
    else Object.assign(b, { address: g.formatted, addressRaw: address, addressVerified: true, placeId: g.placeId, lat: g.lat, lng: g.lng });
    changes.push('address');
  }
  log(state, c.ctx, b.id, 'profile_updated', changes.join(', ') || 'no changes');
  return ok({ business: bizPrivate(state, b, now) });
}

async function routeLogoUpload(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  if (effectiveTier(b, c.now) !== 'pro') return err('Uploading your logo is a Pro feature. Free deals show the LocalHints logo.', 403, { upgrade: true });
  const data = String(c.body.dataUrl || '');
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return err('Upload a PNG, JPG or WebP image.');
  if (data.length > 220000) return err('That image is too large. Use one under 150 KB.');
  await c.ctx.store.putBlob('logo:' + b.id, data);
  b.logoV = (b.logoV || 0) + 1;
  log(c.state, c.ctx, b.id, 'logo_updated', 'Uploaded a logo');
  return ok({ business: bizPrivate(c.state, b, c.now) });
}
async function routeLogoRemove(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  await c.ctx.store.putBlob('logo:' + b.id, '');
  b.logoV = 0;
  log(c.state, c.ctx, b.id, 'logo_updated', 'Removed the logo');
  return ok({ business: bizPrivate(c.state, b, c.now) });
}

async function routeTier(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  const tier = body.tier;
  if (tier !== 'free' && tier !== 'pro') return err('Pick Free or Pro.');
  if (tier === b.tier) return ok({ business: bizPrivate(state, b, now) });
  if (tier === 'pro' && !c.ctx.demo && !(c.ctx.env && c.ctx.env.ALLOW_SELF_UPGRADE === 'true')) {
    log(state, c.ctx, b.id, 'upgrade_requested', `Asked to upgrade to Pro (${body.billing === 'yearly' ? 'yearly' : 'monthly'})`);
    return ok({ business: bizPrivate(state, b, now), requested: true, message: 'Thanks! Billing is not connected yet, so an admin will switch you to Pro. We have let them know.' });
  }
  const from = b.tier;
  b.tier = tier;
  log(state, c.ctx, b.id, 'tier_changed', `Changed from ${from === 'pro' ? 'Pro' : 'Free'} to ${tier === 'pro' ? 'Pro' : 'Free'}`);
  return ok({ business: bizPrivate(state, b, now) });
}

async function routeClose(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  closeBusiness(c, b, 'Closed by the owner');
  return ok({ closed: true });
}
function closeBusiness(c, b, why) {
  b.status = 'closed';
  b.closedAt = c.now;
  for (const d of c.state.deals) if (d.bizId === b.id && d.status !== 'ended') d.status = 'ended';
  for (const l of c.state.loops) if ((l.fromBizId === b.id || l.toBizId === b.id) && (l.status === 'active' || l.status === 'pending')) l.status = 'ended';
  log(c.state, c.ctx, b.id, 'closed', why);
}

function mustOwn(c, b) {
  const d = getDeal(c.state, c.params.id);
  return d && d.bizId === b.id ? d : null;
}

async function routeDealCreate(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  if (b.status === 'closed') return err('This account is closed.', 403);
  const n = normalizeDeal(b, c.body, c.now, null);
  if (n.error) return err(n.error, 400, n.upgrade ? { upgrade: true } : undefined);
  const d = { id: uid('d'), bizId: b.id, ...n.fields, status: 'draft', isConcierge: false, createdAt: c.now, publishedAt: 0, views: 0 };
  c.state.deals.push(d);
  log(c.state, c.ctx, b.id, 'deal_created', d.title);
  let published = null;
  if (c.body.publish) published = publishDeal(c, b, d);
  if (published && published.error) return err(published.error, 400, { dealId: d.id, savedAsDraft: true, upgrade: published.upgrade });
  return ok({ deal: ownerDeal(c.state, d, c.now) }, 201);
}

function publishDeal(c, b, d) {
  if (b.status !== 'approved') return { error: b.status === 'pending' ? 'Your business is waiting for approval. Your deal is saved as a draft and you can publish it once you are approved.' : 'Your account is not active, so deals cannot go live.' };
  if (d.status !== 'draft') return { error: 'This deal is already published.' };
  const u = usage(c.state, b, c.now);
  if (u.dealsPublished >= limitsFor(b, c.now).dealsPerMonth) return { error: `Free plan: ${LIMITS.free.dealsPerMonth} published deals per month. Upgrade to Pro for unlimited deals.`, upgrade: true };
  if (d.startsAt < c.now) {
    const len = Math.max(HOUR, d.endsAt - d.startsAt);
    d.startsAt = c.now;
    d.endsAt = c.now + len;
  }
  d.status = 'live';
  d.publishedAt = c.now;
  log(c.state, c.ctx, b.id, 'deal_published', d.title);
  return {};
}

async function routeDealEdit(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const d = mustOwn(c, b);
  if (!d) return err('Deal not found.', 404);
  if (d.status === 'ended') return err('Ended deals cannot be edited.');
  if (d.status === 'suspended') return err('This deal was suspended by LocalHints and cannot be edited.');
  const n = normalizeDeal(b, c.body, c.now, d);
  if (n.error) return err(n.error, 400, n.upgrade ? { upgrade: true } : undefined);
  Object.assign(d, n.fields);
  log(c.state, c.ctx, b.id, 'deal_edited', d.title);
  let published = null;
  if (c.body.publish && d.status === 'draft') published = publishDeal(c, b, d);
  if (published && published.error) return err(published.error, 400, { savedAsDraft: true, upgrade: published.upgrade });
  return ok({ deal: ownerDeal(c.state, d, c.now) });
}

async function routeDealPublish(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const d = mustOwn(c, b);
  if (!d) return err('Deal not found.', 404);
  const r = publishDeal(c, b, d);
  if (r.error) return err(r.error, 400, r.upgrade ? { upgrade: true } : undefined);
  return ok({ deal: ownerDeal(c.state, d, c.now) });
}

async function routeDealStatus(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const d = mustOwn(c, b);
  if (!d) return err('Deal not found.', 404);
  const to = c.body.status;
  if (d.status === 'suspended') return err('This deal was suspended by LocalHints.');
  if (to === 'paused' && d.status === 'live') d.status = 'paused';
  else if (to === 'live' && d.status === 'paused') {
    if (b.status !== 'approved') return err('Your account is not active.');
    d.status = 'live';
  } else if (to === 'ended' && (d.status === 'live' || d.status === 'paused' || d.status === 'draft')) {
    d.status = 'ended';
    for (const l of c.state.loops) if (l.fromDealId === d.id && (l.status === 'active' || l.status === 'pending')) l.status = 'ended';
  } else return err('That change is not allowed for this deal.');
  log(c.state, c.ctx, b.id, 'deal_status', `${d.title}: ${to === 'live' ? 'resumed' : to}`);
  return ok({ deal: ownerDeal(c.state, d, c.now) });
}

async function routeDealDelete(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const d = mustOwn(c, b);
  if (!d) return err('Deal not found.', 404);
  if (d.status !== 'draft') return err('Only drafts can be deleted. End a published deal instead.');
  c.state.deals = c.state.deals.filter((x) => x.id !== d.id);
  log(c.state, c.ctx, b.id, 'deal_deleted', d.title);
  return ok({ ok: true });
}

async function routeDrop(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  if (b.status !== 'approved') return err('Your account must be approved first.');
  const lim = limitsFor(b, now);
  if (!lim.dropsPerMonth) return err('Neighborhood Drops are a Pro feature.', 403, { upgrade: true });
  if (usage(state, b, now).drops >= lim.dropsPerMonth) return err(`You have used all ${lim.dropsPerMonth} Neighborhood Drops for this month.`);
  const d = getDeal(state, clean(body.dealId, 40));
  if (!d || d.bizId !== b.id || !isLive(d, b, now)) return err('Pick one of your live deals.');
  const message = clean(body.message, 100);
  if (message.length < 10) return err('Write a message of 10 to 100 characters.');
  const radius = Number(body.radius);
  if (!isNum(radius) || radius < 0.5 || radius > 5) return err('Radius must be between 0.5 and 5 miles.');
  const here = { lat: b.lat, lng: b.lng };
  const targets = state.subscribers.filter((s) => s.notify && haversineMiles(here, s) <= radius);
  for (const s of targets) alertTo(state, c.ctx, s.consumerId, 'drop', `${b.name} is nearby`, message, { dealId: d.id, bizId: b.id });
  state.drops.push({ id: uid('x'), bizId: b.id, dealId: d.id, radius, message, at: now, reach: targets.length });
  log(state, c.ctx, b.id, 'drop_sent', `${radius} mi, reached ${targets.length} opted-in shoppers`);
  return ok({ reach: targets.length, drops: usage(state, b, now).drops });
}

async function routePush(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  if (b.status !== 'approved') return err('Your account must be approved first.');
  if (effectiveTier(b, now) !== 'pro') return err('Pass Push is a Pro feature.', 403, { upgrade: true });
  const message = clean(body.message, 100);
  if (message.length < 10) return err('Write a message of 10 to 100 characters.');
  const holders = new Set();
  for (const p of state.passes) {
    if (p.bizId !== b.id || p.kind !== 'deal' || (body.dealId && p.dealId !== body.dealId)) continue;
    const st = passStatus(p, getDeal(state, p.dealId), b, now);
    if (st === 'active' || st === 'scheduled' || st === 'paused') holders.add(p.consumerId);
  }
  for (const id of holders) alertTo(state, c.ctx, id, 'push', b.name, message, { bizId: b.id });
  log(state, c.ctx, b.id, 'push_sent', `Sent to ${holders.size} pass holders`);
  return ok({ reach: holders.size });
}

async function routeLoopPropose(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  if (effectiveTier(b, now) !== 'pro') return err('Loop-In is a Pro feature.', 403, { upgrade: true });
  if (b.status !== 'approved') return err('Your account must be approved first.');
  const d = getDeal(state, clean(body.fromDealId, 40));
  if (!d || d.bizId !== b.id || (d.status !== 'live' && d.status !== 'paused' && d.status !== 'draft')) return err('Pick one of your deals.');
  const partner = getBiz(state, clean(body.partnerBizId, 40));
  if (!partner || partner.id === b.id || partner.status !== 'approved') return err('Pick an approved neighbor business.');
  const rewardText = clean(body.rewardText, 80);
  if (rewardText.length < 5) return err('Describe the reward (5 to 80 characters), for example "$1 off any ice cream cone".');
  if (state.loops.some((l) => l.fromDealId === d.id && (l.status === 'pending' || l.status === 'active'))) return err('This deal already has a Loop-In. End it first to make a new one.');
  const l = { id: uid('l'), fromBizId: b.id, fromDealId: d.id, toBizId: partner.id, rewardText, status: 'pending', createdAt: now };
  state.loops.push(l);
  log(state, c.ctx, b.id, 'loop_proposed', `${d.title} with ${partner.name}: ${rewardText}`);
  log(state, c.ctx, partner.id, 'loop_proposed', `${b.name} wants to loop in: ${rewardText}`);
  return ok({ loop: loopView(state, l, now) }, 201);
}

async function routeLoopRespond(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const l = c.state.loops.find((x) => x.id === c.params.id);
  if (!l || (l.toBizId !== b.id && l.fromBizId !== b.id)) return err('Loop-In not found.', 404);
  const action = c.body.action;
  if (action === 'accept' && l.toBizId === b.id && l.status === 'pending') {
    l.status = 'active';
    log(c.state, c.ctx, b.id, 'loop_accepted', l.rewardText);
    log(c.state, c.ctx, l.fromBizId, 'loop_accepted', `${b.name} accepted: ${l.rewardText}`);
  } else if (action === 'decline' && l.toBizId === b.id && l.status === 'pending') {
    l.status = 'declined';
    log(c.state, c.ctx, b.id, 'loop_declined', l.rewardText);
    log(c.state, c.ctx, l.fromBizId, 'loop_declined', `${b.name} declined: ${l.rewardText}`);
  } else if (action === 'end' && (l.status === 'active' || l.status === 'pending')) {
    l.status = 'ended';
    log(c.state, c.ctx, b.id, 'loop_ended', l.rewardText);
  } else return err('That change is not allowed.');
  return ok({ loop: loopView(c.state, l, c.now) });
}

function typeName(t) {
  return { percent: '% off', amount: '$ off', bogo: 'Buy-one-get-one', freeitem: 'Free item', bundle: 'Bundle' }[t] || t;
}

// ---------------------------------------------------------------- admin routes

async function routeAdminLogin(c) {
  const { state, body, now } = c;
  const key = 'admin:' + ipOf(c);
  if (limited(state, key, now)) return err('Too many attempts. Please wait 15 minutes.', 429);
  const env = c.ctx.env || {};
  const user = env.ADMIN_USERNAME || 'Admin';
  const pass = env.ADMIN_PASSWORD || 'Admin';
  let okLogin;
  if (state.adminCred) {
    const h = (await hashPassword(String(body.password ?? ''), state.adminCred.salt)).hash;
    okLogin = safeEqual(await sha256(String(body.username ?? '')), await sha256(user)) && safeEqual(h, state.adminCred.hash);
  } else {
    okLogin = safeEqual(await sha256(String(body.username ?? '') + '\n' + String(body.password ?? '')), await sha256(user + '\n' + pass));
  }
  if (!okLogin) {
    failure(state, key, now);
    c.dirty = true;
    return err('Username or password is not right.', 401);
  }
  clearFailures(state, key);
  const token = await signToken(c.ctx.secret, { role: 'admin', exp: now + 8 * HOUR });
  return ok({ token, usingDefaults: !state.adminCred && !(env.ADMIN_USERNAME && env.ADMIN_PASSWORD) });
}
async function routeAdminMe(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const env = c.ctx.env || {};
  return ok({ ok: true, usingDefaults: !c.state.adminCred && !(env.ADMIN_USERNAME && env.ADMIN_PASSWORD), mode: c.ctx.demo ? 'demo' : 'live', addressCheck: !!env.GOOGLE_MAPS_API_KEY });
}

function adminRow(state, b, now) {
  const deals = state.deals.filter((d) => d.bizId === b.id);
  const count = (s) => deals.filter((d) => d.status === s).length;
  const shared = b.placeId ? state.businesses.some((x) => x.id !== b.id && x.placeId === b.placeId && x.status !== 'closed') : false;
  const firstPub = deals.filter((d) => d.publishedAt).sort((a, z) => a.publishedAt - z.publishedAt)[0];
  return {
    id: b.id, name: b.name, owner: b.ownerName, email: b.email, category: b.category, emoji: b.emoji, address: b.address,
    addressVerified: b.addressVerified, sharedAddress: shared, status: b.status, tier: b.tier, effectiveTier: effectiveTier(b, now),
    pilot: isPilot(b, now), pilotEndsAt: b.pilotEndsAt, pilotStartedAt: b.pilotStartedAt,
    signedUpAt: b.signedUpAt, approvedAt: b.approvedAt, lastLoginAt: b.lastLoginAt, loginCount: b.loginCount || 0, closedAt: b.closedAt,
    deals: { total: deals.length, live: deals.filter((d) => isLive(d, b, now)).length, draft: count('draft'), paused: count('paused'), suspended: count('suspended'), ended: count('ended') },
    allDealsSuspended: deals.some((d) => d.status !== 'ended' && d.status !== 'draft') && deals.filter((d) => d.status !== 'ended' && d.status !== 'draft').every((d) => d.status === 'suspended' || d.status === 'paused'),
    firstDealAt: firstPub ? firstPub.publishedAt : 0,
    upgradeRequested: state.events.some((e) => e.bizId === b.id && e.type === 'upgrade_requested' && e.at > (b.tierChangedAt || 0)) && b.tier === 'free',
  };
}
const dayStart = (s) => (s ? Date.parse(s + 'T00:00:00Z') : NaN);
const dayEnd = (s) => (s ? Date.parse(s + 'T00:00:00Z') + DAY - 1 : NaN);

async function routeAdminBusinesses(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const { state, now, query: q } = c;
  const text = clean(q.q, 80).toLowerCase();
  const sf = dayStart(q.signedFrom), st = dayEnd(q.signedTo), cf = dayStart(q.closedFrom), ct = dayEnd(q.closedTo);
  let rows = state.businesses.map((b) => adminRow(state, b, now));
  rows = rows.filter((r) => {
    if (text && !(r.name.toLowerCase().includes(text) || r.email.includes(text) || r.owner.toLowerCase().includes(text) || r.address.toLowerCase().includes(text))) return false;
    if (q.category && r.category !== q.category) return false;
    if (q.status && r.status !== q.status) return false;
    if (q.awaiting === '1' && r.status !== 'pending') return false;
    if (q.plan === 'pilot' ? !r.pilot : q.plan && r.effectiveTier !== q.plan) return false;
    if (!Number.isNaN(sf) && r.signedUpAt < sf) return false;
    if (!Number.isNaN(st) && r.signedUpAt > st) return false;
    if (!Number.isNaN(cf) && !(r.status === 'closed' && r.closedAt >= cf)) return false;
    if (!Number.isNaN(ct) && !(r.status === 'closed' && r.closedAt <= ct)) return false;
    if (q.closedOnly === '1' && r.status !== 'closed') return false;
    if (q.allSuspended === '1' && !r.allDealsSuspended) return false;
    if (q.unverified === '1' && r.addressVerified) return false;
    return true;
  });
  const sorts = { name: (a, z) => a.name.localeCompare(z.name), signup: (a, z) => z.signedUpAt - a.signedUpAt, login: (a, z) => z.lastLoginAt - a.lastLoginAt, closed: (a, z) => z.closedAt - a.closedAt };
  rows.sort(sorts[q.sort] || sorts.signup);
  return ok({ businesses: rows, total: state.businesses.length });
}

async function routeAdminStats(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const { state, now } = c;
  const by = (s) => state.businesses.filter((b) => b.status === s).length;
  return ok({
    total: state.businesses.length, pending: by('pending'), approved: by('approved'), suspended: by('suspended'), closed: by('closed'),
    pro: state.businesses.filter((b) => b.tier === 'pro').length, pilot: state.businesses.filter((b) => isPilot(b, now)).length, pilotSlots: PILOT.slots,
    liveDeals: state.deals.filter((d) => isLive(d, getBiz(state, d.bizId), now)).length, passes: state.passes.length,
    awaiting: by('pending'), spottedSuggested: state.tips.filter((t) => t.status === 'pending').length, spottedLive: state.tips.filter((t) => tipIsLive(t, now)).length,
    spottedToday: state.tips.filter((t) => t.at >= now - (now % DAY)).length,
    tipsPending: state.tips.filter((t) => t.status === 'pending').length, upgradeRequests: state.businesses.filter((b) => adminRow(state, b, now).upgradeRequested).length,
  });
}

async function routeAdminBusiness(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const b = getBiz(c.state, c.params.id);
  if (!b) return err('Business not found.', 404);
  const { state, now } = c;
  return ok({
    business: { ...adminRow(state, b, now), blurb: b.blurb, lat: b.lat, lng: b.lng, placeId: b.placeId, addressRaw: b.addressRaw, hasLogo: !!b.logoV, usage: usage(state, b, now) },
    deals: state.deals.filter((d) => d.bizId === b.id).sort((a, z) => z.createdAt - a.createdAt).map((d) => ownerDeal(state, d, now)),
    events: state.events.filter((e) => e.bizId === b.id).sort((a, z) => z.at - a.at).slice(0, 150),
    team: staffRows(state, b),
    locations: locationList(b),
    loops: state.loops.filter((l) => l.fromBizId === b.id || l.toBizId === b.id).map((l) => loopView(state, l, now)),
  });
}

async function routeAdminAction(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const { state, now, body } = c;
  const b = getBiz(state, c.params.id);
  if (!b) return err('Business not found.', 404);
  const a = body.action;
  if (a === 'approve') {
    if (b.status !== 'pending') return err('Only pending businesses can be approved.');
    b.status = 'approved'; b.approvedAt = now;
    log(state, c.ctx, b.id, 'approved', 'Approved by admin');
  } else if (a === 'suspend') {
    if (b.status !== 'approved' && b.status !== 'pending') return err('Only pending or approved businesses can be suspended.');
    b.status = 'suspended';
    for (const d of state.deals) if (d.bizId === b.id && (d.status === 'live' || d.status === 'paused')) { d.suspendedFrom = d.status; d.status = 'suspended'; }
    log(state, c.ctx, b.id, 'suspended', clean(body.reason, 120) || 'Suspended by admin');
  } else if (a === 'reinstate') {
    if (b.status !== 'suspended') return err('Only suspended businesses can be reinstated.');
    b.status = b.approvedAt ? 'approved' : 'pending';
    for (const d of state.deals) if (d.bizId === b.id && d.status === 'suspended') { d.status = d.suspendedFrom || 'paused'; d.suspendedFrom = null; }
    log(state, c.ctx, b.id, 'reinstated', 'Reinstated by admin');
  } else if (a === 'close') {
    if (b.status === 'closed') return err('Already closed.');
    closeBusiness(c, b, clean(body.reason, 120) || 'Closed by admin');
  } else if (a === 'reopen') {
    if (b.status !== 'closed') return err('Only closed accounts can be reopened.');
    b.status = 'approved'; b.approvedAt = b.approvedAt || now;
    log(state, c.ctx, b.id, 'reopened', 'Reopened by admin');
  } else if (a === 'set_tier') {
    if (body.tier !== 'free' && body.tier !== 'pro') return err('Pick Free or Pro.');
    if (b.tier !== body.tier) {
      log(state, c.ctx, b.id, 'tier_changed', `Changed from ${b.tier === 'pro' ? 'Pro' : 'Free'} to ${body.tier === 'pro' ? 'Pro' : 'Free'} by admin`);
      b.tier = body.tier; b.tierChangedAt = now;
    }
  } else if (a === 'start_pilot') {
    if (b.status !== 'approved') return err('Approve the business before starting its pilot.');
    if (isPilot(b, now)) return err('Already in the pilot.');
    if (state.businesses.filter((x) => isPilot(x, now)).length >= PILOT.slots) return err(`All ${PILOT.slots} pilot slots are in use.`);
    b.pilotStartedAt = now; b.pilotEndsAt = now + PILOT.days * DAY;
    log(state, c.ctx, b.id, 'pilot_started', `${PILOT.days}-day Pro pilot`);
  } else if (a === 'end_pilot') {
    if (!isPilot(b, now)) return err('Not in the pilot.');
    b.pilotEndsAt = now;
    log(state, c.ctx, b.id, 'pilot_ended', 'Ended by admin');
  } else return err('Unknown action.');
  return ok({ business: adminRow(state, b, now) });
}

async function routeAdminEvents(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const { state, query: q } = c;
  const type = q.type;
  const list = state.events.filter((e) => !type || e.type === type).sort((a, z) => z.at - a.at).slice(0, 200)
    .map((e) => { const b = getBiz(state, e.bizId); return { ...e, bizName: b ? b.name : '(deleted)' }; });
  return ok({ events: list });
}

async function routeAdminPilot(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const { state, now } = c;
  const rows = state.businesses.filter((b) => b.pilotStartedAt).map((b) => {
    const r = adminRow(state, b, now);
    return { ...r, daysLeft: Math.max(0, Math.ceil((b.pilotEndsAt - now) / DAY)), daysToApproval: b.approvedAt ? Math.round((b.approvedAt - b.signedUpAt) / DAY) : null, daysToFirstDeal: r.firstDealAt ? Math.round((r.firstDealAt - b.signedUpAt) / DAY) : null,
      saves: state.passes.filter((p) => p.bizId === b.id && p.kind === 'deal').length, redemptions: state.passes.filter((p) => p.bizId === b.id && p.stamps > 0).length };
  });
  return ok({ slots: PILOT.slots, used: rows.filter((r) => r.pilot).length, rows });
}

async function routeAdminSeed(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  if (!c.ctx.seed) return err('Demo data is not available here.');
  const fresh = await c.ctx.seed(c.now);
  const secret = c.state.secret;
  for (const k of Object.keys(c.state)) delete c.state[k];
  Object.assign(c.state, fresh, { secret });
  return ok({ ok: true });
}
async function routeAdminReset(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  if (c.body.confirm !== 'DELETE') return err('Type DELETE to confirm.');
  const secret = c.state.secret;
  for (const k of Object.keys(c.state)) delete c.state[k];
  Object.assign(c.state, emptyState(), { secret });
  return ok({ ok: true });
}

/** Keeps the first emoji (or character) a person typed, even long ones like flags or 👩‍🍳. */
function firstEmoji(v) {
  const t = String(v ?? '').trim();
  if (!t) return '';
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const x of seg.segment(t)) return x.segment.slice(0, 16);
  } catch { /* old browser: fall through */ }
  return Array.from(t)[0] || '';
}

// ---------------------------------------------------------------- v5: email, locations, redemption math, staff

const siteBase = (c) => String((c.ctx.env && c.ctx.env.SITE_URL) || c.ctx.siteBase || '').replace(/\/+$/, '');

async function sendEmail(c, to, subject, text) {
  const env = c.ctx.env || {};
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  try {
    const f = c.ctx.fetch || fetch;
    const res = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
    });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

function locationList(b) {
  const main = { id: 'main', name: 'Main location', address: b.address, lat: b.lat, lng: b.lng };
  return [main, ...(b.locations || [])];
}
function locationName(b, id) {
  const l = locationList(b).find((x) => x.id === id);
  return l ? l.name : 'Main location';
}
const validLocation = (b, id) => !id || locationList(b).some((x) => x.id === id);

// What the customer pays after the deal. Exact for % off, $ off and bundle price; an estimate for the rest.
export function computeAfter(d, before) {
  const bf = Math.max(0, Math.round((Number(before) || 0) * 100) / 100);
  let after = bf;
  let exact = true;
  if (d) {
    const v = Number(d.value) || 0;
    if (d.type === 'percent') after = bf * (1 - v / 100);
    else if (d.type === 'amount') after = Math.max(0, bf - v);
    else if (d.type === 'bogo') { after = bf / 2; exact = false; }
    else if (d.type === 'freeitem') { after = Math.max(0, bf - v); exact = false; }
    else if (d.type === 'bundle') { after = v > 0 && bf > v ? v : bf; }
  }
  return { before: bf, after: Math.round(after * 100) / 100, exact };
}

function sumRedemptions(list) {
  return list.reduce((a, r) => ({ n: a.n + 1, before: a.before + r.before, after: a.after + r.after }), { n: 0, before: 0, after: 0 });
}
const money = (n) => Math.round(n * 100) / 100;

const staffShown = (s) => s.status !== 'removed';
const staffCounts = (s) => s.status !== 'removed' && s.status !== 'cancelled';

function staffRows(state, b) {
  const reds = state.redemptions.filter((r) => r.bizId === b.id);
  const o = sumRedemptions(reds.filter((r) => !r.staffId));
  const list = state.staff.filter((s) => s.bizId === b.id && staffShown(s));
  const counts = list.map((s) => sumRedemptions(reds.filter((r) => r.staffId === s.id)));
  const people = counts.length + 1;
  const totalN = counts.reduce((n, t) => n + t.n, 0) + o.n;
  const rows = list.map((s, i) => {
    const t = counts[i];
    const avgOthers = people > 1 ? (totalN - t.n) / (people - 1) : 0;
    const disc = t.before - t.after;
    const flags = [];
    if (t.n >= 5 && avgOthers > 0 && t.n >= 2 * avgOthers) flags.push('High volume');
    if (t.n >= 5 && t.before > 0 && disc / t.before > 0.35) flags.push('Big discounts');
    return {
      id: s.id, name: s.name, contact: s.contact, method: s.method, status: s.status, locationId: s.locationId || 'main',
      locationName: locationName(b, s.locationId || 'main'), createdAt: s.createdAt, acceptedAt: s.acceptedAt || 0, cancelledAt: s.cancelledAt || 0,
      inviteOpen: !!s.invite && s.inviteExpiresAt > Date.now(),
      redemptions: t.n, before: money(t.before), after: money(t.after), discount: money(disc),
      share: totalN ? t.n / totalN : 0, flags,
    };
  }).sort((a, z) => (a.status === 'cancelled') - (z.status === 'cancelled') || z.createdAt - a.createdAt);
  return { staff: rows, owner: { redemptions: o.n, before: money(o.before), after: money(o.after), discount: money(o.before - o.after), share: totalN ? o.n / totalN : 0 }, total: totalN };
}

async function authStaff(c) {
  const p = await readToken(c.ctx.secret, bearer(c.req), c.now);
  if (!p || p.role !== 'staff') return null;
  const s = c.state.staff.find((x) => x.id === p.id);
  if (!s || s.status !== 'accepted' || (p.v || 0) !== (s.tokenVer || 0)) return null;
  const b = getBiz(c.state, s.bizId);
  return b && b.status === 'approved' ? { staff: s, biz: b } : null;
}

// ---------------------------------------------------------------- redeeming (owner and staff share this)

async function doRedeem(c, biz, staff) {
  const { state, now, body } = c;
  if (biz.status !== 'approved') return err('This business must be approved before passes can be redeemed.');
  const code = clean(body.code, 20).toUpperCase().replace(/^LH-/, '').replace(/[^A-Z0-9]/g, '');
  const p = state.passes.find((x) => x.code === code && x.bizId === biz.id);
  if (!p) return err('No pass with that code was found for this business.', 404);
  const d = p.dealId ? getDeal(state, p.dealId) : null;
  const st = passStatus(p, d, biz, now);
  if (st !== 'active') return err(`This pass cannot be redeemed (${st}).`);

  const isLoop = p.kind === 'loop';
  let calc = null;
  if (!isLoop) {
    const raw = body.before;
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(Number(raw)) || Number(raw) <= 0 || Number(raw) > 100000) {
      return err('Enter the purchase total before the deal (for example 24.50).', 400, { needsAmount: true });
    }
    const upg = upgradedPass(d, p);
    calc = computeAfter(upg ? { ...d, type: upgradedType(d), value: d.upgrade.upgradedValue } : d, raw);
    if (body.after !== undefined && body.after !== null && body.after !== '') {
      const a = Number(body.after);
      if (!Number.isFinite(a) || a < 0 || a > calc.before) return err('The final amount must be between $0 and the purchase total.');
      calc = { ...calc, after: Math.round(a * 100) / 100, exact: true, overridden: true };
    }
    if (d.minSpend && p.stamps === 0 && calc.before < d.minSpend) return err(`This deal needs a minimum spend of $${d.minSpend}. The purchase total is $${calc.before.toFixed(2)}.`, 409);
  }
  if (body.preview) return ok({ preview: true, deal: d ? { title: d.title, label: dealLabel(d), stamps: d.stamps, minSpend: d.minSpend } : null, pass: { stamps: p.stamps, kind: p.kind, rewardText: p.rewardText || '' }, ...(calc || {}) });

  let locationId = clean(body.locationId, 40) || (staff && staff.locationId) || 'main';
  if (!validLocation(biz, locationId)) locationId = 'main';
  p.stamps += 1;
  p.lastRedeemAt = now;
  let message;
  if (isLoop) {
    message = `Loop reward redeemed: ${p.rewardText}.`;
    alertTo(state, c.ctx, p.consumerId, 'redeem', 'Reward used', `${p.rewardText} at ${biz.name}.`, { bizId: biz.id });
  } else {
    const done = p.stamps >= d.stamps;
    message = d.stamps > 1 ? `Stamp ${p.stamps} of ${d.stamps} added.${done ? ' Card complete!' : ''}` : 'Pass redeemed.';
    message += ` Purchase $${calc.before.toFixed(2)}, after the deal $${calc.after.toFixed(2)}${calc.exact ? '' : ' (estimated)'}.`;
    alertTo(state, c.ctx, p.consumerId, 'redeem', d.stamps > 1 ? `Stamp ${p.stamps} of ${d.stamps}` : 'Pass redeemed', `${d.title} at ${biz.name}.`, { dealId: d.id, bizId: biz.id });
    const loop = state.loops.find((l) => l.fromDealId === d.id && l.status === 'active');
    if (loop && p.stamps === 1 && !state.passes.some((x) => x.sourcePassId === p.id)) {
      const partner = getBiz(state, loop.toBizId);
      if (partner && partner.status === 'approved') {
        state.passes.push({
          id: uid('p'), code: makeCode(), referralCode: '', kind: 'loop', dealId: null, bizId: partner.id, consumerId: p.consumerId,
          loopId: loop.id, sourcePassId: p.id, rewardText: loop.rewardText, createdAt: now, expiresAt: now + 14 * DAY, stamps: 0, friendSaves: 0, lastRedeemAt: 0,
        });
        alertTo(state, c.ctx, p.consumerId, 'loop', `Loop reward unlocked at ${partner.name}`, `${loop.rewardText}. It is in your wallet for 14 days.`, { bizId: partner.id });
        message += ` The customer also earned a reward at ${partner.name}.`;
      }
    }
    state.redemptions.push({
      id: uid('r'), bizId: biz.id, dealId: d.id, passId: p.id, staffId: staff ? staff.id : '', locationId, at: now,
      before: calc.before, after: calc.after, exact: calc.exact,
    });
    if (state.redemptions.length > 50000) state.redemptions.splice(0, state.redemptions.length - 50000);
  }
  log(state, c.ctx, biz.id, 'redeem', (d ? d.title : `Loop reward: ${p.rewardText}`) + (staff ? ` (by ${staff.name})` : ''));
  return ok({ ok: true, message, ...(calc || {}) });
}

async function routeRedeem(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  return doRedeem(c, b, null);
}
async function routeStaffRedeem(c) {
  const a = await authStaff(c);
  if (!a) return NEED_LOGIN();
  return doRedeem(c, a.biz, a.staff);
}

// ---------------------------------------------------------------- staff

const periodBounds = (q, now) => ({ from: Math.max(0, Number(q.from) || 0), to: Number(q.to) > 0 ? Number(q.to) : now + DAY });

// Lists behind the Overview numbers and the redemption log (owner only).
async function routeReport(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, now, query: q } = c;
  const { from, to } = periodBounds(q, now);
  const mineDeals = state.deals.filter((d) => d.bizId === b.id);
  const brief = (d) => ({ id: d.id, title: d.title, label: dealLabel(d), startsAt: d.startsAt, endsAt: d.endsAt, status: d.status, publishedAt: d.publishedAt || 0, ...dealMetrics(state, d) });
  const kind = q.kind;
  if (kind === 'live') return ok({ kind, rows: mineDeals.filter((d) => isLive(d, b, now)).sort((a, z) => a.startsAt - z.startsAt).map(brief) });
  if (kind === 'published') return ok({ kind, rows: mineDeals.filter((d) => d.publishedAt && sameMonth(d.publishedAt, now)).sort((a, z) => a.publishedAt - z.publishedAt).map(brief) });
  if (kind === 'saves') {
    const rows = state.passes.filter((p) => p.bizId === b.id && p.kind === 'deal' && sameMonth(p.createdAt, now)).sort((a, z) => a.createdAt - z.createdAt).map((p) => {
      const d = getDeal(state, p.dealId);
      return { id: p.id, code: p.code, dealTitle: d ? d.title : '', savedAt: p.createdAt, shared: !!(p.sharedAt || p.friendSaves > 0), sharedAt: p.sharedAt || 0, friendSaves: p.friendSaves, redeemed: p.stamps > 0 };
    });
    return ok({ kind, rows });
  }
  if (kind === 'redemptions') {
    const reds = state.redemptions.filter((r) => r.bizId === b.id && r.at >= from && r.at < to);
    const rows = mineDeals.map((d) => {
      const t = sumRedemptions(reds.filter((r) => r.dealId === d.id));
      return { id: d.id, title: d.title, label: dealLabel(d), status: d.status, startsAt: d.startsAt, endsAt: d.endsAt, redemptions: t.n, before: money(t.before), after: money(t.after) };
    }).filter((r) => r.redemptions > 0).sort((a, z) => z.redemptions - a.redemptions);
    return ok({ kind, rows });
  }
  return err('Unknown list.');
}

// Every redemption with who rang it up, newest first. Optional: staffId ('owner' for the owner), from, to.
async function routeRedemptionLog(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, now, query: q } = c;
  const { from, to } = periodBounds(q, now);
  const names = new Map(state.staff.filter((s) => s.bizId === b.id).map((s) => [s.id, s.name]));
  const rows = state.redemptions.filter((r) => r.bizId === b.id && r.at >= from && r.at < to && (!q.staffId || (q.staffId === 'owner' ? !r.staffId : r.staffId === q.staffId)))
    .sort((a, z) => z.at - a.at).slice(0, 300).map((r) => {
      const d = getDeal(state, r.dealId), p = state.passes.find((x) => x.id === r.passId);
      return { id: r.id, at: r.at, dealTitle: d ? d.title : '', by: r.staffId ? names.get(r.staffId) || 'Former team member' : 'Owner', staffId: r.staffId || 'owner', locationName: locationName(b, r.locationId), code: p ? p.code : '', before: r.before, after: r.after };
    });
  return ok({ rows });
}

async function routeStaffList(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const lim = limitsFor(b, c.now);
  const active = c.state.staff.filter((s) => s.bizId === b.id && staffCounts(s)).length;
  return ok({ ...staffRows(c.state, b), limit: lim.staff, used: active, locations: locationList(b) });
}

async function routeStaffInvite(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  if (b.status !== 'approved') return err('Your account must be approved before you can invite staff.');
  const name = clean(body.name, 60);
  const method = ['qr', 'email', 'sms'].includes(body.method) ? body.method : 'qr';
  const contact = clean(body.contact, 120);
  if (name.length < 2) return err('Enter the team member\'s name.');
  if (method === 'email' && !validEmail(contact)) return err('Enter a valid email address.');
  if (method === 'sms' && contact.replace(/\D/g, '').length < 7) return err('Enter a mobile phone number.');
  const used = state.staff.filter((s) => s.bizId === b.id && staffCounts(s)).length;
  if (used >= limitsFor(b, now).staff) return err(`Your plan allows ${limitsFor(b, now).staff} team members.${effectiveTier(b, now) === 'free' ? ' Upgrade to Pro for more.' : ''}`);
  const locationId = validLocation(b, body.locationId) ? clean(body.locationId, 40) || 'main' : 'main';
  const s = {
    id: uid('s'), bizId: b.id, name, method, contact, status: 'invited', locationId, createdAt: now, acceptedAt: 0,
    invite: rand(20), inviteExpiresAt: now + 7 * DAY,
  };
  state.staff.push(s);
  log(state, c.ctx, b.id, 'staff_invited', `${name} (${method.toUpperCase()})`);
  const base = siteBase(c);
  const path = 'staff.html?invite=' + s.invite;
  let emailed = false;
  if (method === 'email' && base) {
    emailed = await sendEmail(c, contact, `${b.name} invited you to redeem LocalHints deals`,
      `Hi ${name},\n\n${b.name} invited you to scan and redeem LocalHints passes.\nOpen this link on your phone to accept (valid 7 days, one use):\n${base}/${path}\n\nIf you were not expecting this, ignore this email.`);
  }
  return ok({ staff: staffRows(state, b).staff.find((x) => x.id === s.id), invitePath: path, inviteUrl: base ? `${base}/${path}` : '', emailed, businessName: b.name }, 201);
}

async function routeStaffAction(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  const s = state.staff.find((x) => x.id === c.params.id && x.bizId === b.id && staffShown(x));
  if (!s) return err('Team member not found.', 404);
  const a = body.action;
  if (a === 'suspend') {
    if (s.status !== 'accepted') return err('Only accepted team members can be suspended.');
    s.status = 'suspended';
    log(state, c.ctx, b.id, 'staff_suspended', s.name);
  } else if (a === 'reinstate') {
    if (s.status !== 'suspended') return err('Only suspended team members can be reinstated.');
    s.status = 'accepted';
    log(state, c.ctx, b.id, 'staff_reinstated', s.name);
  } else if (a === 'cancel' || a === 'remove') {
    // Cancel works at any time (left the company, lost phone, invite never used). Their phone stops working at once;
    // their past redemptions stay on record so totals and the audit trail still add up.
    if (s.status === 'cancelled') return err('This team member is already cancelled.');
    s.status = 'cancelled'; s.invite = ''; s.cancelledAt = now; s.tokenVer = (s.tokenVer || 0) + 1;
    log(state, c.ctx, b.id, 'staff_removed', s.name);
  } else if (a === 'reinvite' || a === 'new_device') {
    if (a === 'reinvite' && s.status !== 'invited' && s.status !== 'cancelled') return err('This person already accepted. Use "Lost phone / new phone" instead.');
    if (a === 'new_device' && s.status !== 'accepted' && s.status !== 'suspended') return err('Only people who already joined can move to a new phone.');
    if (s.status === 'cancelled' && !(limitsFor(b, now).staff > state.staff.filter((x) => x.bizId === b.id && staffCounts(x)).length)) return err('Your plan\'s team limit is full.');
    if (a === 'new_device' || s.status === 'cancelled') { s.tokenVer = (s.tokenVer || 0) + 1; s.status = 'invited'; s.cancelledAt = 0; log(state, c.ctx, b.id, 'staff_invited', `${s.name} (${a === 'new_device' ? 'new phone' : 'invited again'})`); }
    s.invite = rand(20); s.inviteExpiresAt = now + 7 * DAY;
    const base = siteBase(c);
    const path = 'staff.html?invite=' + s.invite;
    let emailed = false;
    if (s.method === 'email' && base) emailed = await sendEmail(c, s.contact, `${b.name} invited you to redeem LocalHints deals`, `Hi ${s.name},\n\nHere is your new link (valid 7 days, one use):\n${base}/${path}`);
    return ok({ staff: staffRows(state, b).staff.find((x) => x.id === s.id), invitePath: path, inviteUrl: base ? `${base}/${path}` : '', emailed, businessName: b.name });
  } else if (a === 'location') {
    if (!validLocation(b, body.locationId)) return err('Unknown location.');
    s.locationId = clean(body.locationId, 40) || 'main';
  } else return err('Unknown action.');
  return ok({ ok: true });
}

async function routeStaffAccept(c) {
  const { state, body, now } = c;
  if (hit(state, 'accept:' + ipOf(c), now, 20, HOUR)) return err('Too many tries. Please wait a while.', 429);
  const code = clean(body.invite, 40);
  const s = code ? state.staff.find((x) => x.invite === code && x.status === 'invited') : null;
  if (!s) return err('This invite is not valid anymore. Ask your manager for a new one.', 404);
  if (s.inviteExpiresAt < now) return err('This invite expired. Ask your manager for a new one.', 410);
  const b = getBiz(state, s.bizId);
  if (!b || b.status !== 'approved') return err('This business is not active right now.');
  if (body.preview) return ok({ preview: true, businessName: b.name, name: s.name });
  const n = clean(body.name, 60);
  if (n.length >= 2) s.name = n;
  s.status = 'accepted'; s.acceptedAt = now; s.invite = '';
  log(state, c.ctx, b.id, 'staff_accepted', s.name);
  const token = await signToken(c.ctx.secret, { role: 'staff', id: s.id, v: s.tokenVer || 0, exp: now + 14 * DAY });
  return ok({ token, staff: { id: s.id, name: s.name }, business: { name: b.name, emoji: b.emoji } });
}

async function routeStaffMe(c) {
  const a = await authStaff(c);
  if (!a) return NEED_LOGIN();
  const { state, now } = c;
  const mine = state.redemptions.filter((r) => r.staffId === a.staff.id);
  const today = sumRedemptions(mine.filter((r) => r.at >= now - (now % DAY)));
  const all = sumRedemptions(mine);
  return ok({
    staff: { id: a.staff.id, name: a.staff.name, locationName: locationName(a.biz, a.staff.locationId || 'main') },
    business: { name: a.biz.name, emoji: a.biz.emoji }, locations: locationList(a.biz),
    today: { n: today.n }, total: { n: all.n },
  });
}

// ---------------------------------------------------------------- locations (Pro)

async function routeLocationAdd(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, body, now } = c;
  if (effectiveTier(b, now) !== 'pro') return err('Multiple locations are part of Pro.', 403, { needsPro: true });
  const list = b.locations || [];
  if (list.length + 1 >= LIMITS.pro.locations) return err(`You can add up to ${LIMITS.pro.locations} locations.`);
  const name = clean(body.name, 60);
  const address = clean(body.address, 160);
  if (name.length < 2) return err('Give the location a name, like "Downtown".');
  if (address.length < 6) return err('Enter the location\'s street address.');
  let lat, lng, formatted = address, verified = false;
  const g = await geocode(c.ctx, address);
  if (g.unavailable) {
    lat = Number(body.lat); lng = Number(body.lng);
    if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err('We need a map location. Tap "Use my current location" while you are there.');
  } else if (!g.ok) return err(g.error);
  else { ({ lat, lng } = g); formatted = g.formatted; verified = true; }
  const loc = { id: uid('l'), name, address: formatted, lat, lng, verified };
  b.locations = [...list, loc];
  log(state, c.ctx, b.id, 'location_added', name);
  return ok({ locations: locationList(b) }, 201);
}
async function routeLocationRemove(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const list = b.locations || [];
  const loc = list.find((l) => l.id === c.params.id);
  if (!loc) return err('Location not found.', 404);
  b.locations = list.filter((l) => l.id !== loc.id);
  for (const s of c.state.staff) if (s.bizId === b.id && s.locationId === loc.id) s.locationId = 'main';
  log(c.state, c.ctx, b.id, 'location_removed', loc.name);
  return ok({ locations: locationList(b) });
}

// ---------------------------------------------------------------- analytics (graphs) and advice

const SERIES_DAYS = 30;
function computeAnalytics(state, b, now) {
  const pro = effectiveTier(b, now) === 'pro';
  const reds = state.redemptions.filter((r) => r.bizId === b.id);
  const mine = state.deals.filter((d) => d.bizId === b.id && d.status !== 'draft');
  const rows = mine.map((d) => {
    const m = dealMetrics(state, d);
    const t = sumRedemptions(reds.filter((r) => r.dealId === d.id));
    const logged = t.n > 0;
    return {
      id: d.id, title: d.title, type: d.type, label: dealLabel(d), status: d.status, startsAt: d.startsAt, endsAt: d.endsAt,
      past: d.status === 'ended' || now >= d.endsAt, ...m,
      saveRate: m.views ? m.saves / m.views : 0, redeemRate: m.saves ? m.redemptions / m.saves : 0,
      before: money(t.before), after: money(t.after),
      revenue: Math.round(logged ? t.after : m.redemptions * AVG_TICKET[b.category]), revenueEstimated: !logged,
    };
  }).sort((a, z) => z.startsAt - a.startsAt);
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  const totals = { views: sum('views'), saves: sum('saves'), shares: sum('shares'), redemptions: sum('redemptions'), revenue: sum('revenue'), before: money(sum('before')), after: money(sum('after')) };
  return { pro, rows, totals, reds, mine };
}

function buildSeries(state, b, now, rows, reds) {
  const end = now - (now % DAY);
  const days = Array.from({ length: SERIES_DAYS }, (_, i) => end - (SERIES_DAYS - 1 - i) * DAY);
  const idx = (t) => Math.floor((t - days[0]) / DAY);
  const blank = () => Array(SERIES_DAYS).fill(0);
  const perDeal = {};
  for (const r of rows) perDeal[r.id] = { saves: blank(), redemptions: blank(), sales: blank() };
  for (const p of state.passes) {
    if (p.bizId !== b.id || p.kind !== 'deal' || !perDeal[p.dealId]) continue;
    const i = idx(p.createdAt);
    if (i >= 0 && i < SERIES_DAYS) perDeal[p.dealId].saves[i] += 1;
  }
  const perLocation = {};
  for (const l of locationList(b)) perLocation[l.id] = { name: l.name, redemptions: blank(), sales: blank(), before: 0, after: 0, count: 0 };
  for (const r of reds) {
    const i = idx(r.at);
    const L = perLocation[r.locationId] || perLocation.main;
    L.before += r.before; L.after += r.after; L.count += 1;
    if (i < 0 || i >= SERIES_DAYS) continue;
    if (perDeal[r.dealId]) { perDeal[r.dealId].redemptions[i] += 1; perDeal[r.dealId].sales[i] += r.after; }
    L.redemptions[i] += 1; L.sales[i] += r.after;
  }
  for (const k of Object.keys(perDeal)) perDeal[k].sales = perDeal[k].sales.map(money);
  for (const k of Object.keys(perLocation)) { const L = perLocation[k]; L.sales = L.sales.map(money); L.before = money(L.before); L.after = money(L.after); }
  return { days, perDeal, perLocation };
}

function makeInsights(rows, totals, mineRates, bench) {
  const insights = [];
  const ranked = rows.filter((r) => r.saves >= 5).sort((a, z) => z.redeemRate - a.redeemRate);
  if (ranked.length) insights.push(`"${ranked[0].title}" is your best deal so far: ${(ranked[0].redeemRate * 100).toFixed(0)}% of people who saved it came in.`);
  const byType = {};
  for (const r of ranked) (byType[r.type] ||= []).push(r.redeemRate);
  const types = Object.entries(byType).map(([t, a]) => [t, a.reduce((x, y) => x + y, 0) / a.length]).sort((a, z) => z[1] - a[1]);
  if (types.length >= 2) insights.push(`${typeName(types[0][0])} deals bring people in the most for you (${(types[0][1] * 100).toFixed(0)}% redeemed).`);
  if (totals.views >= 30) {
    insights.push(mineRates.saveRate >= bench.saveRate
      ? `Your save rate (${(mineRates.saveRate * 100).toFixed(0)}%) beats the ${(bench.saveRate * 100).toFixed(0)}% neighborhood benchmark.`
      : `Your save rate (${(mineRates.saveRate * 100).toFixed(0)}%) is under the ${(bench.saveRate * 100).toFixed(0)}% benchmark. Try a stronger title or a bigger first offer.`);
  }
  if (totals.saves >= 10 && mineRates.redeemRate < bench.redeemRate) insights.push('Many people save but do not come in. Try a Pass Push reminder or a shorter deal window.');
  if (!insights.length) insights.push('Run a few deals and we will show what works best.');
  return { insights, best: ranked.length ? ranked[0].id : null };
}

async function routeAnalytics(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, now } = c;
  const { pro, rows, totals, reds } = computeAnalytics(state, b, now);
  if (!pro) return ok({ locked: true, totals: { ...totals } });

  const rate = (n, dn) => (dn ? n / dn : 0);
  const mineRates = { saveRate: rate(totals.saves, totals.views), redeemRate: rate(totals.redemptions, totals.saves), shareRate: rate(totals.shares, totals.saves) };
  const peers = state.businesses.filter((x) => x.id !== b.id && x.category === b.category && x.status === 'approved');
  let pv = 0, ps = 0, pr = 0;
  for (const x of peers) for (const d of state.deals.filter((q) => q.bizId === x.id && q.status !== 'draft')) {
    const m = dealMetrics(state, d); pv += m.views; ps += m.saves; pr += m.redemptions;
  }
  const bench = peers.length >= 2 && pv >= 50
    ? { source: 'platform', sample: peers.length, saveRate: rate(ps, pv), redeemRate: rate(pr, ps) }
    : { source: 'estimate', sample: peers.length, ...BENCH[b.category] };
  const { insights, best } = makeInsights(rows, totals, mineRates, bench);
  return ok({
    locked: false, totals, rates: mineRates, benchmark: bench, deals: rows.map((r) => ({ ...r, best: r.id === best })), insights,
    series: buildSeries(state, b, now, rows, reds), locations: locationList(b), aiAvailable: !!(c.ctx.env && c.ctx.env.ANTHROPIC_API_KEY),
  });
}

// "What to try next": rule-based tips always work. If ANTHROPIC_API_KEY is set (Worker secret), Claude writes
// the advice from the business's aggregated numbers only. Pro only, cached for 24 hours.
async function routeAdvice(c) {
  const b = await authBiz(c);
  if (!b) return NEED_LOGIN();
  const { state, now } = c;
  const { pro, rows, totals } = computeAnalytics(state, b, now);
  if (!pro) return err('What to try next is part of Pro.', 403, { needsPro: true });
  const env = c.ctx.env || {};
  const rules = [];
  const ranked = rows.filter((r) => r.saves >= 5).sort((a, z) => z.redeemRate - a.redeemRate);
  if (ranked.length) rules.push(`Run more deals like "${ranked[0].title}". It converts best for you.`);
  if (totals.saves >= 10 && totals.redemptions / Math.max(1, totals.saves) < 0.3) rules.push('Send a Pass Push reminder two days before each deal ends.');
  if (!rows.some((r) => r.status === 'live')) rules.push('You have no live deal. Publish one so shoppers nearby can save it.');
  if (!rules.length) rules.push('Publish a few deals and we will show what works best.');
  if (!env.ANTHROPIC_API_KEY) return ok({ source: 'rules', tips: rules });
  if (b.advice && b.advice.at > now - DAY && !c.body.refresh) return ok({ source: 'ai', tips: b.advice.tips, cached: true });
  try {
    const f = c.ctx.fetch || fetch;
    const summary = {
      category: b.category, totals: { views: totals.views, saves: totals.saves, redemptions: totals.redemptions, salesAfterDeals: totals.after },
      deals: rows.slice(0, 8).map((r) => ({ title: r.title, type: r.type, views: r.views, saves: r.saves, redemptions: r.redemptions, status: r.status })),
    };
    const res = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 500,
        system: 'You advise small local businesses using a coupon wallet. Reply with 3 short, concrete, friendly tips, one per line, no numbering, no markdown. Use only the numbers given.',
        messages: [{ role: 'user', content: 'Here are my last results as JSON. What should I try next?\n' + JSON.stringify(summary) }],
      }),
    });
    if (!res.ok) return ok({ source: 'rules', tips: rules });
    const data = await res.json();
    const text = (data.content || []).map((x) => x.text || '').join('\n');
    const tips = text.split('\n').map((s) => clean(s.replace(/^[-*\d.\s]+/, ''), 220)).filter(Boolean).slice(0, 4);
    if (!tips.length) return ok({ source: 'rules', tips: rules });
    b.advice = { at: now, tips };
    return ok({ source: 'ai', tips });
  } catch {
    return ok({ source: 'rules', tips: rules });
  }
}

// ---------------------------------------------------------------- password reset

async function makeResetLink(c, kind, id, nonce, path) {
  const token = await signToken(c.ctx.secret, { role: 'reset', kind, id, n: nonce, exp: c.now + RESET_LIFE });
  const base = siteBase(c);
  return { token, url: base ? `${base}/${path}?reset=${token}` : '' };
}
const RESET_GENERIC = 'If that account exists, a link to choose a new password is on its way. It works for 1 hour.';

async function routeBizForgot(c) {
  const { state, body, now } = c;
  if (hit(state, 'forgot:' + ipOf(c), now, 6, HOUR)) return err('Too many requests. Please try again later.', 429);
  const email = clean(body.email, 120).toLowerCase();
  const b = validEmail(email) ? state.businesses.find((x) => x.email === email && x.status !== 'closed') : null;
  const out = { ok: true, message: RESET_GENERIC };
  if (b) {
    b.resetNonce = rand(10);
    const link = await makeResetLink(c, 'business', b.id, b.resetNonce, 'business.html');
    log(state, c.ctx, b.id, 'password_reset_requested', '');
    const sent = link.url ? await sendEmail(c, b.email, 'Reset your LocalHints password', `Hi ${b.ownerName},\n\nChoose a new password here (valid for 1 hour, one use):\n${link.url}\n\nIf you did not ask for this, ignore this email.`) : false;
    if (c.ctx.demo) { out.demoLink = link.url || `business.html?reset=${link.token}`; out.message = 'Demo mode: no email is sent. Use the link below.'; }
    else if (!sent) console.error('reset email not sent: set SITE_URL, RESEND_API_KEY and EMAIL_FROM');
  }
  return ok(out);
}
async function routeBizReset(c) {
  const { state, body, now } = c;
  if (hit(state, 'reset:' + ipOf(c), now, 15, HOUR)) return err('Too many tries. Please wait a while.', 429);
  const p = await readToken(c.ctx.secret, clean(body.token, 600), now);
  const b = p && p.role === 'reset' && p.kind === 'business' ? getBiz(state, p.id) : null;
  if (!b || !b.resetNonce || b.resetNonce !== p.n) return err('This link is not valid anymore. Ask for a new one.', 400);
  const pw = passwordProblem(body.password);
  if (pw) return err(pw);
  const hp = await hashPassword(body.password);
  b.passSalt = hp.salt; b.passHash = hp.hash; b.resetNonce = ''; b.pwChangedAt = now;
  for (const k of Object.keys(state.rate)) if (k.startsWith('login:' + b.email + '|')) delete state.rate[k];
  log(state, c.ctx, b.id, 'password_reset', '');
  return ok({ ok: true });
}
async function routeAdminForgot(c) {
  const { state, now } = c;
  if (hit(state, 'aforgot:' + ipOf(c), now, 4, HOUR)) return err('Too many requests. Please try again later.', 429);
  const env = c.ctx.env || {};
  const out = { ok: true, message: RESET_GENERIC };
  if (env.ADMIN_EMAIL || c.ctx.demo) {
    state.adminResetNonce = rand(10);
    const link = await makeResetLink(c, 'admin', 'admin', state.adminResetNonce, 'admin.html');
    const sent = link.url && env.ADMIN_EMAIL ? await sendEmail(c, env.ADMIN_EMAIL, 'Reset the LocalHints admin password', `Choose a new admin password here (valid for 1 hour, one use):\n${link.url}\n\nIf you did not ask for this, ignore this email.`) : false;
    if (c.ctx.demo) { out.demoLink = link.url || `admin.html?reset=${link.token}`; out.message = 'Demo mode: no email is sent. Use the link below.'; }
    else if (!sent) console.error('admin reset email not sent: set ADMIN_EMAIL, SITE_URL, RESEND_API_KEY and EMAIL_FROM');
  }
  return ok(out);
}
async function routeAdminPasswordReset(c) {
  const { state, body, now } = c;
  if (hit(state, 'areset:' + ipOf(c), now, 15, HOUR)) return err('Too many tries. Please wait a while.', 429);
  const p = await readToken(c.ctx.secret, clean(body.token, 600), now);
  if (!p || p.role !== 'reset' || p.kind !== 'admin' || !state.adminResetNonce || p.n !== state.adminResetNonce) return err('This link is not valid anymore. Ask for a new one.', 400);
  const pw = passwordProblem(body.password);
  if (pw) return err(pw);
  const hp = await hashPassword(body.password);
  state.adminCred = { salt: hp.salt, hash: hp.hash, at: now };
  state.adminResetNonce = '';
  clearFailures(state, 'admin:' + ipOf(c));
  return ok({ ok: true });
}

// ---------------------------------------------------------------- admin lists

async function routeAdminDeals(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const { state, now, query: q } = c;
  const list = state.deals.filter((d) => {
    const b = getBiz(state, d.bizId);
    if (!b) return false;
    return q.live === '1' ? isLive(d, b, now) : true;
  }).sort((a, z) => z.startsAt - a.startsAt).slice(0, 300).map((d) => {
    const b = getBiz(state, d.bizId);
    return { id: d.id, title: d.title, label: dealLabel(d), status: d.status, live: isLive(d, b, now), startsAt: d.startsAt, endsAt: d.endsAt, bizId: b.id, bizName: b.name, emoji: b.emoji };
  });
  return ok({ deals: list });
}

const tipIsLive = (t, now) => t.status === 'approved' && (t.approvedAt || t.at) + TIP_LIFE > now;
function tipPublic(t) {
  return { id: t.id, name: t.name, address: t.address, note: t.note, spotter: t.spotterName || 'A neighbor', spottedAt: t.at };
}
async function routeTip(c) {
  const { state, body, now } = c;
  const note = clean(body.note, 200);
  const name = clean(body.name, 60);
  const spotterName = clean(body.spotterName, 40);
  const contact = clean(body.contact, 120);
  if (name.length < 2 || note.length < 5) return err('Add the business name and a short note.');
  if (spotterName.length < 2) return err('Add your first name so neighbors know who spotted it.');
  if (contact) {
    if (!body.consent) return err('Please tick the box to let us share your contact with the business, or leave the contact blank.');
    if (!validEmail(contact) && contact.replace(/\D/g, '').length < 7) return err('Enter a valid email or phone, or leave it blank.');
  }
  if (hit(state, 'tip:' + ipOf(c), now, 10, HOUR)) return err('Too many tips. Please try again later.', 429);
  state.tips.push({
    id: uid('t'), consumerId: clean(body.consumerId, 60), name, address: clean(body.address, 120), note, spotterName,
    contact, consent: !!contact && !!body.consent, status: 'pending', at: now, approvedAt: 0,
  });
  return ok({ ok: true });
}
async function routeAdminTips(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const { state, now, query: q } = c;
  let list = state.tips.slice();
  if (q.status) list = list.filter((t) => t.status === q.status);
  if (q.live === '1') list = list.filter((t) => tipIsLive(t, now));
  return ok({ tips: list.sort((a, z) => z.at - a.at).slice(0, 100).map((t) => ({ ...t, live: tipIsLive(t, now) })) });
}
async function routeAdminTip(c) {
  if (!(await authAdmin(c))) return NEED_LOGIN();
  const t = c.state.tips.find((x) => x.id === c.params.id);
  if (!t) return err('Tip not found.', 404);
  if (c.body.action !== 'approve' && c.body.action !== 'reject') return err('Unknown action.');
  t.status = c.body.action === 'approve' ? 'approved' : 'rejected';
  t.approvedAt = t.status === 'approved' ? c.now : 0;
  return ok({ tip: t });
}

const ROUTES = [
  ['GET', '/api/health', routeHealth],
  ['GET', '/api/deals', routeDeals],
  ['POST', '/api/view', routeView],
  ['POST', '/api/claim', routeClaim],
  ['POST', '/api/unsave', routeUnsave],
  ['GET', '/api/passes', routePasses],
  ['GET', '/api/wallet/:platform/:id', routeWallet],
  ['POST', '/api/subscribe', routeSubscribe],
  ['GET', '/api/alerts', routeAlerts],
  ['POST', '/api/tips', routeTip],
  ['GET', '/api/logo/:id', routeLogo],
  ['POST', '/api/address/verify', routeVerifyAddress],
  ['POST', '/api/business/signup', routeSignup],
  ['POST', '/api/business/login', routeLogin],
  ['GET', '/api/business/me', routeMe],
  ['GET', '/api/business/partners', routePartners],
  ['POST', '/api/business/profile', routeProfile],
  ['POST', '/api/business/logo', routeLogoUpload],
  ['POST', '/api/business/logo/remove', routeLogoRemove],
  ['POST', '/api/business/tier', routeTier],
  ['POST', '/api/business/close', routeClose],
  ['POST', '/api/business/deals', routeDealCreate],
  ['POST', '/api/business/deals/:id/edit', routeDealEdit],
  ['POST', '/api/business/deals/:id/publish', routeDealPublish],
  ['POST', '/api/business/deals/:id/status', routeDealStatus],
  ['POST', '/api/business/deals/:id/delete', routeDealDelete],
  ['POST', '/api/business/redeem', routeRedeem],
  ['GET', '/api/business/report', routeReport],
  ['GET', '/api/business/redemptions', routeRedemptionLog],
  ['POST', '/api/share', routeShare],
  ['POST', '/api/business/forgot', routeBizForgot],
  ['POST', '/api/business/reset', routeBizReset],
  ['GET', '/api/business/staff', routeStaffList],
  ['POST', '/api/business/staff', routeStaffInvite],
  ['POST', '/api/business/staff/:id', routeStaffAction],
  ['POST', '/api/business/locations', routeLocationAdd],
  ['POST', '/api/business/locations/:id/remove', routeLocationRemove],
  ['POST', '/api/business/advice', routeAdvice],
  ['POST', '/api/staff/accept', routeStaffAccept],
  ['GET', '/api/staff/me', routeStaffMe],
  ['POST', '/api/staff/redeem', routeStaffRedeem],
  ['POST', '/api/business/drop', routeDrop],
  ['POST', '/api/business/push', routePush],
  ['POST', '/api/business/loops', routeLoopPropose],
  ['POST', '/api/business/loops/:id', routeLoopRespond],
  ['GET', '/api/business/analytics', routeAnalytics],
  ['POST', '/api/admin/login', routeAdminLogin],
  ['POST', '/api/admin/forgot', routeAdminForgot],
  ['POST', '/api/admin/password-reset', routeAdminPasswordReset],
  ['GET', '/api/admin/deals', routeAdminDeals],
  ['GET', '/api/admin/me', routeAdminMe],
  ['GET', '/api/admin/stats', routeAdminStats],
  ['GET', '/api/admin/businesses', routeAdminBusinesses],
  ['GET', '/api/admin/businesses/:id', routeAdminBusiness],
  ['POST', '/api/admin/businesses/:id/action', routeAdminAction],
  ['GET', '/api/admin/events', routeAdminEvents],
  ['GET', '/api/admin/pilot', routeAdminPilot],
  ['GET', '/api/admin/tips', routeAdminTips],
  ['POST', '/api/admin/tips/:id', routeAdminTip],
  ['POST', '/api/admin/seed', routeAdminSeed],
  ['POST', '/api/admin/reset', routeAdminReset],
];
