/* Admin side (admin.html): counts, search and manage businesses, live deals, activity log, pilot, moderation, settings. */
import { api, MODE, ApiError } from './api.js';
import { CATEGORIES, EVENT_LABELS } from './engine.js';
import {
  esc, toast, openSheet, closeSheet, confirmSheet, guard, fmtDate, fmtDateTime, ago, catLabel, registerServiceWorker,
  installButtonHtml, settingsButtonHtml, bindChrome,
} from './ui.js';
import { initNav, navigate, replaceScreen } from './nav.js';

const root = document.getElementById('app');
const S = {
  token: sessionStorage.getItem('lh:admin-token') || '', tab: 'businesses', me: null, stats: null, f: { sort: 'signup' }, rows: [], total: 0,
  preset: '', biz: '', tipFilter: '',
};
const chrome = () => bindChrome(root, 'LocalHints Admin');

async function call(method, path, body) {
  try {
    return method === 'GET' ? await api.get(path, body, S.token) : await api.post(path, body, S.token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && S.token) { signOut(); }
    throw e;
  }
}
function signOut() {
  S.token = '';
  sessionStorage.removeItem('lh:admin-token');
  replaceScreen({ login: 1 });
  loginScreen();
}

// ---------------------------------------------------------------- login, forgot and reset password

