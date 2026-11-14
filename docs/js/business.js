/* Merchant side (business.html): sign up, sign in, deals, reach, Loop-In, insights, account. */
import { api, MODE, ApiError, logoSrc } from './api.js';
import { CATEGORIES, EVENT_LABELS, LIMITS, PILOT, PRICE, DEMO_CENTER, UNLIMITED } from './engine.js';
import { DEMO_LOGINS, DEMO_PASSWORD } from './seed.js';
import {
  esc, toast, openSheet, closeSheet, confirmSheet, guard, fmtDate, fmtDateTime, ago, pct, money, dateInput, fromDateInput,
  getBrowserLocation, registerServiceWorker, avatar, catLabel, timeLeft,
} from './ui.js';

const root = document.getElementById('app');
const S = { token: tget(), me: null, tab: 'overview', health: { addressCheck: false }, analytics: null, partners: [], authMode: 'signup' };
function tget() { try { return localStorage.getItem('lh:biz-token') || ''; } catch { return ''; } }
function tset(v) { try { v ? localStorage.setItem('lh:biz-token', v) : localStorage.removeItem('lh:biz-token'); } catch { /* storage blocked */ } S.token = v; }

const biz = () => S.me.business;
const isPro = () => biz().effectiveTier === 'pro';
const lim = (n) => (n >= UNLIMITED ? 'unlimited' : n);

async function call(method, path, body) {
  try {
    return method === 'GET' ? await api.get(path, body, S.token) : await api.post(path, body, S.token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && S.token) { tset(''); S.me = null; authScreen(); }
    throw e;
  }
}
async function reload() {
  S.me = await call('GET', '/api/business/me');
}

// ---------------------------------------------------------------- top bar

function bar(right = '') {
  return `${MODE === 'demo' ? '<div class="banner">Demo mode: data stays in this browser. Demo logins are listed on the sign-in tab.</div>' : ''}
    <header class="topbar"><div class="topbar-in"><a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints <span class="badge b-brand">Business</span></a><span class="grow"></span>${right}</div></header>`;
}

// ---------------------------------------------------------------- address checker (shared by sign-up and profile)

function addressBlock(a) {
  return `<label class="field"><span class="lbl">Street address</span>
      <input class="input" id="addr" autocomplete="street-address" placeholder="123 Main Street, City, State" value="${esc(a.address)}"></label>
    <div class="row wrap mt"><button type="button" class="btn btn-sm" id="addrCheck">🔎 Check address with Google</button><button type="button" class="btn btn-sm" id="useLoc">📍 Use my location</button></div>
    <div id="addrResult" class="mt"></div>`;
}
function bindAddress(scope, a) {
  const input = scope.querySelector('#addr'), out = scope.querySelector('#addrResult');
  const show = () => {
    if (a.verified) out.innerHTML = `<div class="okmsg">✅ Verified: ${esc(a.address)}</div>`;
    else if (a.msg) out.innerHTML = a.msg;
    else out.innerHTML = S.health.addressCheck
      ? '<p class="hint">Tap “Check address” so we match it to Google’s list of real addresses. Every business is listed the same way.</p>'
      : '<p class="hint">Address checking is not connected on this server yet, so your address will be marked as “not verified”. A map location is still needed.</p>';
  };
  input.oninput = () => { a.address = input.value; a.verified = false; a.msg = ''; a.placeId = ''; show(); };
  scope.querySelector('#useLoc').onclick = (e) => guard(e.currentTarget, async () => {
    const p = await getBrowserLocation();
    a.lat = p.lat; a.lng = p.lng; a.locLabel = 'Using your current location';
    toast('Location saved for the map pin.');
  });
  scope.querySelector('#addrCheck').onclick = (e) => guard(e.currentTarget, async () => {
    const r = await api.post('/api/address/verify', { address: input.value });
    if (!r.available) {
      a.msg = '<div class="note">Address checking is not connected on this server yet. You can continue, and your address will be marked “not verified”.</div>';
    } else if (!r.ok) {
      a.msg = `<div class="err">${esc(r.error)}${r.suggestion ? `<br>Did you mean: <b>${esc(r.suggestion)}</b>?` : ''}</div>`;
    } else {
      a.msg = `<div class="card flat stack"><div><b>We matched this address:</b><br>${esc(r.formatted)}</div>
        ${r.partial ? '<div class="note">This is a close match, not an exact one. Please check it.</div>' : ''}
        ${r.sharedWith ? `<div class="note">${r.sharedWith} other business${r.sharedWith > 1 ? 'es are' : ' is'} already listed here. That is fine for shared buildings.</div>` : ''}
        <button type="button" class="btn btn-primary btn-sm" id="useAddr">Use this address</button></div>`;
      a.found = r;
    }
    show();
    const u = out.querySelector('#useAddr');
    if (u) u.onclick = () => { Object.assign(a, { address: a.found.formatted, verified: true, lat: a.found.lat, lng: a.found.lng, placeId: a.found.placeId, msg: '' }); input.value = a.address; show(); };
  });
  show();
}
const jitterDemo = () => ({ lat: DEMO_CENTER.lat + (Math.random() - 0.5) * 0.015, lng: DEMO_CENTER.lng + (Math.random() - 0.5) * 0.015 });

// ---------------------------------------------------------------- auth screen

