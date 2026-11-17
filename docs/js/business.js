/* Merchant side (business.html): sign up, sign in, deals, reach, Loop-In, insights, account. */
import { api, MODE, ApiError, logoSrc } from './api.js';
import { CATEGORIES, EVENT_LABELS, LIMITS, PILOT, PRICE, DEMO_CENTER, UNLIMITED } from './engine.js';
import { DEMO_LOGINS, DEMO_PASSWORD } from './seed.js';
import {
  esc, toast, openSheet, closeSheet, confirmSheet, guard, fmtDate, fmtDateTime, ago, pct, money, dateInput, fromDateInput,
  getBrowserLocation, registerServiceWorker, avatar, catLabel, timeLeft, qrSvg, installButtonHtml, settingsButtonHtml, bindChrome,
} from './ui.js';
import { initNav, navigate, replaceScreen } from './nav.js';
import { lineChart, pairBars } from './charts.js';
import { mountRedeem } from './redeem-ui.js';

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
    <header class="topbar"><div class="topbar-in"><a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints <span class="badge b-brand">Business</span></a><span class="grow"></span>${installButtonHtml()}${settingsButtonHtml()}${right}</div></header>`;
}
const chrome = () => bindChrome(root, 'LocalHints Business');
const goTab = (tab) => navigate({ tab });

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
      ${signup ? '' : '<p class="center"><button type="button" class="link" id="forgot">Forgot your password?</button></p>'}
    </form>
    ${!signup && MODE === 'demo' ? `<div class="card flat stack"><h3>Demo accounts</h3><p class="small muted">Password for all: <b>${esc(DEMO_PASSWORD)}</b></p>
      ${DEMO_LOGINS.map((d) => `<button type="button" class="btn btn-sm" data-demo="${esc(d.email)}" style="justify-content:flex-start;text-align:left"><span><b>${esc(d.email)}</b><br><span class="small muted">${esc(d.note)}</span></span></button>`).join('')}</div>` : ''}
  </div></main>`;
  chrome();
  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => navigate({ auth: b.dataset.mode })));
  const fg = root.querySelector('#forgot');
  if (fg) fg.onclick = () => forgotSheet(root.querySelector('#authForm').email.value);
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
        replaceScreen({ tab: 'overview' });
        dashboard();
        toast(signup ? 'Welcome! Your account is ready.' : 'Signed in.');
      } catch (ex) {
        err.innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`;
      }
    });
  };
}

// ---------------------------------------------------------------- forgot / reset password

function forgotSheet(email) {
  const el = openSheet(`<h2>Reset your password</h2><p class="muted mt">Enter your account email. We will send a link to choose a new password.</p>
    <form id="ff" class="stack mt-lg" novalidate><label class="field"><span class="lbl">Email</span><input class="input" name="email" type="email" autocomplete="email" value="${esc(email || '')}" required></label>
      <div id="fo"></div><button class="btn btn-primary btn-block">Email me a link</button></form>`);
  el.querySelector('#ff').onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => {
      try {
        const r = await api.post('/api/business/forgot', { email: e.target.email.value });
        el.querySelector('#fo').innerHTML = `<div class="okmsg" role="status">${esc(r.message)}</div>${r.demoLink ? `<a class="btn btn-block mt" href="${esc(r.demoLink)}">Open the reset link</a>` : ''}`;
      } catch (ex) { el.querySelector('#fo').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
  };
}
function resetScreen(tok) {
  root.innerHTML = `${bar()}<main class="page"><div class="narrow stack-lg"><div class="hero"><h1>Choose a new password</h1><p class="muted">At least 8 characters, with a letter and a number.</p></div>
    <form id="rf" class="card stack" novalidate>
      <label class="field"><span class="lbl">New password</span><input class="input" name="password" type="password" autocomplete="new-password" required></label>
      <label class="field"><span class="lbl">Type it again</span><input class="input" name="again" type="password" autocomplete="new-password" required></label>
      <div id="re"></div><button class="btn btn-primary btn-block">Save new password</button></form></div></main>`;
  chrome();
  root.querySelector('#rf').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.again.value) return (root.querySelector('#re').innerHTML = '<div class="err" role="alert">The two passwords are different.</div>');
    guard(e.submitter, async () => {
      try {
        await api.post('/api/business/reset', { token: tok, password: f.password.value });
        history.replaceState({ lh: 1, auth: 'signin' }, '', 'business.html');
        S.authMode = 'signin';
        authScreen();
        toast('Password changed. Sign in with your new password.');
      } catch (ex) { root.querySelector('#re').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
  };
}

// ---------------------------------------------------------------- dashboard shell

const TABS = [['overview', 'Overview'], ['deals', 'Deals'], ['team', 'Team'], ['reach', 'Reach'], ['loop', 'Loop-In'], ['insights', 'Insights'], ['account', 'Account']];
function dashboard() {
  const b = biz();
  root.innerHTML = `${bar(`<span class="small muted only-desktop">${esc(b.name)}</span><button class="btn btn-sm" id="out">Sign out</button>`)}
    <main class="page">
      <div class="row wrap between"><div class="row">${avatar(b, 44)}<div><h1 style="font-size:22px">${esc(b.name)}</h1>
        <div class="row wrap" style="gap:6px;margin-top:4px">${statusBadge(b.status)}${planBadge(b)}</div></div></div></div>
      <div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" aria-selected="${S.tab === id}" data-tab="${id}">${l}${id === 'loop' && pendingIncoming().length ? ' •' : ''}</button>`).join('')}</div>
      <div id="view"></div></main>`;
  chrome();
  root.querySelector('#out').onclick = () => { tset(''); S.me = null; S.authMode = 'signin'; replaceScreen({ auth: 'signin' }); authScreen(); };
  root.querySelectorAll('[data-tab]').forEach((t) => (t.onclick = () => { if (S.tab === t.dataset.tab) return; goTab(t.dataset.tab); }));
  ({ overview: vOverview, deals: vDeals, team: vTeam, reach: vReach, loop: vLoop, insights: vInsights, account: vAccount })[S.tab](root.querySelector('#view'));
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
  scope.querySelectorAll('[data-upgrade]').forEach((b) => (b.onclick = () => goTab('account')));
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
    <div class="card stack"><h2>Redeem a pass</h2><p class="muted small">Enter the customer’s pass code and what they are buying. We work out the price after the deal and record both, so your results are real. Your team can do this too: see the <b>Team</b> tab.</p>
      <div id="redeemBox"></div></div>
  </div>`;
  v.querySelectorAll('[data-edit]').forEach((x) => (x.onclick = () => dealForm(S.me.deals.find((d) => d.id === x.dataset.edit))));
  v.querySelectorAll('[data-pub]').forEach((x) => (x.onclick = () => guard(x, () => publishNow(x.dataset.pub))));
  v.querySelectorAll('[data-loop]').forEach((x) => (x.onclick = () => guard(x, () => loopAction(x.dataset.loop, x.dataset.act))));
  mountRedeem(v.querySelector('#redeemBox'), { locations: b.locations, send: (body) => call('POST', '/api/business/redeem', body), onDone: () => { reload(); } });
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

// ---------------------------------------------------------------- team (staff / clerks) + how redemption works

const METHOD = { qr: 'QR code', sms: 'Text message', email: 'Email' };
const STAFF_BADGE = { invited: 'b-warn', accepted: 'b-good', suspended: 'b-bad' };
const dollars = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const absUrl = (path) => new URL(path, location.href).href;

async function vTeam(v) {
  v.innerHTML = '<div class="spinner">Loading…</div>';
  let t;
  try { t = await call('GET', '/api/business/staff'); } catch (e) { return (v.innerHTML = `<div class="err">${esc(e.message)}</div>`); }
  if (S.tab !== 'team') return;
  const b = biz();
  const rows = t.staff;
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0) + t.owner[k];
  const multi = t.locations.length > 1;
  v.innerHTML = `<div class="stack-lg">
    <div class="card stack"><h2>How passes get redeemed</h2>
      <ul class="small" style="padding-left:18px;margin:0">
        <li><b>You (the owner):</b> enter the pass code and the purchase total on the Overview tab. It is logged under “Owner”.</li>
        <li><b>Your team:</b> invite each person below. They get their own page (no password) with just the redeem form, and every redemption is logged under their name, so you can see who rang up what.</li>
        <li><b>Nobody redeems, nothing counts.</b> Customers cannot mark their own pass used, so the numbers in Insights stay honest. Every redemption needs the code <i>and</i> the purchase total, so we can show the price before and after the deal.</li>
      </ul>
      <p class="small muted">Tip: invite in person with the QR code (the person scans it with their phone camera). It is the safest, because the link never travels through a text or email that someone else could open first. Text and email invites work too, and each link works once and expires in 7 days.</p></div>
    <div class="card stack"><div class="row between wrap"><h2>Your team</h2><span class="small muted">${t.used} of ${t.limit} team members${effectiveTierFree() ? ' on Free' : ''}</span></div>
      <button class="btn btn-primary" id="inv" ${b.status === 'approved' ? '' : 'disabled'}>+ Invite a team member</button>
      ${b.status === 'approved' ? '' : '<p class="hint">You can invite people once your account is approved.</p>'}
      <div class="tablewrap"><table class="t cards"><thead><tr><th>Team member</th><th>Invited by</th><th>Status</th><th>Redeemed</th><th>Purchases before deals</th><th>After deals (calculated)</th><th></th></tr></thead><tbody>
      <tr><td class="first"><b>You (owner)</b></td><td data-label="Invited by">—</td><td data-label="Status"><span class="badge b-good">Owner</span></td><td data-label="Redeemed">${t.owner.redemptions}</td><td data-label="Before">${dollars(t.owner.before)}</td><td data-label="After">${dollars(t.owner.after)}</td><td></td></tr>
      ${rows.map((r) => `<tr><td class="first"><b>${esc(r.name)}</b>${multi ? `<div class="small muted">${esc(r.locationName)}</div>` : ''}</td>
        <td data-label="Invited by"><b>${esc(METHOD[r.method])}</b>${r.contact ? `<div class="small muted">${esc(r.contact)}</div>` : ''}</td>
        <td data-label="Status"><span class="badge ${STAFF_BADGE[r.status]}">${r.status[0].toUpperCase() + r.status.slice(1)}</span>${r.status === 'invited' && !r.inviteOpen ? '<div class="tiny muted">link expired</div>' : ''}</td>
        <td data-label="Redeemed">${r.redemptions}</td><td data-label="Before">${dollars(r.before)}</td><td data-label="After">${dollars(r.after)}</td>
        <td><div class="row wrap" style="justify-content:flex-end">${r.status === 'invited' ? `<button class="btn btn-sm" data-sa="reinvite" data-sid="${esc(r.id)}">Show link / QR</button>` : ''}${r.status === 'accepted' ? `<button class="btn btn-sm" data-sa="suspend" data-sid="${esc(r.id)}">Suspend</button>` : ''}${r.status === 'suspended' ? `<button class="btn btn-sm btn-primary" data-sa="reinstate" data-sid="${esc(r.id)}">Reinstate</button>` : ''}<button class="btn btn-sm btn-danger" data-sa="remove" data-sid="${esc(r.id)}">Remove</button></div></td></tr>`).join('')}
      <tr><td class="first"><b>Everyone</b></td><td></td><td></td><td data-label="Redeemed"><b>${sum('redemptions')}</b></td><td data-label="Before"><b>${dollars(sum('before'))}</b></td><td data-label="After"><b>${dollars(sum('after'))}</b></td><td></td></tr>
      </tbody></table></div>
      <p class="hint">“After deals” is the price the customer paid once the deal was applied. For % off, $ off and bundle deals it is calculated exactly; for buy-one-get-one and free-item deals it is an estimate unless the amount charged was entered.</p></div></div>`;
  v.querySelector('#inv').onclick = () => inviteForm(t);
  v.querySelectorAll('[data-sa]').forEach((x) => (x.onclick = () => guard(x, async () => {
    const a = x.dataset.sa;
    if (a === 'remove' && !(await confirmSheet('Remove this team member?', 'They will not be able to redeem passes any more. Their past redemptions stay in your numbers.', 'Remove', true))) return;
    const r = await call('POST', `/api/business/staff/${x.dataset.sid}`, { action: a });
    if (a === 'reinvite') return showInvite(r);
    toast('Done.');
    vTeam(v);
  })));
}
const effectiveTierFree = () => !isPro();