function loginScreen() {
  root.innerHTML = `<header class="topbar"><div class="topbar-in"><a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints <span class="badge">Admin</span></a><span class="grow"></span>${installButtonHtml()}${settingsButtonHtml()}</div></header>
    <main class="page"><div class="narrow stack-lg"><div class="hero"><h1>Admin sign in</h1><p class="muted">For LocalHints staff only.</p></div>
      <form id="lf" class="card stack" novalidate>
        <label class="field"><span class="lbl">Username</span><input class="input" name="username" autocomplete="username" required></label>
        <label class="field"><span class="lbl">Password</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <div id="err"></div><button class="btn btn-primary btn-block">Sign in</button>
        <p class="center"><button type="button" class="link" id="forgot">Forgot your password?</button></p></form>
      ${MODE === 'demo' ? '<p class="small muted center">Demo mode: the default login is <b>Admin</b> / <b>Admin</b>. In live mode, set your own on the Worker.</p>' : ''}</div></main>`;
  chrome();
  root.querySelector('#forgot').onclick = forgotSheet;
  root.querySelector('#lf').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    guard(e.submitter, async () => {
      try {
        const r = await api.post('/api/admin/login', f);
        S.token = r.token;
        sessionStorage.setItem('lh:admin-token', r.token);
        await start();
      } catch (ex) { root.querySelector('#err').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
  };
}
function forgotSheet() {
  const el = openSheet(`<h2>Reset the admin password</h2><p class="muted mt">We email a link to the admin address saved on the server (the ADMIN_EMAIL setting). The link works for 1 hour and only once.</p>
    <div id="fo"></div><button class="btn btn-primary btn-block mt-lg" id="go">Email me a reset link</button><button class="btn btn-block mt" data-close>Cancel</button>`);
  el.querySelector('#go').onclick = (e) => guard(e.currentTarget, async () => {
    try {
      const r = await api.post('/api/admin/forgot', {});
      el.querySelector('#fo').innerHTML = `<div class="okmsg mt" role="status">${esc(r.message)}</div>${r.demoLink ? `<a class="btn btn-block mt" href="${esc(r.demoLink)}">Open the reset link</a>` : ''}`;
    } catch (ex) { el.querySelector('#fo').innerHTML = `<div class="err mt" role="alert">${esc(ex.message)}</div>`; }
  });
}
function resetScreen(tok) {
  root.innerHTML = `<header class="topbar"><div class="topbar-in"><a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints <span class="badge">Admin</span></a></div></header>
    <main class="page"><div class="narrow stack-lg"><div class="hero"><h1>Choose a new admin password</h1><p class="muted">At least 8 characters, with a letter and a number.</p></div>
    <form id="rf" class="card stack" novalidate>
      <label class="field"><span class="lbl">New password</span><input class="input" name="password" type="password" autocomplete="new-password" required></label>
      <label class="field"><span class="lbl">Type it again</span><input class="input" name="again" type="password" autocomplete="new-password" required></label>
      <div id="re"></div><button class="btn btn-primary btn-block">Save new password</button></form></div></main>`;
  root.querySelector('#rf').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.again.value) return (root.querySelector('#re').innerHTML = '<div class="err" role="alert">The two passwords are different.</div>');
    guard(e.submitter, async () => {
      try {
        await api.post('/api/admin/password-reset', { token: tok, password: f.password.value });
        history.replaceState({ lh: 1, login: 1 }, '', 'admin.html');
        loginScreen();
        toast('Password changed. Sign in with your new password.');
      } catch (ex) { root.querySelector('#re').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
  };
}

// ---------------------------------------------------------------- shell, count tiles

const TABS = [['businesses', 'Businesses'], ['deals', 'Live deals'], ['activity', 'Activity log'], ['pilot', 'Pilot'], ['moderation', 'Moderation'], ['settings', 'Settings']];
async function start() {
  S.me = await call('GET', '/api/admin/me');
  S.stats = await call('GET', '/api/admin/stats');
  replaceScreen({ tab: 'businesses' });
  S.tab = 'businesses';
  shell();
}
// each tile is a button that shows the matching list
const TILES = [
  ['total', 'Businesses', { tab: 'businesses', preset: 'all' }],
  ['pending', 'Pending', { tab: 'businesses', preset: 'pending' }],
  ['approved', 'Approved', { tab: 'businesses', preset: 'approved' }],
  ['suspended', 'Suspended', { tab: 'businesses', preset: 'suspended' }],
  ['closed', 'Closed', { tab: 'businesses', preset: 'closed' }],
  ['liveDeals', 'Live deals', { tab: 'deals', preset: 'live' }],
  ['spottedSuggested', 'Spotted deals suggested', { tab: 'moderation', preset: 'pending' }],
  ['spottedLive', 'Spotted deals live', { tab: 'moderation', preset: 'live' }],
];
const tileOn = (t) => S.tab === t[2].tab && (S.tab === 'businesses' ? presetOf(S.f) === t[2].preset : S.tab === 'deals' ? true : S.tipFilter === t[2].preset);
function presetOf(f) {
  if (f.awaiting === '1') return 'pending';
  if (f.status && !f.q && !f.category) return f.status;
  return Object.keys(f).filter((k) => k !== 'sort' && f[k]).length ? '' : 'all';
}
function statsHtml() {
  const st = S.stats;
  return `<div class="stats four-up">${TILES.map((t, i) => `<button class="stat statbtn" data-tile="${i}" aria-pressed="${tileOn(t)}"><b>${st[t[0]]}</b><span>${t[1]}${t[0] === 'spottedSuggested' && st.spottedToday ? ` · ${st.spottedToday} today` : ''}</span></button>`).join('')}</div>
    <div class="row wrap mt small muted"><span>Pro: <b>${st.pro}</b></span><span>Pilot: <b>${st.pilot}/${st.pilotSlots}</b></span><span>Saved passes: <b>${st.passes}</b></span>${st.upgradeRequests ? `<span class="badge b-warn">${st.upgradeRequests} upgrade request${st.upgradeRequests > 1 ? 's' : ''}</span>` : ''}</div>`;
}
function bindStats() {
  root.querySelectorAll('[data-tile]').forEach((b) => (b.onclick = () => navigate({ ...TILES[+b.dataset.tile][2] })));
}
function applyScreen(st) {
  S.tab = st.tab || 'businesses';
  S.biz = st.biz || '';
  if (S.tab === 'businesses') {
    if (st.preset) {
      S.f = st.preset === 'all' ? { sort: 'signup' } : st.preset === 'pending' ? { sort: 'signup', awaiting: '1' } : { sort: 'signup', status: st.preset };
    }
  }
  if (S.tab === 'moderation' && st.preset !== undefined) S.tipFilter = st.preset;
  shell();
}
function shell() {
  root.innerHTML = `${S.me.usingDefaults ? '<div class="banner" style="background:var(--bad-bg);color:var(--bad-ink)"><b>Security:</b> you are using the default Admin / Admin login. Set ADMIN_USERNAME, ADMIN_PASSWORD and SESSION_SECRET on your Worker (or use “Forgot password”) before sharing this site.</div>' : ''}
    <header class="topbar"><div class="topbar-in"><a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints <span class="badge">Admin</span></a><span class="grow"></span>${installButtonHtml()}${settingsButtonHtml()}<span class="badge ${S.me.mode === 'live' ? 'b-good' : 'b-warn'}">${S.me.mode === 'live' ? 'Live' : 'Demo'}</span><button class="btn btn-sm" id="out">Sign out</button></div></header>
    <main class="page"><div id="statsBox">${statsHtml()}</div>
      <div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" aria-selected="${S.tab === id}" data-tab="${id}">${l}</button>`).join('')}</div><div id="view"></div></main>`;
  chrome();
  bindStats();
  root.querySelector('#out').onclick = signOut;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { if (S.tab !== b.dataset.tab) navigate({ tab: b.dataset.tab }); }));
  ({ businesses: vBusinesses, deals: vDeals, activity: vActivity, pilot: vPilot, moderation: vModeration, settings: vSettings })[S.tab](root.querySelector('#view'));
}
async function refreshStats() {
  S.stats = await call('GET', '/api/admin/stats');
  const box = root.querySelector('#statsBox');
  if (box) { box.innerHTML = statsHtml(); bindStats(); }
}
/** A business name that opens the business details at the bottom of the Businesses section. */
const bizLink = (id, name) => `<button type="button" class="biz-link" data-bizlink="${esc(id)}">${esc(name)}</button>`;
function bindBizLinks(scope) {
  scope.querySelectorAll('[data-bizlink]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); navigate({ tab: 'businesses', biz: b.dataset.bizlink }); }));
}

// ---------------------------------------------------------------- businesses

const STATUS_BADGE = { approved: 'b-good', pending: 'b-warn', suspended: 'b-bad', closed: 'b-bad' };
const planLabel = (r) => (r.pilot ? 'Pilot (Pro)' : r.tier === 'pro' ? 'Pro' : 'Free');
const statusLink = (r) => `<button type="button" class="badge ${STATUS_BADGE[r.status]}" style="border:0;cursor:pointer" data-bizlink="${esc(r.id)}" title="Open ${esc(r.name)}">${r.status}</button>`;

function vBusinesses(v) {
  const f = S.f;
  v.innerHTML = `<div class="card flat row between wrap" style="border-color:${f.awaiting ? 'var(--brand)' : 'var(--line)'}"><div><b>Accounts yet to be verified</b><div class="small muted">New sign-ups waiting for an admin to confirm them (${S.stats.awaiting} right now)</div></div>
      <button type="button" class="chip" id="awaitBtn" aria-pressed="${!!f.awaiting}">${f.awaiting ? 'Showing only these' : 'Show only these'}</button></div>
    <form id="ff" class="card stack mt" onsubmit="return false">
    <div class="filters">
      <label class="field span2"><span class="lbl">Search name, owner, email or address</span><input class="input" name="q" type="search" value="${esc(f.q || '')}" placeholder="e.g. pizza"></label>
      <label class="field"><span class="lbl">Type</span><select class="input" name="category"><option value="">All types</option>${CATEGORIES.map((c) => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${c.emoji} ${esc(c.label)}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Status</span><select class="input" name="status"><option value="">Any status</option>${['pending', 'approved', 'suspended', 'closed'].map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Signed up from</span><input class="input" type="date" name="signedFrom" value="${esc(f.signedFrom || '')}"></label>
      <label class="field"><span class="lbl">Signed up to</span><input class="input" type="date" name="signedTo" value="${esc(f.signedTo || '')}"></label>
      <label class="field"><span class="lbl">Account closed from</span><input class="input" type="date" name="closedFrom" value="${esc(f.closedFrom || '')}"></label>
      <label class="field"><span class="lbl">Account closed to</span><input class="input" type="date" name="closedTo" value="${esc(f.closedTo || '')}"></label>
      <label class="field"><span class="lbl">Plan</span><select class="input" name="plan"><option value="">Any plan</option><option value="free" ${f.plan === 'free' ? 'selected' : ''}>Free</option><option value="pro" ${f.plan === 'pro' ? 'selected' : ''}>Pro (incl. pilot)</option><option value="pilot" ${f.plan === 'pilot' ? 'selected' : ''}>Pilot only</option></select></label>
      <label class="field"><span class="lbl">Sort by</span><select class="input" name="sort">${[['signup', 'Newest sign-up'], ['login', 'Last login'], ['name', 'Name'], ['closed', 'Closed date']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="row wrap">
      <label class="check"><input type="checkbox" name="closedOnly" value="1" ${f.closedOnly ? 'checked' : ''}> Account closed only</label>
      <label class="check"><input type="checkbox" name="allSuspended" value="1" ${f.allSuspended ? 'checked' : ''}> All deals suspended or paused</label>
      <label class="check"><input type="checkbox" name="unverified" value="1" ${f.unverified ? 'checked' : ''}> Address not verified</label>
      <span class="grow"></span><button type="button" class="btn btn-sm" id="reset">Clear filters</button></div></form>
    <div class="small muted mt" id="count"></div><div id="tbl" class="mt"></div><div id="detail" class="mt-lg"></div>`;
  const form = v.querySelector('#ff');
  let timer;
  const read = () => {
    const d = Object.fromEntries(new FormData(form));
    S.f = { ...d, ...(S.f.awaiting ? { awaiting: '1' } : {}) };
    load();
  };
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(read, 250); });
  v.querySelector('#reset').onclick = () => { S.f = { sort: 'signup' }; vBusinesses(v); refreshStatsTiles(); };
  v.querySelector('#awaitBtn').onclick = () => { S.f = S.f.awaiting ? { sort: 'signup' } : { sort: 'signup', awaiting: '1' }; vBusinesses(v); refreshStatsTiles(); };
  load();
  if (S.biz) detail(v.querySelector('#detail'), S.biz, true);
  async function load() {
    try {
      const r = await call('GET', '/api/admin/businesses', S.f);
      S.rows = r.businesses; S.total = r.total;
      v.querySelector('#count').textContent = `Showing ${r.businesses.length} of ${r.total} businesses`;
      v.querySelector('#tbl').innerHTML = table(r.businesses);
      v.querySelectorAll('[data-biz]').forEach((tr) => (tr.onclick = () => navigate({ tab: 'businesses', biz: tr.dataset.biz })));
      bindBizLinks(v.querySelector('#tbl'));
    } catch (e) { toast(e.message, 'bad'); }
  }
}
function refreshStatsTiles() { const box = root.querySelector('#statsBox'); if (box) { box.innerHTML = statsHtml(); bindStats(); } }
function flags(r) {
  return [
    r.addressVerified ? '' : '<span class="badge b-warn" title="Address was not matched to Google">Unverified address</span>',
    r.sharedAddress ? '<span class="badge" title="Another business is listed at the same Google address">Shared address</span>' : '',
    r.allDealsSuspended ? '<span class="badge b-bad">All deals off</span>' : '',
    r.upgradeRequested ? '<span class="badge b-warn">Wants Pro</span>' : '',
  ].join(' ');
}
function table(rows) {
  if (!rows.length) return '<div class="empty"><div class="big">🔎</div><p>No businesses match these filters.</p></div>';
  return `<div class="tablewrap"><table class="t cards"><thead><tr><th>Business</th><th>Type</th><th>Status</th><th>Plan</th><th>Signed up</th><th>Approved</th><th>Last login</th><th>Closed</th><th>Deals</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="clickable" data-biz="${esc(r.id)}">
      <td class="first"><b>${esc(r.emoji)} ${esc(r.name)}</b><div class="small muted">${esc(r.owner)} · ${esc(r.email)}</div><div class="mt">${flags(r)}</div></td>
      <td data-label="Type">${esc(catLabel(r.category))}</td>
      <td data-label="Status">${statusLink(r)}</td>
      <td data-label="Plan">${esc(planLabel(r))}</td>
      <td data-label="Signed up">${esc(fmtDate(r.signedUpAt))}</td>
      <td data-label="Approved">${esc(fmtDate(r.approvedAt))}</td>
      <td data-label="Last login">${esc(ago(r.lastLoginAt))}</td>
      <td data-label="Closed">${r.status === 'closed' ? esc(fmtDate(r.closedAt)) : '—'}</td>
      <td data-label="Deals">${r.deals.live} live / ${r.deals.total}${r.deals.suspended ? ` · ${r.deals.suspended} suspended` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

/** Business details, shown inline at the bottom of the Businesses section. */
async function detail(box, id, scroll) {
  box.innerHTML = '<div class="spinner">Loading business…</div>';
  let r;
  try { r = await call('GET', `/api/admin/businesses/${id}`); } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const b = r.business;
  const act = (a, label, cls = '', extra = '') => `<button class="btn btn-sm ${cls}" data-act="${a}" ${extra}>${label}</button>`;
  const actions = [
    b.status === 'pending' ? act('approve', '✅ Approve', 'btn-primary') : '',
    b.status === 'approved' || b.status === 'pending' ? act('suspend', 'Suspend', 'btn-danger') : '',
    b.status === 'suspended' ? act('reinstate', 'Reinstate', 'btn-primary') : '',
    b.status !== 'closed' ? act('close', 'Close account', 'btn-danger') : act('reopen', 'Reopen account', 'btn-primary'),
    b.status === 'approved' && !b.pilot ? act('start_pilot', 'Start pilot') : '',
    b.pilot ? act('end_pilot', 'End pilot') : '',
    b.tier === 'free' ? act('set_tier', 'Change to Pro', '', 'data-tier="pro"') : act('set_tier', 'Change to Free', '', 'data-tier="free"'),
  ].join('');
  const team = r.team.staff;
  box.innerHTML = `<div class="card stack" id="detailCard" style="border-color:var(--brand)"><div class="row between"><div><h2>${esc(b.emoji)} ${esc(b.name)}</h2><div class="small muted">${esc(catLabel(b.category))} · ${esc(b.owner)} · ${esc(b.email)}</div></div><div class="row"><span class="badge ${STATUS_BADGE[b.status]}">${b.status}</span><button class="btn btn-sm" id="dclose" aria-label="Close details">✕</button></div></div>
    <div class="row wrap">${flags(b)}</div>
    <div class="grid2 small">
      <div><span class="muted">Signed up</span><br><b>${esc(fmtDateTime(b.signedUpAt))}</b></div><div><span class="muted">Approved</span><br><b>${esc(fmtDateTime(b.approvedAt))}</b></div>
      <div><span class="muted">Last login</span><br><b>${esc(fmtDateTime(b.lastLoginAt))}</b> (${b.loginCount} total)</div><div><span class="muted">Account closed</span><br><b>${b.status === 'closed' ? esc(fmtDateTime(b.closedAt)) : '—'}</b></div>
      <div><span class="muted">Plan</span><br><b>${esc(planLabel(b))}</b>${b.pilot ? ` (ends ${esc(fmtDate(b.pilotEndsAt))})` : ''}</div><div><span class="muted">First deal live</span><br><b>${esc(fmtDate(b.firstDealAt))}</b></div>
      <div style="grid-column:span 2"><span class="muted">Address${b.addressVerified ? ' (verified with Google)' : ' (not verified)'}</span><br><b>${esc(b.address)}</b>${b.addressRaw && b.addressRaw !== b.address ? `<br><span class="muted">They typed: ${esc(b.addressRaw)}</span>` : ''}</div></div>
    <div class="row wrap">${actions}</div><div id="dOut"></div>
    <h3 class="section-title">Deals (${r.deals.length})</h3>
    <div class="stack">${r.deals.length ? r.deals.map((d) => `<div class="card flat small"><div class="row between"><b>${esc(d.title)}</b><span class="badge ${d.status === 'live' ? 'b-good' : d.status === 'suspended' ? 'b-bad' : ''}">${d.status}</span></div><div class="muted">${esc(d.label)} · ${d.metrics.views} views · ${d.metrics.saves} saves · ${d.metrics.redemptions} redeemed</div></div>`).join('') : '<p class="muted small">No deals.</p>'}</div>
    <h3 class="section-title">Locations and team</h3>
    <p class="small muted">${r.locations.length} location${r.locations.length === 1 ? '' : 's'} · ${team.length} team member${team.length === 1 ? '' : 's'}${team.length ? ': ' + team.map((s) => `${esc(s.name)} (${s.status})`).join(', ') : ''}</p>
    ${r.loops.length ? `<h3 class="section-title">Loop-Ins</h3>${r.loops.map((l) => `<div class="card flat small">${esc(l.from.name)} → ${esc(l.to.name)}: ${esc(l.rewardText)} <span class="badge">${l.status}</span></div>`).join('')}` : ''}
    <h3 class="section-title">History</h3>
    <ul class="timeline">${r.events.map((e) => `<li><span class="when">${esc(fmtDateTime(e.at))}</span><span><b>${esc(EVENT_LABELS[e.type] || e.type)}</b>${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ''}</span></li>`).join('')}</ul></div>`;
  box.querySelector('#dclose').onclick = () => { S.biz = ''; box.innerHTML = ''; history.replaceState({ ...(history.state || {}), biz: '' }, ''); };
  box.querySelectorAll('[data-act]').forEach((btn) => (btn.onclick = () => guard(btn, async () => {
    const a = btn.dataset.act;
    const hard = { suspend: ['Suspend this business?', 'All its live deals are hidden from shoppers until it is reinstated.'], close: ['Close this account?', 'Its deals end and it can no longer sign in.'] }[a];
    if (hard && !(await confirmSheet(hard[0], hard[1], hard[0].split(' ')[0], true))) return;
    try {
      await call('POST', `/api/admin/businesses/${id}/action`, { action: a, tier: btn.dataset.tier });
      toast('Done.');
      await refreshStats();
      const v = root.querySelector('#view');
      if (S.tab === 'businesses' && v.querySelector('#ff')) { const keep = v.querySelector('#detail'); await vBusinessesRefresh(v); detail(keep, id, false); }
    } catch (ex) { box.querySelector('#dOut').innerHTML = `<div class="err mt">${esc(ex.message)}</div>`; }
  })));
  if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function vBusinessesRefresh(v) {
  const r = await call('GET', '/api/admin/businesses', S.f);
  v.querySelector('#count').textContent = `Showing ${r.businesses.length} of ${r.total} businesses`;
  v.querySelector('#tbl').innerHTML = table(r.businesses);
  v.querySelectorAll('[data-biz]').forEach((tr) => (tr.onclick = () => navigate({ tab: 'businesses', biz: tr.dataset.biz })));
  bindBizLinks(v.querySelector('#tbl'));
}

// ---------------------------------------------------------------- live deals

async function vDeals(v) {
  v.innerHTML = '<div class="spinner">Loading…</div>';
  try {
    const r = await call('GET', '/api/admin/deals', { live: '1' });
    v.innerHTML = `<h2>Live deals right now</h2><p class="muted mt small">${r.deals.length} deal${r.deals.length === 1 ? '' : 's'} are visible to shoppers today. Tap a business name for its details.</p>
      <div class="tablewrap mt"><table class="t cards"><thead><tr><th>Deal</th><th>Business</th><th>Offer</th><th>Started</th><th>Ends</th></tr></thead><tbody>
      ${r.deals.map((d) => `<tr><td class="first"><b>${esc(d.title)}</b></td><td data-label="Business">${esc(d.emoji)} ${bizLink(d.bizId, d.bizName)}</td><td data-label="Offer">${esc(d.label)}</td><td data-label="Started">${esc(fmtDate(d.startsAt))}</td><td data-label="Ends">${esc(fmtDate(d.endsAt))}</td></tr>`).join('')}</tbody></table></div>`;
    bindBizLinks(v);
  } catch (e) { v.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------------------------------------------------------- activity

async function vActivity(v) {
  const type = S.eventType || '';
  v.innerHTML = `<div class="row wrap between"><h2>Activity log</h2><select class="input" id="et" style="width:auto"><option value="">All events</option>${Object.entries(EVENT_LABELS).map(([k, l]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div><div id="ev" class="mt"><div class="spinner">Loading…</div></div>`;
  v.querySelector('#et').onchange = (e) => { S.eventType = e.target.value; vActivity(v); };
  try {
    const r = await call('GET', '/api/admin/events', { type });
    v.querySelector('#ev').innerHTML = r.events.length
      ? `<div class="card"><ul class="timeline">${r.events.map((e) => `<li><span class="when">${esc(fmtDateTime(e.at))}</span><span>${e.bizName === '(deleted)' ? '<b>(deleted)</b>' : bizLink(e.bizId, e.bizName)} · ${esc(EVENT_LABELS[e.type] || e.type)}${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ''}</span></li>`).join('')}</ul></div>`
      : '<div class="empty"><p>No events yet.</p></div>';
    bindBizLinks(v);
  } catch (e) { v.querySelector('#ev').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------------------------------------------------------- pilot

async function vPilot(v) {
  v.innerHTML = '<div class="spinner">Loading…</div>';
  const r = await call('GET', '/api/admin/pilot');
  const cand = await call('GET', '/api/admin/businesses', { status: 'approved', sort: 'signup' });
  const free = cand.businesses.filter((b) => !b.pilot && b.tier === 'free').slice(0, 8);
  v.innerHTML = `<div class="stack-lg"><div class="card"><h2>Pilot program</h2><p class="muted mt">${r.used} of ${r.slots} slots in use. Pilot businesses get Pro features free for 60 days.</p><div class="meter mt"><i style="width:${(r.used / r.slots) * 100}%"></i></div></div>
    ${r.rows.length ? `<div class="tablewrap"><table class="t cards"><thead><tr><th>Business</th><th>Status</th><th>Days left</th><th>Sign-up to approval</th><th>Sign-up to first deal</th><th>Saves</th><th>Redeemed</th><th>Logins</th></tr></thead><tbody>
      ${r.rows.map((b) => `<tr><td class="first">${esc(b.emoji)} ${bizLink(b.id, b.name)}<div class="small muted">Started ${esc(fmtDate(b.pilotStartedAt))}</div></td><td data-label="Status">${b.pilot ? '<span class="badge b-good">In pilot</span>' : '<span class="badge">Ended</span>'}</td><td data-label="Days left">${b.pilot ? b.daysLeft : '—'}</td><td data-label="To approval">${b.daysToApproval == null ? '—' : b.daysToApproval + ' d'}</td><td data-label="To first deal">${b.daysToFirstDeal == null ? 'No deal yet' : b.daysToFirstDeal + ' d'}</td><td data-label="Saves">${b.saves}</td><td data-label="Redeemed">${b.redemptions}</td><td data-label="Logins">${b.loginCount}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>No pilot businesses yet.</p></div>'}
    ${r.used < r.slots && free.length ? `<div class="card stack"><h3>Add a business to the pilot</h3>${free.map((b) => `<div class="row between"><span>${esc(b.emoji)} ${bizLink(b.id, b.name)} <span class="muted small">signed up ${esc(fmtDate(b.signedUpAt))}</span></span><button class="btn btn-sm" data-start="${esc(b.id)}">Start pilot</button></div>`).join('')}</div>` : ''}</div>`;
  bindBizLinks(v);
  v.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => guard(b, async () => {
    await call('POST', `/api/admin/businesses/${b.dataset.start}/action`, { action: 'start_pilot' });
    toast('Pilot started.'); await refreshStats(); vPilot(v);
  })));
}

// ---------------------------------------------------------------- moderation (spotted deals) + settings

async function vModeration(v) {
  v.innerHTML = '<div class="spinner">Loading…</div>';
  const filt = S.tipFilter;
  const r = await call('GET', '/api/admin/tips', filt === 'pending' ? { status: 'pending' } : filt === 'live' ? { live: '1' } : {});
  const chip = (k, l) => `<button class="chip" aria-pressed="${filt === k}" data-tf="${k}">${l}</button>`;
  v.innerHTML = `<h2>Spotted deals</h2><p class="muted mt">Deals that shoppers spotted. Approved ones show for 30 days in the shoppers’ deal list as “Spotted deal”. Shoppers never see the photo, the contact or the device details. Check the photo against the details before you approve.</p>
    <div class="chips mt">${chip('', 'All')}${chip('pending', 'Suggested (waiting)')}${chip('live', 'Live now')}</div>
    <div class="stack mt-lg">${r.tips.length ? r.tips.map((t) => {
    const cat = CATEGORIES.find((c) => c.id === t.category);
    const d = t.device || {};
    return `<div class="card stack"><div class="row between"><b>${esc(t.name)}</b><span class="badge ${t.live ? 'b-good' : t.status === 'rejected' ? 'b-bad' : t.status === 'approved' ? '' : 'b-warn'}">${t.live ? 'live' : t.status === 'approved' ? 'expired' : t.status}</span></div>
      <div class="small muted">${cat ? `${cat.emoji} ${esc(cat.label)}` : 'No deal type'}${t.address ? ' · ' + esc(t.address) : ' · no address'}${isFinite(t.lat) && t.lat !== null ? ' · address placed on map' : ''}</div>
      <p>${esc(t.note)}</p>
      ${t.photo ? `<button class="photobtn" data-photo="${esc(t.id)}" aria-label="Enlarge the photo of the sign"><img class="photoprev" src="${t.photo}" alt="Photo of the deal sign"></button>` : `<div class="small muted">No photo${t.photoDropped ? ' (older photos are removed to save space)' : ''}.</div>`}
      <div class="small">${t.contact ? `Contact: <b>${esc(t.contact)}</b> ${t.consent ? '<span class="badge b-good">OK to share with the business</span>' : '<span class="badge b-warn">Do not share</span>'}` : '<span class="muted">No contact left</span>'}</div>
      <div class="card flat small stack" style="gap:4px"><b>Device check</b>
        ${(t.flags || []).map((f) => `<div><span class="badge b-bad">⚑ ${esc(f)}</span></div>`).join('')}
        <div>Device ID: <code>${esc(d.id || 'unknown')}</code> · Fingerprint: <code>${esc(d.hash || 'unknown')}</code></div>
        <div>Network address (IP): <code>${esc(d.ip || 'unknown')}</code></div>
        <div>${esc(d.platform || '')} ${esc(d.screen || '')} · ${esc(d.tz || '')} · ${esc(d.lang || '')}</div>
        <div class="muted" style="word-break:break-word">${esc(d.ua || '')}</div>
        <div class="muted">Other tips from this device: ${t.related ? t.related.sameDevice : 0} · from this network: ${t.related ? t.related.sameNetwork : 0}. Websites cannot read a phone’s MAC address, so we use the device ID and fingerprint instead.</div></div>
      <div class="tiny muted">${esc(ago(t.at))}</div>
    ${t.status === 'pending' ? `<div class="row"><button class="btn btn-primary btn-sm" data-tip="${esc(t.id)}" data-a="approve">Approve</button><button class="btn btn-sm" data-tip="${esc(t.id)}" data-a="reject">Reject</button></div>` : ''}</div>`; }).join('') : '<div class="empty"><p>Nothing here.</p></div>'}</div>`;
  v.querySelectorAll('[data-photo]').forEach((b) => (b.onclick = () => { const t = r.tips.find((x) => x.id === b.dataset.photo); openSheet(`<h2>${esc(t.name)}</h2><img src="${t.photo}" alt="Photo of the deal sign" style="width:100%;border-radius:12px;margin-top:12px"><button class="btn btn-block mt-lg" data-close>Close</button>`); }));
  v.querySelectorAll('[data-tf]').forEach((b) => (b.onclick = () => { S.tipFilter = b.dataset.tf; refreshStatsTiles(); vModeration(v); }));
  v.querySelectorAll('[data-tip]').forEach((b) => (b.onclick = () => guard(b, async () => { await call('POST', `/api/admin/tips/${b.dataset.tip}`, { action: b.dataset.a }); await refreshStats(); vModeration(v); })));
}
function vSettings(v) {
  v.innerHTML = `<div class="stack-lg">
    <div class="card stack"><h2>Connection</h2>
      <p>Mode: <b>${S.me.mode === 'live' ? 'Live (Cloudflare Worker)' : 'Demo (data stays in this browser)'}</b></p>
      <p>Google address check: <b>${S.me.addressCheck ? 'Connected' : 'Not connected'}</b> ${S.me.addressCheck ? '' : '<span class="muted small">(set GOOGLE_MAPS_API_KEY on the Worker)</span>'}</p>
      <p>Admin login: <b>${S.me.usingDefaults ? 'Default (change it!)' : 'Custom'}</b></p></div>
    <div class="card stack"><h2>Data tools</h2>
      <p class="muted small">Load the sample businesses, deals and history. Replaces everything currently stored.</p><button class="btn" id="seed">Load demo data</button>
      <hr style="border:0;border-top:1px solid var(--line);width:100%"><p class="muted small">Delete every business, deal, pass and log entry. Cannot be undone.</p><button class="btn btn-danger" id="reset">Delete all data</button></div></div>`;
  v.querySelector('#seed').onclick = async (e) => {
    if (!(await confirmSheet('Load demo data?', 'This replaces all current data with sample data.', 'Load demo data'))) return;
    guard(e.currentTarget, async () => { await call('POST', '/api/admin/seed'); await refreshStats(); toast('Demo data loaded.'); });
  };
  v.querySelector('#reset').onclick = () => {
    const el = openSheet(`<h2>Delete all data?</h2><p class="muted mt">Type <b>DELETE</b> to confirm.</p><input class="input mt" id="cf" autocomplete="off"><div class="row mt-lg"><button class="btn grow" data-close>Cancel</button><button class="btn btn-danger grow" id="go">Delete everything</button></div>`);
    el.querySelector('#go').onclick = (e) => guard(e.currentTarget, async () => { await call('POST', '/api/admin/reset', { confirm: el.querySelector('#cf').value }); closeSheet(true); await refreshStats(); toast('All data deleted.'); });
  };
}

// ---------------------------------------------------------------- boot

registerServiceWorker();
(async () => {
  const resetTok = new URLSearchParams(location.search).get('reset');
  initNav(S.token ? { tab: 'businesses' } : { login: 1 }, (st) => {
    if (S.me && S.token) applyScreen(st); else loginScreen();
  });
  if (resetTok) return resetScreen(resetTok);
  if (S.token) {
    try {
      S.me = await call('GET', '/api/admin/me');
      S.stats = await call('GET', '/api/admin/stats');
      shell();
      return;
    } catch { S.token = ''; }
  }
  loginScreen();
})();
