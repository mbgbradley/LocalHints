/* Admin side (admin.html): search and manage businesses, activity log, pilot, moderation, settings. */
import { api, MODE, ApiError } from './api.js';
import { CATEGORIES, EVENT_LABELS } from './engine.js';
import { esc, toast, openSheet, closeSheet, confirmSheet, guard, fmtDate, fmtDateTime, ago, catLabel, registerServiceWorker } from './ui.js';

const root = document.getElementById('app');
const S = { token: sessionStorage.getItem('lh:admin-token') || '', tab: 'businesses', me: null, stats: null, f: { sort: 'signup' }, rows: [], total: 0 };

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
  loginScreen();
}

// ---------------------------------------------------------------- login

function loginScreen() {
  root.innerHTML = `<header class="topbar"><div class="topbar-in"><a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints <span class="badge">Admin</span></a></div></header>
    <main class="page"><div class="narrow stack-lg"><div class="hero"><h1>Admin sign in</h1><p class="muted">For LocalHints staff only.</p></div>
      <form id="lf" class="card stack" novalidate>
        <label class="field"><span class="lbl">Username</span><input class="input" name="username" autocomplete="username" required></label>
        <label class="field"><span class="lbl">Password</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <div id="err"></div><button class="btn btn-primary btn-block">Sign in</button></form>
      ${MODE === 'demo' ? '<p class="small muted center">Demo mode: the default login is <b>Admin</b> / <b>Admin</b>. In live mode, set your own on the Worker.</p>' : ''}</div></main>`;
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

// ---------------------------------------------------------------- shell

const TABS = [['businesses', 'Businesses'], ['activity', 'Activity log'], ['pilot', 'Pilot'], ['moderation', 'Moderation'], ['settings', 'Settings']];
async function start() {
  S.me = await call('GET', '/api/admin/me');
  S.stats = await call('GET', '/api/admin/stats');
  shell();
}
function shell() {
  const st = S.stats;
  root.innerHTML = `${S.me.usingDefaults ? '<div class="banner" style="background:var(--bad-bg);color:var(--bad-ink)"><b>Security:</b> you are using the default Admin / Admin login. Set ADMIN_USERNAME, ADMIN_PASSWORD and SESSION_SECRET on your Worker before sharing this site.</div>' : ''}
    <header class="topbar"><div class="topbar-in"><a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints <span class="badge">Admin</span></a><span class="grow"></span><span class="badge ${S.me.mode === 'live' ? 'b-good' : 'b-warn'}">${S.me.mode === 'live' ? 'Live' : 'Demo'}</span><button class="btn btn-sm" id="out">Sign out</button></div></header>
    <main class="page"><div class="stats six">
      ${[['total', 'Businesses'], ['pending', 'Pending'], ['approved', 'Approved'], ['suspended', 'Suspended'], ['closed', 'Closed'], ['liveDeals', 'Live deals']].map(([k, l]) => `<div class="stat"><b>${st[k]}</b><span>${l}</span></div>`).join('')}</div>
      <div class="row wrap mt small muted"><span>Pro: <b>${st.pro}</b></span><span>Pilot: <b>${st.pilot}/${st.pilotSlots}</b></span><span>Saved passes: <b>${st.passes}</b></span>${st.upgradeRequests ? `<span class="badge b-warn">${st.upgradeRequests} upgrade request${st.upgradeRequests > 1 ? 's' : ''}</span>` : ''}${st.tipsPending ? `<span class="badge b-warn">${st.tipsPending} tip${st.tipsPending > 1 ? 's' : ''} to review</span>` : ''}</div>
      <div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" aria-selected="${S.tab === id}" data-tab="${id}">${l}</button>`).join('')}</div><div id="view"></div></main>`;
  root.querySelector('#out').onclick = signOut;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; shell(); }));
  ({ businesses: vBusinesses, activity: vActivity, pilot: vPilot, moderation: vModeration, settings: vSettings })[S.tab](root.querySelector('#view'));
}
async function refreshStats() { S.stats = await call('GET', '/api/admin/stats'); }

// ---------------------------------------------------------------- businesses

const STATUS_BADGE = { approved: 'b-good', pending: 'b-warn', suspended: 'b-bad', closed: 'b-bad' };
const planLabel = (r) => (r.pilot ? 'Pilot (Pro)' : r.tier === 'pro' ? 'Pro' : 'Free');

function vBusinesses(v) {
  const f = S.f;
  v.innerHTML = `<form id="ff" class="card stack" onsubmit="return false">
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
    <div class="small muted mt" id="count"></div><div id="tbl" class="mt"></div>`;
  const form = v.querySelector('#ff');
  let timer;
  const read = () => {
    const d = Object.fromEntries(new FormData(form));
    S.f = { ...d };
    load();
  };
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(read, 250); });
  v.querySelector('#reset').onclick = () => { S.f = { sort: 'signup' }; vBusinesses(v); };
  load();
  async function load() {
    try {
      const r = await call('GET', '/api/admin/businesses', S.f);
      S.rows = r.businesses; S.total = r.total;
      v.querySelector('#count').textContent = `Showing ${r.businesses.length} of ${r.total} businesses`;
      v.querySelector('#tbl').innerHTML = table(r.businesses);
      v.querySelectorAll('[data-biz]').forEach((tr) => (tr.onclick = () => drawer(tr.dataset.biz)));
    } catch (e) { toast(e.message, 'bad'); }
  }
}
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
      <td data-label="Status"><span class="badge ${STATUS_BADGE[r.status]}">${r.status}</span></td>
      <td data-label="Plan">${esc(planLabel(r))}</td>
      <td data-label="Signed up">${esc(fmtDate(r.signedUpAt))}</td>
      <td data-label="Approved">${esc(fmtDate(r.approvedAt))}</td>
      <td data-label="Last login">${esc(ago(r.lastLoginAt))}</td>
      <td data-label="Closed">${r.status === 'closed' ? esc(fmtDate(r.closedAt)) : '—'}</td>
      <td data-label="Deals">${r.deals.live} live / ${r.deals.total}${r.deals.suspended ? ` · ${r.deals.suspended} suspended` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

async function drawer(id) {
  let r;
  try { r = await call('GET', `/api/admin/businesses/${id}`); } catch (e) { return toast(e.message, 'bad'); }
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
  const el = openSheet(`<div class="row between"><div><h2>${esc(b.emoji)} ${esc(b.name)}</h2><div class="small muted">${esc(catLabel(b.category))} · ${esc(b.owner)} · ${esc(b.email)}</div></div><span class="badge ${STATUS_BADGE[b.status]}">${b.status}</span></div>
    <div class="row wrap mt">${flags(b)}</div>
    <div class="grid2 mt-lg small">
      <div><span class="muted">Signed up</span><br><b>${esc(fmtDateTime(b.signedUpAt))}</b></div><div><span class="muted">Approved</span><br><b>${esc(fmtDateTime(b.approvedAt))}</b></div>
      <div><span class="muted">Last login</span><br><b>${esc(fmtDateTime(b.lastLoginAt))}</b> (${b.loginCount} total)</div><div><span class="muted">Account closed</span><br><b>${b.status === 'closed' ? esc(fmtDateTime(b.closedAt)) : '—'}</b></div>
      <div><span class="muted">Plan</span><br><b>${esc(planLabel(b))}</b>${b.pilot ? ` (ends ${esc(fmtDate(b.pilotEndsAt))})` : ''}</div><div><span class="muted">First deal live</span><br><b>${esc(fmtDate(b.firstDealAt))}</b></div>
      <div class="span2" style="grid-column:span 2"><span class="muted">Address${b.addressVerified ? ' (verified with Google)' : ' (not verified)'}</span><br><b>${esc(b.address)}</b>${b.addressRaw && b.addressRaw !== b.address ? `<br><span class="muted">They typed: ${esc(b.addressRaw)}</span>` : ''}</div></div>
    <div class="row wrap mt-lg">${actions}</div><div id="dOut"></div>
    <h3 class="section-title">Deals (${r.deals.length})</h3>
    <div class="stack">${r.deals.length ? r.deals.map((d) => `<div class="card flat small"><div class="row between"><b>${esc(d.title)}</b><span class="badge ${d.status === 'live' ? 'b-good' : d.status === 'suspended' ? 'b-bad' : ''}">${d.status}</span></div><div class="muted">${esc(d.label)} · ${d.metrics.views} views · ${d.metrics.saves} saves · ${d.metrics.redemptions} redeemed</div></div>`).join('') : '<p class="muted small">No deals.</p>'}</div>
    ${r.loops.length ? `<h3 class="section-title">Loop-Ins</h3>${r.loops.map((l) => `<div class="card flat small">${esc(l.from.name)} → ${esc(l.to.name)}: ${esc(l.rewardText)} <span class="badge">${l.status}</span></div>`).join('')}` : ''}
    <h3 class="section-title">History</h3>
    <ul class="timeline">${r.events.map((e) => `<li><span class="when">${esc(fmtDateTime(e.at))}</span><span><b>${esc(EVENT_LABELS[e.type] || e.type)}</b>${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ''}</span></li>`).join('')}</ul>
    <button class="btn btn-block mt-lg" data-close>Close</button>`, { wide: true });
  el.querySelectorAll('[data-act]').forEach((btn) => (btn.onclick = () => guard(btn, async () => {
    const a = btn.dataset.act;
    const body = { action: a, tier: btn.dataset.tier };
    const hard = { suspend: ['Suspend this business?', 'All its live deals are hidden from shoppers until it is reinstated.'], close: ['Close this account?', 'Its deals end and it can no longer sign in.'] }[a];
    if (hard) {
      if (!(await confirmSheet(hard[0], hard[1], hard[0].split(' ')[0], true))) return;
    }
    try {
      await call('POST', `/api/admin/businesses/${id}/action`, body);
      toast('Done.');
      await refreshStats();
      closeSheet(true);
      shell();
      drawer(id);
    } catch (ex) { el.querySelector('#dOut').innerHTML = `<div class="err mt">${esc(ex.message)}</div>`; }
  })));
}

// ---------------------------------------------------------------- activity

async function vActivity(v) {
  const type = S.eventType || '';
  v.innerHTML = `<div class="row wrap between"><h2>Activity log</h2><select class="input" id="et" style="width:auto"><option value="">All events</option>${Object.entries(EVENT_LABELS).map(([k, l]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div><div id="ev" class="mt"><div class="spinner">Loading…</div></div>`;
  v.querySelector('#et').onchange = (e) => { S.eventType = e.target.value; vActivity(v); };
  try {
    const r = await call('GET', '/api/admin/events', { type });
    v.querySelector('#ev').innerHTML = r.events.length
      ? `<div class="card"><ul class="timeline">${r.events.map((e) => `<li><span class="when">${esc(fmtDateTime(e.at))}</span><span><b>${esc(e.bizName)}</b> · ${esc(EVENT_LABELS[e.type] || e.type)}${e.detail ? `<br><span class="muted">${esc(e.detail)}</span>` : ''}</span></li>`).join('')}</ul></div>`
      : '<div class="empty"><p>No events yet.</p></div>';
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
      ${r.rows.map((b) => `<tr class="clickable" data-biz="${esc(b.id)}"><td class="first"><b>${esc(b.emoji)} ${esc(b.name)}</b><div class="small muted">Started ${esc(fmtDate(b.pilotStartedAt))}</div></td><td data-label="Status">${b.pilot ? '<span class="badge b-good">In pilot</span>' : '<span class="badge">Ended</span>'}</td><td data-label="Days left">${b.pilot ? b.daysLeft : '—'}</td><td data-label="To approval">${b.daysToApproval == null ? '—' : b.daysToApproval + ' d'}</td><td data-label="To first deal">${b.daysToFirstDeal == null ? 'No deal yet' : b.daysToFirstDeal + ' d'}</td><td data-label="Saves">${b.saves}</td><td data-label="Redeemed">${b.redemptions}</td><td data-label="Logins">${b.loginCount}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>No pilot businesses yet.</p></div>'}
    ${r.used < r.slots && free.length ? `<div class="card stack"><h3>Add a business to the pilot</h3>${free.map((b) => `<div class="row between"><span>${esc(b.emoji)} ${esc(b.name)} <span class="muted small">signed up ${esc(fmtDate(b.signedUpAt))}</span></span><button class="btn btn-sm" data-start="${esc(b.id)}">Start pilot</button></div>`).join('')}</div>` : ''}</div>`;
  v.querySelectorAll('[data-biz]').forEach((tr) => (tr.onclick = () => drawer(tr.dataset.biz)));
  v.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => guard(b, async () => {
    await call('POST', `/api/admin/businesses/${b.dataset.start}/action`, { action: 'start_pilot' });
    toast('Pilot started.'); await refreshStats(); shell();
  })));
}

// ---------------------------------------------------------------- moderation + settings

async function vModeration(v) {
  v.innerHTML = '<div class="spinner">Loading…</div>';
  const r = await call('GET', '/api/admin/tips');
  v.innerHTML = `<h2>Community tips</h2><p class="muted mt">Deals that shoppers spotted. Approved tips appear under “Spotted by neighbors”.</p><div class="stack mt-lg">${r.tips.length ? r.tips.map((t) => `<div class="card stack"><div class="row between"><b>${esc(t.name)}</b><span class="badge ${t.status === 'approved' ? 'b-good' : t.status === 'rejected' ? 'b-bad' : 'b-warn'}">${t.status}</span></div>${t.address ? `<div class="small muted">${esc(t.address)}</div>` : ''}<p>${esc(t.note)}</p><div class="tiny muted">${esc(ago(t.at))}</div>
    ${t.status === 'pending' ? `<div class="row"><button class="btn btn-primary btn-sm" data-tip="${esc(t.id)}" data-a="approve">Approve</button><button class="btn btn-sm" data-tip="${esc(t.id)}" data-a="reject">Reject</button></div>` : ''}</div>`).join('') : '<div class="empty"><p>No tips yet.</p></div>'}</div>`;
  v.querySelectorAll('[data-tip]').forEach((b) => (b.onclick = () => guard(b, async () => { await call('POST', `/api/admin/tips/${b.dataset.tip}`, { action: b.dataset.a }); await refreshStats(); shell(); })));
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
    guard(e.currentTarget, async () => { await call('POST', '/api/admin/seed'); await refreshStats(); toast('Demo data loaded.'); shell(); });
  };
  v.querySelector('#reset').onclick = () => {
    const el = openSheet(`<h2>Delete all data?</h2><p class="muted mt">Type <b>DELETE</b> to confirm.</p><input class="input mt" id="cf" autocomplete="off"><div class="row mt-lg"><button class="btn grow" data-close>Cancel</button><button class="btn btn-danger grow" id="go">Delete everything</button></div>`);
    el.querySelector('#go').onclick = (e) => guard(e.currentTarget, async () => { await call('POST', '/api/admin/reset', { confirm: el.querySelector('#cf').value }); closeSheet(true); await refreshStats(); toast('All data deleted.'); shell(); });
  };
}

// ---------------------------------------------------------------- boot

registerServiceWorker();
(async () => {
  if (S.token) { try { await start(); return; } catch { S.token = ''; } }
  loginScreen();
})();