function inviteForm(t) {
  const el = openSheet(`<h2>Invite a team member</h2><p class="muted mt">They get a link that opens the redeem page on their phone. No password needed.</p>
    <form id="sf" class="stack-lg mt-lg" novalidate>
      <label class="field"><span class="lbl">Name</span><input class="input" name="name" maxlength="60" required></label>
      <label class="field"><span class="lbl">How do you want to invite them?</span><select class="input" name="method"><option value="qr">QR code (in person, recommended)</option><option value="sms">Text message</option><option value="email">Email</option></select></label>
      <label class="field hide" id="cBox"><span class="lbl" id="cLbl">Mobile number</span><input class="input" name="contact" maxlength="120"></label>
      ${t.locations.length > 1 ? `<label class="field"><span class="lbl">Works at</span><select class="input" name="locationId">${t.locations.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label>` : ''}
      <div id="sfErr"></div>
      <div class="row"><button type="button" class="btn grow" data-close>Cancel</button><button class="btn btn-primary grow">Create invite</button></div></form>`);
  const f = el.querySelector('#sf');
  const sync = () => {
    const m = f.method.value;
    el.querySelector('#cBox').classList.toggle('hide', m === 'qr');
    el.querySelector('#cLbl').textContent = m === 'sms' ? 'Mobile number' : 'Email address';
    f.contact.type = m === 'email' ? 'email' : 'tel';
  };
  f.method.onchange = sync;
  sync();
  f.onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => {
      try {
        const r = await call('POST', '/api/business/staff', Object.fromEntries(new FormData(f)));
        await showInvite(r);
      } catch (ex) { el.querySelector('#sfErr').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
  };
}

async function showInvite(r) {
  const st = r.staff;
  const url = r.inviteUrl || absUrl(r.invitePath);
  const text = `Hi ${st.name}, ${r.businessName} invited you to redeem LocalHints deals. Open this link on your phone (works once, valid 7 days): ${url}`;
  const el = openSheet(`<h2>Invite for ${esc(st.name)}</h2>
    ${r.emailed ? `<div class="okmsg mt">We emailed the link to ${esc(st.contact)}.</div>` : ''}
    <p class="muted mt">${st.method === 'qr' ? 'Have them scan this with their phone camera.' : 'You can still use the QR code if they are standing next to you.'}</p>
    <div class="qrbox mt" id="iq"></div>
    <div class="row mt-lg"><input class="input grow" readonly value="${esc(url)}" id="iu" aria-label="Invite link"><button class="btn btn-sm" id="ic">Copy</button></div>
    <div class="row wrap mt">
      ${st.method === 'sms' ? `<a class="btn btn-primary grow" href="sms:${esc(st.contact)}?&body=${encodeURIComponent(text)}">Send text message</a>` : ''}
      ${st.method === 'email' && !r.emailed ? `<a class="btn btn-primary grow" href="mailto:${esc(st.contact)}?subject=${encodeURIComponent(r.businessName + ' invited you to LocalHints')}&body=${encodeURIComponent(text)}">Open email</a>` : ''}
      <button class="btn grow" data-close>Done</button></div>
    <p class="hint">The link works one time. When ${esc(st.name)} accepts, the status changes to Accepted.</p>`);
  qrSvg(url).then((svg) => { const q = el.querySelector('#iq'); if (q) q.innerHTML = svg; });
  el.querySelector('#ic').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { el.querySelector('#iu').select(); } };
  if (S.tab === 'team') { try { vTeam(root.querySelector('#view')); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------- insights

const fmtMoney0 = (n) => '$' + Math.round(n).toLocaleString('en-US');
const METRICS = { saves: ['Wallet saves', (n) => String(Math.round(n))], redemptions: ['Redeemed', (n) => String(Math.round(n))], sales: ['Sales after the deal ($)', fmtMoney0] };
const view = { mode: 'deals', metric: 'redemptions', picked: null };

async function vInsights(v) {
  v.innerHTML = '<div class="spinner">Loading…</div>';
  let a;
  try { a = await call('GET', '/api/business/analytics'); } catch (e) { return (v.innerHTML = `<div class="err">${esc(e.message)}</div>`); }
  if (S.tab !== 'insights') return;
  const t = a.totals;
  const basic = `<div class="stat"><b>${t.views}</b><span>Views</span></div><div class="stat"><b>${t.saves}</b><span>Wallet saves</span></div><div class="stat"><b>${t.redemptions}</b><span>Redemptions</span></div>`;
  if (a.locked) {
    v.innerHTML = `<div class="stack-lg"><div class="stats">${basic}<div class="stat"><b>—</b><span>Sales from deals</span></div></div>
      <div class="locked card"><div class="blur stack"><h2>Results over time</h2><div class="funnel">${['Views', 'Saves', 'Friend shares', 'Redeemed'].map((l, i) => `<div class="step"><div class="small">${l}</div><div class="bar" style="width:${100 - i * 24}%">${400 - i * 90}</div></div>`).join('')}</div>
        <h2>Charts for each deal and location</h2><p>See which deal worked best…</p><h2>Neighborhood benchmarks</h2><p>You vs. similar shops nearby…</p></div>
        <div class="cta"><span class="badge b-pro">Pro</span><h2>See what works</h2><p class="muted">Graphs for every deal and location, the full funnel, Neighborhood Benchmarks, and Compare Metrics.</p><button class="btn btn-primary" data-upgrade>See Pro</button></div></div></div>`;
    return bindUpgrade(v);
  }
  const max = Math.max(1, t.views);
  const step = (l, n) => `<div class="step"><div class="row between small"><span>${l}</span><span class="muted">${n}</span></div><div class="bar" style="width:${Math.max(6, (n / max) * 100)}%">${n}</div></div>`;
  const bm = a.benchmark;
  const cmp = (mine, theirs, label) => `<div class="stat"><span>${label}</span><b>${pct(mine)}</b><span style="color:${mine >= theirs ? 'var(--good-ink)' : 'var(--bad-ink)'}">${mine >= theirs ? '▲' : '▼'} Neighborhood: ${pct(theirs)}</span></div>`;
  const hasLocs = a.locations.length > 1;
  if (!hasLocs && view.mode === 'locations') view.mode = 'deals';
  let sortKey = 'startsAt';
  const table = () => {
    const rows = a.deals.slice().sort((x, y) => (sortKey === 'title' ? x.title.localeCompare(y.title) : y[sortKey] - x[sortKey]));
    const maxRate = Math.max(0.01, ...rows.map((r) => r.redeemRate));
    return `<div class="tablewrap"><table class="t cards"><thead><tr><th>Deal</th><th>Ran</th><th>Views</th><th>Saves</th><th>Redeemed</th><th>Redeem rate</th><th>Sales after deal</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="clickable ${r.best ? 'best' : ''}" data-deal="${esc(r.id)}"><td class="first"><b>${esc(r.title)}</b> ${r.best ? '<span class="badge b-good">⭐ Best</span>' : ''}<div class="small muted">${esc(r.label)} · ${r.past ? 'Past' : 'Running'} · tap for graph</div></td>
        <td data-label="Ran">${esc(fmtDate(r.startsAt))}</td><td data-label="Views">${r.views}</td><td data-label="Saves"><span>${r.saves} <span class="muted small">(${pct(r.saveRate)})</span></span></td>
        <td data-label="Redeemed">${r.redemptions}</td><td data-label="Redeem rate"><div style="min-width:90px"><b>${pct(r.redeemRate)}</b><div class="meter" style="margin-top:4px"><i style="width:${(r.redeemRate / maxRate) * 100}%"></i></div></div></td><td data-label="Sales after deal">${money(r.revenue)}${r.revenueEstimated ? ' <span class="muted small">(est.)</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  };
  v.innerHTML = `<div class="stack-lg">
    <div class="stats six">${basic}<div class="stat"><b>${money(t.before)}</b><span>Purchases before deals</span></div><div class="stat"><b>${money(t.after)}</b><span>After deals (calculated)</span></div><div class="stat"><b>${money(Math.max(0, t.before - t.after))}</b><span>Discounts given</span></div></div>
    <div class="card stack"><div class="row between wrap"><h2>Results over time</h2>
        <div class="seg" role="tablist" style="min-width:240px"><button role="tab" data-mode="deals" aria-selected="${view.mode === 'deals'}">Deals</button><button role="tab" data-mode="locations" aria-selected="${view.mode === 'locations'}" ${hasLocs ? '' : 'title="Add a second location in Account"'}>Locations</button></div></div>
      <label class="row small muted">Measure <select class="input" id="metric" style="width:auto;min-height:34px;padding:2px 10px">${Object.entries(METRICS).filter(([k]) => view.mode === 'deals' || k !== 'saves').map(([k, [l]]) => `<option value="${k}" ${view.metric === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span>· last 30 days</span></label>
      <div id="chips" class="chips" aria-label="Choose what to compare"></div><div id="plot"></div><div id="extra"></div>
      ${!hasLocs ? '<p class="hint">Run more than one shop? Pro lets you add locations in the Account tab, then compare them here.</p>' : ''}</div>
    <div class="card"><h2>Your funnel</h2><div class="funnel mt">${step('Saw your deal', t.views)}${step('Saved to wallet', t.saves)}${step('Friends who saved from a share', t.shares)}${step('Came in and redeemed', t.redemptions)}</div></div>
    <div class="card stack"><h2>Neighborhood benchmarks</h2>
      <p class="small muted">${bm.source === 'platform' ? `Compared with ${bm.sample} similar ${esc(catLabel(biz().category))} shops on LocalHints.` : 'Not enough nearby shops yet, so this uses typical numbers for your category.'}</p>
      <div class="stats">${cmp(a.rates.saveRate, bm.saveRate, 'Save rate')}${cmp(a.rates.redeemRate, bm.redeemRate, 'Redeem rate')}</div></div>
    <div class="card stack"><h2>What to try next</h2><ul style="padding-left:18px;margin:0" id="tips">${a.insights.map((i) => `<li style="margin:6px 0">${esc(i)}</li>`).join('')}</ul>
      <div id="aiOut"></div>
      <button class="btn btn-sm" id="ai">✨ Get fresh ideas</button>
      <p class="hint" id="aiNote">${a.aiAvailable ? 'Ideas are written by Claude from your totals only (no customer details leave LocalHints).' : 'These tips come from simple rules. When the server has an Anthropic key, this button asks Claude for fresh ideas.'}</p></div>
    <div class="card stack"><div class="row between wrap"><h2>Compare past deals</h2><label class="row small muted">Sort by <select class="input" id="sortBy" style="width:auto;min-height:34px;padding:2px 10px"><option value="startsAt">Newest</option><option value="redeemRate">Redeem rate</option><option value="redemptions">Redeemed</option><option value="revenue">Sales after deal</option><option value="saves">Saves</option></select></label></div><div id="cmp">${table()}</div></div></div>`;

  const bindTable = () => v.querySelectorAll('[data-deal]').forEach((tr) => (tr.onclick = () => dealSheet(a, a.deals.find((d) => d.id === tr.dataset.deal))));
  bindTable();
  v.querySelector('#sortBy').onchange = (e) => { sortKey = e.target.value; v.querySelector('#cmp').innerHTML = table(); bindTable(); };
  v.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { if (b.dataset.mode === 'locations' && !hasLocs) return toast('Add a second location in the Account tab first.', 'bad'); view.mode = b.dataset.mode; if (view.mode === 'locations' && view.metric === 'saves') view.metric = 'redemptions'; vInsights(v); }));
  v.querySelector('#metric').onchange = (e) => { view.metric = e.target.value; drawMain(); };

  // items to compare: deals or locations; each keeps its own color slot so colors never change when you toggle others
  const items = () => (view.mode === 'deals'
    ? a.deals.map((d, i) => ({ id: d.id, name: d.title, slot: (i % 5) + 1, values: (k) => a.series.perDeal[d.id][k] }))
    : a.locations.map((l, i) => ({ id: l.id, name: l.name, slot: (i % 5) + 1, values: (k) => a.series.perLocation[l.id][k === 'saves' ? 'redemptions' : k] })));
  const activity = (it, k) => it.values(k).reduce((x, y) => x + y, 0);
  function drawMain() {
    const all = items();
    const key = `${view.mode}`;
    if (!view.picked || view.picked.key !== key || !view.picked.ids.every((id) => all.some((x) => x.id === id))) {
      view.picked = { key, ids: all.slice().sort((x, y) => activity(y, view.metric) - activity(x, view.metric)).filter((x) => activity(x, view.metric) > 0).slice(0, 4).map((x) => x.id) };
      if (!view.picked.ids.length) view.picked.ids = all.slice(0, 2).map((x) => x.id);
    }
    const chosen = all.filter((x) => view.picked.ids.includes(x.id));
    const usedSlots = new Set(chosen.map((x) => x.slot));
    v.querySelector('#chips').innerHTML = all.map((x) => {
      const on = view.picked.ids.includes(x.id);
      const blocked = !on && (usedSlots.has(x.slot) || chosen.length >= 5);
      return `<button class="chip" aria-pressed="${on}" data-pick="${esc(x.id)}" ${blocked ? 'disabled title="Up to 5 at a time, each in its own color"' : ''}>${esc(x.name)}</button>`;
    }).join('');
    v.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { const id = b.dataset.pick; const ids = view.picked.ids; view.picked.ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; drawMain(); }));
    const [label, fmt] = METRICS[view.metric];
    const host = v.querySelector('#plot');
    host.innerHTML = '';
    if (!chosen.length) host.innerHTML = '<p class="hint">Pick at least one above.</p>';
    else lineChart(host, { days: a.series.days, label: `${label} per day`, fmt, series: chosen.map((x) => ({ id: x.id, name: x.name, color: x.slot, values: x.values(view.metric) })) });
    const extra = v.querySelector('#extra');
    if (view.mode === 'locations') {
      const L = a.locations.map((l) => a.series.perLocation[l.id]);
      extra.innerHTML = '<h3 class="mt-lg">Purchases before and after deals, by location (all time)</h3><div id="pb" class="mt"></div>';
      pairBars(extra.querySelector('#pb'), { rows: L.map((l) => ({ label: l.name, a: l.before, b: l.after })), aName: 'Before the deal', bName: 'After the deal', fmt: (n) => dollars(n) });
    } else extra.innerHTML = '';
  }
  drawMain();

  const ai = v.querySelector('#ai');
  ai.onclick = () => guard(ai, async () => {
    const r = await call('POST', '/api/business/advice', { refresh: true });
    v.querySelector('#aiOut').innerHTML = `<div class="card flat stack"><b>${r.source === 'ai' ? '✨ Ideas from Claude' : 'Ideas from your numbers'}</b><ul style="padding-left:18px;margin:0">${r.tips.map((x) => `<li style="margin:6px 0">${esc(x)}</li>`).join('')}</ul></div>`;
    if (r.source !== 'ai') v.querySelector('#aiNote').textContent = 'AI ideas are not turned on for this server yet, so these come from simple rules.';
  });
}

function dealSheet(a, r) {
  if (!r) return;
  const sr = a.series.perDeal[r.id];
  const el = openSheet(`<h2>${esc(r.title)}</h2><div class="small muted">${esc(r.label)} · ${esc(fmtDate(r.startsAt))} to ${esc(fmtDate(r.endsAt))} · ${r.past ? 'Past' : 'Running'}</div>
    <div class="stats mt-lg"><div class="stat"><b>${r.views}</b><span>Views</span></div><div class="stat"><b>${r.saves}</b><span>Saves</span></div><div class="stat"><b>${r.redemptions}</b><span>Redeemed (${pct(r.redeemRate)})</span></div><div class="stat"><b>${money(r.after)}</b><span>Sales after deal${r.revenueEstimated ? ' (est.)' : ''}</span></div></div>
    <p class="small muted mt">Purchases before the deal: <b>${dollars(r.before)}</b> · after the deal: <b>${dollars(r.after)}</b></p>
    <h3 class="section-title">Saves and redemptions per day (last 30 days)</h3><div id="c1"></div>
    <h3 class="section-title">Sales after the deal ($ per day)</h3><div id="c2"></div>
    <button class="btn btn-block mt-lg" data-close>Close</button>`, { wide: true });
  lineChart(el.querySelector('#c1'), { days: a.series.days, label: 'Saves and redemptions per day', fmt: (n) => String(Math.round(n)), series: [{ id: 's', name: 'Saved', color: 1, values: sr.saves }, { id: 'r', name: 'Redeemed', color: 2, values: sr.redemptions }] });
  lineChart(el.querySelector('#c2'), { days: a.series.days, label: 'Sales after the deal per day', fmt: fmtMoney0, series: [{ id: 'd', name: 'Sales after deal', color: 3, values: sr.sales }] });
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
    <div class="card stack"><div class="row between"><h2>Locations</h2><span class="badge b-pro">Pro</span></div>
      <p class="muted small">Have more than one shop? Add each location so shoppers see every pin, and compare locations in Insights.</p>
      <ul class="timeline">${b.locations.map((l) => `<li><span class="grow"><b>${esc(l.name)}</b><br><span class="muted small">${esc(l.address)}</span></span>${l.id === 'main' ? '<span class="badge">Main</span>' : `<button class="btn btn-sm btn-danger" data-locdel="${esc(l.id)}">Remove</button>`}</li>`).join('')}</ul>
      ${b.effectiveTier === 'pro' ? '<button class="btn btn-sm" id="locAdd">+ Add a location</button>' : upsell('Multiple locations are a Pro feature (up to ' + LIMITS.pro.locations + ').')}</div>
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
  v.querySelectorAll('[data-locdel]').forEach((x) => (x.onclick = () => guard(x, async () => {
    if (!(await confirmSheet('Remove this location?', 'Its pin disappears from the map. Past results stay in your numbers.', 'Remove', true))) return;
    await call('POST', `/api/business/locations/${x.dataset.locdel}/remove`);
    await reload(); dashboard();
  })));
  const la = v.querySelector('#locAdd');
  if (la) la.onclick = () => locationForm();
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
    guard(e.currentTarget, async () => { await call('POST', '/api/business/close'); tset(''); S.me = null; S.authMode = 'signin'; replaceScreen({ auth: 'signin' }); authScreen(); toast('Your account was closed.'); });
  };
}

function locationForm() {
  const a = { address: '', verified: false, msg: '', placeId: '', ...jitterDemo() };
  const el = openSheet(`<h2>Add a location</h2><form id="lf" class="stack-lg mt-lg" novalidate>
    <label class="field"><span class="lbl">Name</span><input class="input" name="name" maxlength="60" placeholder="Downtown" required></label>
    <div id="addrBox">${addressBlock(a)}</div><div id="lfErr"></div>
    <div class="row"><button type="button" class="btn grow" data-close>Cancel</button><button class="btn btn-primary grow">Add location</button></div></form>`);
  bindAddress(el.querySelector('#addrBox'), a);
  el.querySelector('#lf').onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => {
      try {
        if (S.health.addressCheck && !a.verified) throw new Error('Please check the address and tap “Use this address”.');
        await call('POST', '/api/business/locations', { name: e.target.name.value, address: a.address, lat: a.lat, lng: a.lng });
        closeSheet(true); toast('Location added.'); await reload(); dashboard();
      } catch (ex) { el.querySelector('#lfErr').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
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
  const params = new URLSearchParams(location.search);
  const resetTok = params.get('reset');
  initNav(S.token ? { tab: 'overview' } : { auth: S.authMode }, (st) => {
    if (S.me) { S.tab = st.tab || 'overview'; dashboard(); } else { S.authMode = st.auth || 'signin'; authScreen(); }
  });
  try { S.health = await api.get('/api/health'); } catch (e) {
    root.innerHTML = `${bar()}<main class="page"><div class="empty"><div class="big">📡</div><p>${esc(e.message)}</p></div></main>`;
    return chrome();
  }
  if (resetTok) return resetScreen(resetTok);
  if (S.token) {
    try { await reload(); return dashboard(); } catch { tset(''); }
  }
  authScreen();
}
boot();