function authScreen() {
  const a = { address: '', verified: false, msg: '', placeId: '', ...jitterDemo() };
  const signup = S.authMode === 'signup';
  root.innerHTML = `${bar('<a class="btn btn-sm" href="index.html">Shopper view</a>')}
  <main class="page"><div class="narrow stack-lg">
    <div class="hero"><h1>${signup ? 'List your business' : 'Welcome back'}</h1>
      <p class="muted">${signup ? 'Put deals in customers’ Apple and Google Wallets. Free to start, no card needed.' : 'Sign in to manage your deals, passes and neighborhood drops.'}</p></div>
    <div class="seg" role="tablist"><button role="tab" aria-selected="${signup}" data-mode="signup">Create account</button><button role="tab" aria-selected="${!signup}" data-mode="signin">Sign in</button></div>
    <form id="authForm" class="stack-lg" novalidate>
      ${signup ? `<div class="card stack"><h3>About you</h3><label class="field"><span class="lbl">Your name</span><input class="input" name="ownerName" autocomplete="name" required maxlength="60"></label></div>` : ''}
      <div class="card stack"><h3>Login</h3>
        <label class="field"><span class="lbl">Email</span><input class="input" name="email" type="email" autocomplete="email" inputmode="email" required></label>
        <label class="field"><span class="lbl">Password</span><input class="input" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required>
          ${signup ? '<div class="hint">At least 8 characters, with a letter and a number.</div>' : ''}</label></div>
      ${signup ? `<div class="card stack"><h3>Your business</h3>
        <label class="field"><span class="lbl">Business name</span><input class="input" name="name" required maxlength="60"></label>
        <label class="field"><span class="lbl">Category</span><select class="input" name="category">${CATEGORIES.map((c) => `<option value="${c.id}">${c.emoji} ${esc(c.label)}</option>`).join('')}</select></label>
        <div id="addrBox">${addressBlock(a)}</div>
        <label class="field"><span class="lbl">One-line description (optional)</span><input class="input" name="blurb" maxlength="120"></label></div>
        <p class="small muted">You start on <b>Free Starter</b> (${LIMITS.free.dealsPerMonth} deals and ${LIMITS.free.savesPerMonth} wallet saves a month). We draft your first deal for you to edit, and an admin reviews new businesses before deals go live.</p>` : ''}
      <div id="authErr"></div>
      <button class="btn btn-primary btn-block" id="authGo">${signup ? 'Create account' : 'Sign in'}</button>
    </form>
    ${!signup && MODE === 'demo' ? `<div class="card flat stack"><h3>Demo accounts</h3><p class="small muted">Password for all: <b>${esc(DEMO_PASSWORD)}</b></p>
      ${DEMO_LOGINS.map((d) => `<button type="button" class="btn btn-sm" data-demo="${esc(d.email)}" style="justify-content:flex-start;text-align:left"><span><b>${esc(d.email)}</b><br><span class="small muted">${esc(d.note)}</span></span></button>`).join('')}</div>` : ''}
  </div></main>`;
  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { S.authMode = b.dataset.mode; authScreen(); }));
  if (signup) bindAddress(root.querySelector('#addrBox'), a);
  root.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = () => { const f = root.querySelector('#authForm'); f.email.value = b.dataset.demo; f.password.value = DEMO_PASSWORD; }));
  root.querySelector('#authForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const err = root.querySelector('#authErr');
    err.innerHTML = '';
    guard(root.querySelector('#authGo'), async () => {
      try {
        let r;
        if (signup) {
          if (S.health.addressCheck && !a.verified) throw new Error('Please check your address and tap “Use this address”.');
          r = await api.post('/api/business/signup', { ...f, address: a.address, lat: a.lat, lng: a.lng, placeId: a.placeId });
        } else r = await api.post('/api/business/login', f);
        tset(r.token);
        S.tab = 'overview';
        await reload();
        dashboard();
        toast(signup ? 'Welcome! Your account is ready.' : 'Signed in.');
      } catch (ex) {
        err.innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`;
      }
    });
  };
}

// ---------------------------------------------------------------- dashboard shell

const TABS = [['overview', 'Overview'], ['deals', 'Deals'], ['reach', 'Reach'], ['loop', 'Loop-In'], ['insights', 'Insights'], ['account', 'Account']];
function dashboard() {
  const b = biz();
  root.innerHTML = `${bar(`<span class="small muted only-desktop">${esc(b.name)}</span><button class="btn btn-sm" id="out">Sign out</button>`)}
    <main class="page">
      <div class="row wrap between"><div class="row">${avatar(b, 44)}<div><h1 style="font-size:22px">${esc(b.name)}</h1>
        <div class="row wrap" style="gap:6px;margin-top:4px">${statusBadge(b.status)}${planBadge(b)}</div></div></div></div>
      <div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" aria-selected="${S.tab === id}" data-tab="${id}">${l}${id === 'loop' && pendingIncoming().length ? ' •' : ''}</button>`).join('')}</div>
      <div id="view"></div></main>`;
  root.querySelector('#out').onclick = () => { tset(''); S.me = null; authScreen(); };
  root.querySelectorAll('[data-tab]').forEach((t) => (t.onclick = () => { S.tab = t.dataset.tab; dashboard(); }));
  ({ overview: vOverview, deals: vDeals, reach: vReach, loop: vLoop, insights: vInsights, account: vAccount })[S.tab](root.querySelector('#view'));
}
const statusBadge = (s) => `<span class="badge ${{ approved: 'b-good', pending: 'b-warn', suspended: 'b-bad', closed: 'b-bad' }[s]}">${{ approved: 'Approved', pending: 'Waiting for approval', suspended: 'Suspended', closed: 'Closed' }[s]}</span>`;
const planBadge = (b) => b.effectiveTier === 'pro' ? `<span class="badge b-pro">${b.pilotEndsAt > Date.now() ? 'Pro (pilot)' : 'Pro'}</span>` : '<span class="badge">Free Starter</span>';
const pendingIncoming = () => S.me.loops.filter((l) => l.status === 'pending' && l.to.id === biz().id);

function dealBadge(d) {
  const now = Date.now();
  if (d.status === 'live') return d.startsAt > now ? '<span class="badge b-warn">Scheduled</span>' : now >= d.endsAt ? '<span class="badge">Expired</span>' : '<span class="badge b-good">Live</span>';
  return `<span class="badge ${{ draft: 'b-warn', paused: 'b-warn', suspended: 'b-bad', ended: '' }[d.status]}">${{ draft: 'Draft', paused: 'Paused', suspended: 'Suspended by LocalHints', ended: 'Ended' }[d.status]}</span>`;
}
function upsell(text) {
  return `<div class="note stack"><span>${esc(text)}</span><button class="btn btn-sm btn-primary" data-upgrade>See Pro</button></div>`;
}
function bindUpgrade(scope) {
  scope.querySelectorAll('[data-upgrade]').forEach((b) => (b.onclick = () => { closeSheet(true); S.tab = 'account'; dashboard(); }));
}

// ---------------------------------------------------------------- overview

function meter(used, max) {
  return max >= UNLIMITED ? '' : `<div class="meter mt"><i style="width:${Math.min(100, (used / max) * 100)}%"></i></div>`;
}
function vOverview(v) {
  const b = biz(), u = b.usage, l = b.limits;
  const concierge = S.me.deals.find((d) => d.isConcierge && d.status === 'draft');
  const live = S.me.deals.filter((d) => d.live).length;
  const incoming = pendingIncoming();
  v.innerHTML = `<div class="stack-lg">
    ${b.status === 'pending' ? '<div class="note"><b>Waiting for approval.</b> An admin reviews new businesses, usually within a day. You can edit your first deal now, and publish it once you are approved.</div>' : ''}
    ${b.status === 'suspended' ? '<div class="err"><b>Your account is suspended.</b> Your deals are hidden. Contact LocalHints support.</div>' : ''}
    ${concierge ? `<div class="card stack" style="border-color:var(--brand)">
      <div class="row between"><span class="badge b-brand">✨ Your first deal, drafted for you</span>${dealBadge(concierge)}</div>
      <h2>${esc(concierge.title)}</h2><p class="muted">${esc(concierge.description)}</p>
      <div class="row wrap"><span class="badge b-brand">${esc(concierge.label)}</span><span class="small muted">Runs 7 days once it goes live</span></div>
      <div class="row wrap"><button class="btn grow" data-edit="${esc(concierge.id)}">✏️ Edit deal</button><button class="btn btn-primary grow" data-pub="${esc(concierge.id)}">Approve & go live</button></div></div>` : ''}
    ${incoming.map((l2) => `<div class="card stack"><b>🔁 ${esc(l2.from.name)} wants to loop in with you</b><p>Their customers who redeem “${esc(l2.fromDealTitle)}” would get: <b>${esc(l2.rewardText)}</b> at your shop.</p>
      <div class="row"><button class="btn btn-primary grow" data-loop="${esc(l2.id)}" data-act="accept">Accept</button><button class="btn grow" data-loop="${esc(l2.id)}" data-act="decline">Decline</button></div></div>`).join('')}
    <div class="stats">
      <div class="stat"><b>${live}</b><span>Live deals</span></div>
      <div class="stat"><b>${u.saves}</b><span>Wallet saves this month${l.savesPerMonth < UNLIMITED ? ` (limit ${l.savesPerMonth})` : ''}${meter(u.saves, l.savesPerMonth)}</span></div>
      <div class="stat"><b>${u.dealsPublished}</b><span>Deals published this month (${lim(l.dealsPerMonth)})${meter(u.dealsPublished, l.dealsPerMonth)}</span></div>
      <div class="stat"><b>${S.me.deals.reduce((n, d) => n + d.metrics.redemptions, 0)}</b><span>Total redemptions</span></div></div>
    <div class="card stack"><h2>Redeem a pass</h2><p class="muted small">Type the code from the customer’s pass (or what their QR code shows).</p>
      <form id="redeemForm" class="row"><input class="input grow" name="code" placeholder="Pass code" autocapitalize="characters" autocomplete="off" maxlength="14" required><button class="btn btn-primary">Redeem</button></form><div id="redeemOut"></div></div>
  </div>`;
  v.querySelectorAll('[data-edit]').forEach((x) => (x.onclick = () => dealForm(S.me.deals.find((d) => d.id === x.dataset.edit))));
  v.querySelectorAll('[data-pub]').forEach((x) => (x.onclick = () => guard(x, () => publishNow(x.dataset.pub))));
  v.querySelectorAll('[data-loop]').forEach((x) => (x.onclick = () => guard(x, () => loopAction(x.dataset.loop, x.dataset.act))));
  v.querySelector('#redeemForm').onsubmit = (e) => { e.preventDefault(); redeem(e.target.code.value, v.querySelector('#redeemOut'), e.target); };
}
async function redeem(code, out, form, confirmMinSpend) {
  try {
    const r = await call('POST', '/api/business/redeem', { code, confirmMinSpend });
    out.innerHTML = `<div class="okmsg mt">✅ ${esc(r.message)}</div>`;
    form.reset();
    await reload();
    setTimeout(() => S.tab === 'overview' && dashboard(), 2500);
  } catch (e) {
    if (e.data && e.data.needsMinSpend && await confirmSheet('Minimum spend', e.message, 'Yes, redeem')) return redeem(code, out, form, true);
    out.innerHTML = `<div class="err mt">${esc(e.message)}</div>`;
  }
}
async function publishNow(id) {
  try {
    await call('POST', `/api/business/deals/${id}/publish`);
    toast('Your deal is live!');
  } catch (e) {
    toast(e.message, 'bad');
  }
  await reload();
  dashboard();
}
async function loopAction(id, action) {
  await call('POST', `/api/business/loops/${id}`, { action });
  toast(action === 'accept' ? 'Loop-In accepted.' : action === 'decline' ? 'Declined.' : 'Loop-In ended.');
  await reload();
  dashboard();
}

// ---------------------------------------------------------------- deals

function vDeals(v) {
  const ds = S.me.deals;
  v.innerHTML = `<div class="row between"><h2>Your deals</h2><button class="btn btn-primary btn-sm" id="new">+ New deal</button></div>
    <div class="stack mt">${ds.length ? ds.map((d) => `<div class="card stack">
      <div class="row between"><div class="grow"><div class="row wrap" style="gap:6px">${dealBadge(d)}<span class="badge b-brand">${esc(d.label)}</span>${d.isConcierge ? '<span class="badge">Suggested</span>' : ''}${d.stamps > 1 ? `<span class="badge">${d.stamps}-stamp card</span>` : ''}</div>
        <h3 class="mt">${esc(d.title)}</h3><div class="small muted">${esc(fmtDate(d.startsAt))} to ${esc(fmtDate(d.endsAt))}</div></div></div>
      ${d.status !== 'draft' ? `<div class="row wrap small muted"><span>👁 ${d.metrics.views} views</span><span>👛 ${d.metrics.saves} saves</span><span>✅ ${d.metrics.redemptions} redeemed</span></div>` : ''}
      <div class="row wrap">
        ${['draft', 'live', 'paused'].includes(d.status) ? `<button class="btn btn-sm" data-edit="${esc(d.id)}">✏️ Edit</button>` : ''}
        ${d.status === 'draft' ? `<button class="btn btn-sm btn-primary" data-pub="${esc(d.id)}">Go live</button><button class="btn btn-sm" data-del="${esc(d.id)}">Delete</button>` : ''}
        ${d.status === 'live' ? `<button class="btn btn-sm" data-st="${esc(d.id)}" data-to="paused">Pause</button>` : ''}
        ${d.status === 'paused' ? `<button class="btn btn-sm btn-primary" data-st="${esc(d.id)}" data-to="live">Resume</button>` : ''}
        ${['live', 'paused'].includes(d.status) ? `<button class="btn btn-sm btn-danger" data-st="${esc(d.id)}" data-to="ended">End now</button>` : ''}
      </div></div>`).join('') : '<div class="empty"><div class="big">🏷️</div><p>No deals yet.</p></div>'}</div>`;
  v.querySelector('#new').onclick = () => dealForm(null);
  v.querySelectorAll('[data-edit]').forEach((x) => (x.onclick = () => dealForm(ds.find((d) => d.id === x.dataset.edit))));
  v.querySelectorAll('[data-pub]').forEach((x) => (x.onclick = () => guard(x, () => publishNow(x.dataset.pub))));
  v.querySelectorAll('[data-st]').forEach((x) => (x.onclick = () => guard(x, async () => {
    if (x.dataset.to === 'ended' && !(await confirmSheet('End this deal?', 'Every saved pass for it will stop working right away.', 'End deal', true))) return;
    await call('POST', `/api/business/deals/${x.dataset.st}/status`, { status: x.dataset.to });
    await reload(); dashboard();
  })));
  v.querySelectorAll('[data-del]').forEach((x) => (x.onclick = () => guard(x, async () => {
    if (!(await confirmSheet('Delete this draft?', 'This cannot be undone.', 'Delete', true))) return;
    await call('POST', `/api/business/deals/${x.dataset.del}/delete`);
    await reload(); dashboard();
  })));
}

function dealForm(d) {
  const pro = isPro();
  const b = biz();
  const now = Date.now();
  const started = !!(d && d.status !== 'draft' && d.startsAt <= now);
  const v = (k, dflt) => (d && d[k] !== undefined && d[k] !== null ? d[k] : dflt);
  const type = v('type', 'percent');
  const up = d && d.upgrade;
  const opt = (val, label, proOnly) => `<option value="${val}" ${type === val ? 'selected' : ''} ${proOnly && !pro ? 'disabled' : ''}>${label}${proOnly && !pro ? ' (Pro)' : ''}</option>`;
  const el = openSheet(`<h2>${d ? (d.isConcierge && d.status === 'draft' ? 'Edit your suggested deal' : 'Edit deal') : 'New deal'}</h2>
    <p class="muted small mt">${pro ? 'You are on Pro, so every option is available.' : 'These are the options on the Free plan. Pro adds more types, custom dates and extras.'}</p>
    <form id="df" class="stack-lg mt-lg" novalidate>
      <label class="field"><span class="lbl">Deal title</span><input class="input" name="title" maxlength="60" value="${esc(v('title', ''))}" required></label>
      <label class="field"><span class="lbl">Details (optional)</span><textarea class="input" name="description" maxlength="240">${esc(v('description', ''))}</textarea></label>
      <div class="grid2">
        <label class="field"><span class="lbl">Type</span><select class="input" name="type" id="dtype">${opt('percent', '% off')}${opt('amount', '$ off')}${opt('bogo', 'Buy one, get one', true)}${opt('freeitem', 'Free item', true)}${opt('bundle', 'Bundle price', true)}</select></label>
        <label class="field" id="valBox"><span class="lbl" id="valLbl">Percent off</span><input class="input" name="value" type="number" min="1" max="500" step="1" value="${esc(v('value', 15))}"></label>
      </div>
      <label class="field" id="itemBox"><span class="lbl">What does the customer get?</span><input class="input" name="itemText" maxlength="80" value="${esc(v('itemText', ''))}" placeholder="e.g. Free garlic knots with any pizza"></label>
      <div class="grid2">
        <label class="field"><span class="lbl">Starts</span><input class="input" type="date" name="start" value="${dateInput(started ? d.startsAt : Math.max(now, d ? d.startsAt : now))}" ${started ? 'disabled' : `min="${dateInput(now)}"`}></label>
        ${pro ? `<label class="field"><span class="lbl">Ends</span><input class="input" type="date" name="end" value="${dateInput(d ? d.endsAt : now + 7 * 864e5)}"></label>` : '<div class="field"><span class="lbl">Runs for</span><div class="input" style="display:flex;align-items:center">7 days</div></div>'}
      </div>
      ${pro ? `<div class="card flat stack"><h3>Pro options</h3>
        <div class="grid2">
          <label class="field"><span class="lbl">Minimum spend ($)</span><input class="input" name="minSpend" type="number" min="0" max="500" value="${esc(v('minSpend', 0))}"></label>
          <label class="field"><span class="lbl">Limit to first (people)</span><input class="input" name="claimCap" type="number" min="0" placeholder="No limit" value="${v('claimCap', 0) || ''}"></label>
        </div>
        <div class="grid2">
          <label class="field"><span class="lbl">Punch card stamps</span><select class="input" name="stamps">${[[1, 'Single use'], [3, '3 visits'], [5, '5 visits'], [10, '10 visits']].map(([n, l]) => `<option value="${n}" ${v('stamps', 1) === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span class="lbl">Pass color</span><input class="input" name="color" type="color" value="${esc(v('color', '#0d9488'))}" style="padding:4px"></label>
        </div>
        <label class="check"><input type="checkbox" id="upOn" ${up ? 'checked' : ''}> Share-to-upgrade (% or $ off only)</label>
        <div class="grid2 ${up ? '' : 'hide'}" id="upBox">
          <label class="field"><span class="lbl">Friends needed</span><select class="input" name="friendsNeeded">${[1, 2, 3].map((n) => `<option ${up && up.friendsNeeded === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="field"><span class="lbl">Upgraded offer</span><input class="input" name="upgradedValue" type="number" min="1" value="${up ? esc(up.upgradedValue) : ''}"></label>
        </div></div>` : `<div class="card flat stack"><b>🔒 Pro options</b><p class="small muted">Buy-one-get-one and free-item deals, custom end dates, minimum spend, claim limits, punch cards, share-to-upgrade, your own logo and pass color.</p><button type="button" class="btn btn-sm" data-upgrade>See Pro</button></div>`}
      <div id="dfErr"></div>
      <div class="row wrap">
        <button type="button" class="btn grow" style="flex:1 1 100%" data-close>Cancel</button>
        ${!d || d.status === 'draft' ? '<button type="submit" class="btn grow" style="flex:1 1 140px" data-pub="0">Save draft</button>' : ''}
        <button type="submit" class="btn btn-primary grow" style="flex:1 1 140px" data-pub="1">${!d || d.status === 'draft' ? (b.status === 'approved' ? 'Save & go live' : 'Save') : 'Save changes'}</button>
      </div>
    </form>`, { wide: true });
  bindUpgrade(el);
  const sync = () => {
    const t = el.querySelector('#dtype').value;
    el.querySelector('#valBox').classList.toggle('hide', t === 'bogo' || t === 'freeitem');
    el.querySelector('#valLbl').textContent = t === 'percent' ? 'Percent off' : t === 'amount' ? 'Dollars off' : 'Bundle price ($)';
    el.querySelector('#itemBox').classList.toggle('hide', !['bogo', 'freeitem', 'bundle'].includes(t));
  };
  el.querySelector('#dtype').onchange = sync;
  sync();
  const upOn = el.querySelector('#upOn');
  if (upOn) upOn.onchange = () => el.querySelector('#upBox').classList.toggle('hide', !upOn.checked);
  let wantPublish = false;
  el.querySelectorAll('button[type=submit]').forEach((s) => (s.onclick = () => { wantPublish = s.dataset.pub === '1'; }));
  el.querySelector('#df').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const body = { title: f.title, description: f.description, type: f.type, value: Number(f.value) || 0, itemText: f.itemText };
    if (!started) body.startsAt = fromDateInput(f.start);
    if (pro) {
      body.endsAt = fromDateInput(f.end, true);
      body.minSpend = Number(f.minSpend) || 0;
      body.claimCap = Number(f.claimCap) || 0;
      body.stamps = Number(f.stamps);
      body.color = f.color;
      body.upgrade = upOn.checked ? { friendsNeeded: Number(f.friendsNeeded), upgradedValue: Number(f.upgradedValue) } : null;
    }
    if (wantPublish && (!d || d.status === 'draft')) body.publish = true;
    guard(e.submitter, async () => {
      try {
        await call('POST', d ? `/api/business/deals/${d.id}/edit` : '/api/business/deals', body);
        closeSheet(true);
        toast(body.publish ? 'Your deal is live!' : 'Saved.');
        await reload(); dashboard();
      } catch (ex) {
        if (ex.data && ex.data.savedAsDraft) { await reload(); }
        el.querySelector('#dfErr').innerHTML = `<div class="err" role="alert">${esc(ex.message)}${ex.data && ex.data.upgrade ? '<br><button type="button" class="link" data-upgrade>See Pro</button>' : ''}${ex.data && ex.data.savedAsDraft ? '<br>Your changes were saved as a draft.' : ''}</div>`;
        bindUpgrade(el);
      }
    });
  };
}

// ---------------------------------------------------------------- reach (Neighborhood Drops + Pass Push)

function vReach(v) {
  const b = biz(), pro = isPro();
  const live = S.me.deals.filter((d) => d.live);
  const used = b.usage.drops, max = b.limits.dropsPerMonth;
  const dealOpts = live.map((d) => `<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('');
  v.innerHTML = `<div class="stack-lg">
    <div class="card stack"><div class="row between"><h2>📍 Neighborhood Drop</h2><span class="badge b-pro">Pro</span></div>
      <p class="muted">Alert opted-in shoppers within a radius of your shop. They tap the alert, then add your deal to their Apple or Google Wallet in one tap. Once it is in their wallet, their phone can show it on the lock screen when they walk near you.</p>
      ${pro ? (live.length ? `<form id="dropForm" class="stack" novalidate>
        <label class="field"><span class="lbl">Deal</span><select class="input" name="dealId">${dealOpts}</select></label>
        <label class="field"><span class="lbl">Radius: <b id="rv">1</b> mile<span id="rs"></span></span><input type="range" name="radius" min="0.5" max="5" step="0.5" value="1" style="width:100%;accent-color:var(--brand)"></label>
        <label class="field"><span class="lbl">Message (10 to 100 characters)</span><input class="input" name="message" maxlength="100" placeholder="Fresh slices, 2 for 1 until 3pm" required></label>
        <div class="small muted">Drops used this month: ${used} of ${max}</div><div id="dropOut"></div>
        <button class="btn btn-primary btn-block" ${used >= max ? 'disabled' : ''}>Send drop</button></form>` : '<div class="note">Publish a deal first. Drops promote one of your live deals.</div>') : upsell('Neighborhood Drops are included with Pro (4 per month).')}</div>
    <div class="card stack"><div class="row between"><h2>📣 Pass Push</h2><span class="badge b-pro">Pro</span></div>
      <p class="muted">Send a short message to everyone who has your pass in their wallet. Good for slow afternoons.</p>
      ${pro ? `<form id="pushForm" class="stack" novalidate><label class="field"><span class="lbl">Message (10 to 100 characters)</span><input class="input" name="message" maxlength="100" placeholder="Slow afternoon: show your pass for a free cookie" required></label><div id="pushOut"></div><button class="btn btn-block">Send to pass holders</button></form>` : upsell('Pass Push is included with Pro.')}</div>
    <div class="card flat"><h3>How reach works</h3><p class="small muted mt">Apple and Google do not let a business put a pass into someone’s wallet without the person adding it. So a drop is a two-step: we alert nearby shoppers who opted in, and they add the pass with one tap. See <code>guides/WALLET_RADIUS_PUSH.md</code> for the full picture.</p></div></div>`;
  bindUpgrade(v);
  const df = v.querySelector('#dropForm');
  if (df) {
    const rs = df.radius;
    rs.oninput = () => { v.querySelector('#rv').textContent = rs.value; };
    df.onsubmit = (e) => {
      e.preventDefault();
      guard(e.submitter, async () => {
        try {
          const r = await call('POST', '/api/business/drop', { dealId: df.dealId.value, radius: Number(rs.value), message: df.message.value });
          v.querySelector('#dropOut').innerHTML = `<div class="okmsg">Sent to ${r.reach} opted-in shopper${r.reach === 1 ? '' : 's'} within ${rs.value} mile${rs.value === '1' ? '' : 's'}.</div>`;
          await reload();
          setTimeout(() => S.tab === 'reach' && dashboard(), 2500);
        } catch (ex) { v.querySelector('#dropOut').innerHTML = `<div class="err">${esc(ex.message)}</div>`; }
      });
    };
  }
  const pf = v.querySelector('#pushForm');
  if (pf) pf.onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => {
      try {
        const r = await call('POST', '/api/business/push', { message: pf.message.value });
        v.querySelector('#pushOut').innerHTML = `<div class="okmsg">Sent to ${r.reach} pass holder${r.reach === 1 ? '' : 's'}.</div>`;
        pf.reset();
      } catch (ex) { v.querySelector('#pushOut').innerHTML = `<div class="err">${esc(ex.message)}</div>`; }
    });
  };
}

// ---------------------------------------------------------------- Loop-In

function vLoop(v) {
  const b = biz(), pro = isPro();
  const mine = S.me.loops;
  const row = (l) => {
    const incoming = l.to.id === b.id;
    return `<div class="card stack"><div class="row between"><b>${incoming ? `${esc(l.from.name)} → you` : `You → ${esc(l.to.name)}`}</b><span class="badge ${l.status === 'active' ? 'b-good' : 'b-warn'}">${l.status === 'active' ? 'Active' : 'Waiting for reply'}</span></div>
      <p class="small">${incoming ? `Customers who redeem “${esc(l.fromDealTitle)}” at ${esc(l.from.name)} get` : `Customers who redeem your “${esc(l.fromDealTitle)}” get`}: <b>${esc(l.rewardText)}</b> at ${esc(incoming ? 'your shop' : l.to.name)}.</p>
      <div class="row">${incoming && l.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-loop="${esc(l.id)}" data-act="accept">Accept</button><button class="btn btn-sm" data-loop="${esc(l.id)}" data-act="decline">Decline</button>` : `<button class="btn btn-sm btn-danger" data-loop="${esc(l.id)}" data-act="end">${l.status === 'pending' ? 'Cancel' : 'End Loop-In'}</button>`}</div></div>`;
  };
  v.innerHTML = `<div class="stack-lg">
    <div class="card stack"><div class="row between"><h2>🔁 Loop In with a neighbor</h2><span class="badge b-pro">Pro</span></div>
      <p class="muted">Team up with another shop. Example: a customer redeems your pizza deal and gets <b>$1 off an ice cream</b> at the shop next door. They show up in each other’s feeds on the shopper Loop tab.</p>
      ${pro ? '<button class="btn btn-primary" id="newLoop">+ Propose a Loop-In</button>' : upsell('Proposing a Loop-In is a Pro feature. You can still accept Loop-Ins that neighbors send you, for free.')}</div>
    <div class="stack">${mine.length ? mine.map(row).join('') : '<div class="empty"><div class="big">🔁</div><p>No Loop-Ins yet.</p></div>'}</div></div>`;
  bindUpgrade(v);
  v.querySelectorAll('[data-loop]').forEach((x) => (x.onclick = () => guard(x, () => loopAction(x.dataset.loop, x.dataset.act))));
  const n = v.querySelector('#newLoop');
  if (n) n.onclick = () => guard(n, loopForm);
}
async function loopForm() {
  const { partners } = await call('GET', '/api/business/partners');
  const deals = S.me.deals.filter((d) => ['live', 'paused', 'draft'].includes(d.status) && !S.me.loops.some((l) => l.from.id === biz().id && l.fromDealTitle === d.title));
  if (!deals.length) return toast('Create a deal first, then loop it with a neighbor.', 'bad');
  if (!partners.length) return toast('No approved neighbor shops to loop with yet.', 'bad');
  const el = openSheet(`<h2>Propose a Loop-In</h2><form id="lf" class="stack-lg mt-lg" novalidate>
    <label class="field"><span class="lbl">Your deal</span><select class="input" name="fromDealId">${deals.map((d) => `<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Neighbor shop</span><select class="input" name="partnerBizId">${partners.map((p) => `<option value="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)} (${esc(catLabel(p.category))})</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">Reward at their shop</span><input class="input" name="rewardText" maxlength="80" placeholder="$1 off any ice cream cone" required><div class="hint">They get a chance to accept before anything goes live.</div></label>
    <div id="lfErr"></div><div class="row"><button type="button" class="btn grow" data-close>Cancel</button><button class="btn btn-primary grow">Send proposal</button></div></form>`);
  el.querySelector('#lf').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    guard(e.submitter, async () => {
      try { await call('POST', '/api/business/loops', f); closeSheet(true); toast('Proposal sent.'); await reload(); dashboard(); }
      catch (ex) { el.querySelector('#lfErr').innerHTML = `<div class="err">${esc(ex.message)}</div>`; }
    });
  };
}

// ---------------------------------------------------------------- insights

async function vInsights(v) {
  v.innerHTML = '<div class="spinner">Loading…</div>';
  let a;
  try { a = await call('GET', '/api/business/analytics'); } catch (e) { return (v.innerHTML = `<div class="err">${esc(e.message)}</div>`); }
  if (S.tab !== 'insights') return;
  const t = a.totals;
  const totals = `<div class="stats"><div class="stat"><b>${t.views}</b><span>Views</span></div><div class="stat"><b>${t.saves}</b><span>Wallet saves</span></div><div class="stat"><b>${t.redemptions}</b><span>Redemptions</span></div><div class="stat"><b>${a.locked ? '—' : money(t.revenue)}</b><span>Est. sales from deals</span></div></div>`;
  if (a.locked) {
    v.innerHTML = `<div class="stack-lg">${totals}
      <div class="locked card"><div class="blur stack"><h2>Full funnel</h2><div class="funnel">${['Views', 'Saves', 'Friend shares', 'Redeemed'].map((l, i) => `<div class="step"><div class="small">${l}</div><div class="bar" style="width:${100 - i * 24}%">${400 - i * 90}</div></div>`).join('')}</div>
        <h2>Neighborhood benchmarks</h2><p>You vs. similar shops nearby…</p><h2>Compare past deals</h2><p>See which deal worked best…</p></div>
        <div class="cta"><span class="badge b-pro">Pro</span><h2>See what works</h2><p class="muted">The full funnel, Neighborhood Benchmarks, and Compare Metrics for your past deals.</p><button class="btn btn-primary" data-upgrade>See Pro</button></div></div></div>`;
    return bindUpgrade(v);
  }
  const max = Math.max(1, t.views);
  const step = (l, n) => `<div class="step"><div class="row between small"><span>${l}</span><span class="muted">${n}</span></div><div class="bar" style="width:${Math.max(6, (n / max) * 100)}%">${n}</div></div>`;
  const bm = a.benchmark;
  const cmp = (mine, theirs, label) => `<div class="stat"><span>${label}</span><b>${pct(mine)}</b><span style="color:${mine >= theirs ? 'var(--good-ink)' : 'var(--bad-ink)'}">${mine >= theirs ? '▲' : '▼'} Neighborhood: ${pct(theirs)}</span></div>`;
  let sortKey = 'startsAt';
  const table = () => {
    const rows = a.deals.slice().sort((x, y) => (sortKey === 'title' ? x.title.localeCompare(y.title) : y[sortKey] - x[sortKey]));
    const maxRate = Math.max(0.01, ...rows.map((r) => r.redeemRate));
    return `<div class="tablewrap"><table class="t cards"><thead><tr><th>Deal</th><th>Ran</th><th>Views</th><th>Saves</th><th>Redeemed</th><th>Redeem rate</th><th>Est. sales</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.best ? 'best' : ''}"><td class="first"><b>${esc(r.title)}</b> ${r.best ? '<span class="badge b-good">⭐ Best</span>' : ''}<div class="small muted">${esc(r.label)} · ${r.past ? 'Past' : 'Running'}</div></td>
        <td data-label="Ran">${esc(fmtDate(r.startsAt))}</td><td data-label="Views">${r.views}</td><td data-label="Saves"><span>${r.saves} <span class="muted small">(${pct(r.saveRate)})</span></span></td>
        <td data-label="Redeemed">${r.redemptions}</td><td data-label="Redeem rate"><div style="min-width:90px"><b>${pct(r.redeemRate)}</b><div class="meter" style="margin-top:4px"><i style="width:${(r.redeemRate / maxRate) * 100}%"></i></div></div></td><td data-label="Est. sales">${money(r.revenue)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  v.innerHTML = `<div class="stack-lg">${totals}
    <div class="card"><h2>Your funnel</h2><div class="funnel mt">${step('Saw your deal', t.views)}${step('Saved to wallet', t.saves)}${step('Friends who saved from a share', t.shares)}${step('Came in and redeemed', t.redemptions)}</div></div>
    <div class="card stack"><h2>Neighborhood benchmarks</h2>
      <p class="small muted">${bm.source === 'platform' ? `Compared with ${bm.sample} similar ${esc(catLabel(biz().category))} shops on LocalHints.` : 'Not enough nearby shops yet, so this uses typical numbers for your category.'}</p>
      <div class="stats">${cmp(a.rates.saveRate, bm.saveRate, 'Save rate')}${cmp(a.rates.redeemRate, bm.redeemRate, 'Redeem rate')}</div></div>
    <div class="card stack"><h2>What to try next</h2><ul style="padding-left:18px;margin:0">${a.insights.map((i) => `<li style="margin:6px 0">${esc(i)}</li>`).join('')}</ul></div>
    <div class="card stack"><div class="row between wrap"><h2>Compare past deals</h2><label class="row small muted">Sort by <select class="input" id="sortBy" style="width:auto;min-height:34px;padding:2px 10px"><option value="startsAt">Newest</option><option value="redeemRate">Redeem rate</option><option value="redemptions">Redeemed</option><option value="revenue">Est. sales</option><option value="saves">Saves</option></select></label></div><div id="cmp">${table()}</div></div></div>`;
  v.querySelector('#sortBy').onchange = (e) => { sortKey = e.target.value; v.querySelector('#cmp').innerHTML = table(); };
}

// ---------------------------------------------------------------- account

function vAccount(v) {
  const b = biz();
  const pro = b.tier === 'pro';
  const pilot = b.pilotEndsAt > Date.now();
  const a = { address: b.address, verified: b.addressVerified, msg: '', placeId: '', lat: b.lat, lng: b.lng };
  const src = logoSrc({ ...b, hasLogo: b.hasLogo });
  v.innerHTML = `<div class="stack-lg">
    <div class="card stack"><h2>Your plan</h2>
      <div class="grid2"><div class="card flat ${!pro ? '' : ''}" style="${!pro ? 'border-color:var(--brand)' : ''}"><b>Free Starter</b><div class="muted small mt">$0</div><ul class="small" style="padding-left:18px;margin:8px 0 0"><li>${LIMITS.free.dealsPerMonth} deals per month</li><li>${LIMITS.free.savesPerMonth} wallet saves per month</li><li>% off and $ off deals</li><li>LocalHints logo on deals</li></ul></div>
        <div class="card flat" style="${pro ? 'border-color:var(--brand)' : ''}"><b>Pro</b><div class="muted small mt">$${PRICE.monthly}/mo or $${PRICE.yearly}/yr (2 months free)</div><ul class="small" style="padding-left:18px;margin:8px 0 0"><li>Unlimited deals and saves</li><li>All deal types, punch cards, share-to-upgrade</li><li>Neighborhood Drops and Pass Push</li><li>Full funnel, benchmarks, compare past deals</li><li>Loop-In with neighbors</li><li>Your own logo on deals</li></ul></div></div>
      ${pilot ? `<div class="okmsg">You are in the pilot: Pro features are free until ${esc(fmtDate(b.pilotEndsAt))}.</div>` : ''}
      <div id="planOut"></div>
      ${pro ? '<button class="btn" id="toFree">Switch to Free</button>' : `<div class="row wrap"><button class="btn btn-primary grow" id="toPro">Upgrade to Pro (monthly)</button><button class="btn grow" id="toProYear">Pro yearly</button></div>${MODE === 'demo' ? '<p class="hint">Demo mode: upgrading is instant and free. Billing (Stripe) comes later.</p>' : ''}`}</div>
    <div class="card stack"><h2>Your logo</h2>
      ${src ? `<div class="row"><div class="avatar" style="width:72px;height:72px"><img src="${esc(src)}" alt="Your logo"></div><div class="small muted">${b.logoShown ? 'Shown on your deals.' : 'Saved, but only shown while you are on Pro.'}</div></div>` : '<p class="muted">Free deals show the LocalHints logo. On Pro, your own logo appears on every deal and pass.</p>'}
      ${pro ? `<div class="row wrap"><label class="btn btn-sm">Upload logo<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" class="hide"></label>${b.hasLogo ? '<button class="btn btn-sm btn-danger" id="logoDel">Remove</button>' : ''}</div><div class="hint">Square images look best. We shrink it to 256 pixels.</div>` : upsell('Uploading your own logo is a Pro feature.')}</div>
    <div class="card stack"><h2>Business profile</h2><form id="pf" class="stack" novalidate>
      <label class="field"><span class="lbl">Business name</span><input class="input" name="name" value="${esc(b.name)}" maxlength="60"></label>
      <label class="field"><span class="lbl">Description</span><input class="input" name="blurb" value="${esc(b.blurb || '')}" maxlength="120"></label>
      <label class="field"><span class="lbl">Icon (emoji)</span><input class="input" name="emoji" value="${esc(b.emoji)}" maxlength="4" style="width:90px"></label>
      <div id="addrBox">${addressBlock(a)}</div>
      <div class="small muted">${b.addressVerified ? '✅ Address verified with Google' : 'Address not verified yet'}</div><div id="pfOut"></div>
      <button class="btn btn-primary">Save profile</button></form></div>
    <div class="card stack"><h2>Account activity</h2>
      <p class="small muted">Signed up ${esc(fmtDate(b.signedUpAt))}${b.approvedAt ? ` · approved ${esc(fmtDate(b.approvedAt))}` : ''} · last sign-in ${esc(ago(b.lastLoginAt))}</p>
      <ul class="timeline">${S.me.events.slice(0, 25).map((e) => `<li><span class="when">${esc(fmtDateTime(e.at))}</span><span><b>${esc(EVENT_LABELS[e.type] || e.type)}</b>${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ''}</span></li>`).join('')}</ul></div>
    <div class="card stack"><h2>Close account</h2><p class="small muted">Ends all your deals and removes your shop from the app. You will need to contact LocalHints to reopen it.</p><button class="btn btn-danger" id="close">Close my account</button></div></div>`;
  bindUpgrade(v);
  bindAddress(v.querySelector('#addrBox'), a);
  const plan = (tier, billing) => (e) => guard(e.currentTarget, async () => {
    const r = await call('POST', '/api/business/tier', { tier, billing });
    if (r.requested) v.querySelector('#planOut').innerHTML = `<div class="okmsg">${esc(r.message)}</div>`;
    else toast(tier === 'pro' ? 'Welcome to Pro!' : 'You are on Free now.');
    await reload();
    if (!r.requested) dashboard();
  });
  const up = v.querySelector('#toPro'); if (up) up.onclick = plan('pro', 'monthly');
  const upy = v.querySelector('#toProYear'); if (upy) upy.onclick = plan('pro', 'yearly');
  const dn = v.querySelector('#toFree'); if (dn) dn.onclick = async (e) => { if (await confirmSheet('Switch to Free?', 'You will lose Pro features like Drops, Loop-In, insights and your logo on deals. Live deals keep running.', 'Switch to Free', true)) plan('free')(e); };
  const lf = v.querySelector('#logoFile');
  if (lf) lf.onchange = () => guard(null, async () => {
    const data = await shrinkImage(lf.files[0]);
    await call('POST', '/api/business/logo', { dataUrl: data });
    toast('Logo saved.'); await reload(); dashboard();
  });
  const ld = v.querySelector('#logoDel');
  if (ld) ld.onclick = () => guard(ld, async () => { await call('POST', '/api/business/logo/remove'); await reload(); dashboard(); });
  v.querySelector('#pf').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    guard(e.submitter, async () => {
      try {
        if (S.health.addressCheck && a.address !== b.address && !a.verified) throw new Error('Please check your new address and tap “Use this address”.');
        const body = { name: f.name, blurb: f.blurb, emoji: f.emoji };
        if (a.address !== b.address) Object.assign(body, { address: a.address, lat: a.lat, lng: a.lng });
        await call('POST', '/api/business/profile', body);
        toast('Profile saved.'); await reload(); dashboard();
      } catch (ex) { v.querySelector('#pfOut').innerHTML = `<div class="err">${esc(ex.message)}</div>`; }
    });
  };
  v.querySelector('#close').onclick = async (e) => {
    if (!(await confirmSheet('Close your account?', 'All your deals will end and your shop will disappear from LocalHints.', 'Close account', true))) return;
    guard(e.currentTarget, async () => { await call('POST', '/api/business/close'); tset(''); S.me = null; S.authMode = 'signin'; authScreen(); toast('Your account was closed.'); });
  };
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Choose an image first.'));
    if (file.size > 6e6) return reject(new Error('That file is too big. Pick one under 6 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256, c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('We could not read that image.')); };
    img.src = url;
  });
}

// ---------------------------------------------------------------- boot

async function boot() {
  registerServiceWorker();
  try { S.health = await api.get('/api/health'); } catch (e) {
    root.innerHTML = `${bar()}<main class="page"><div class="empty"><div class="big">📡</div><p>${esc(e.message)}</p></div></main>`;
    return;
  }
  if (S.token) {
    try { await reload(); return dashboard(); } catch { tset(''); }
  }
  authScreen();
}
boot();
