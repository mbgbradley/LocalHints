/* Team member page (staff.html): a clerk joins with an invite from the owner, then redeems passes. No dashboard, no money totals. */
import { api, MODE, ApiError } from './api.js';
import { esc, toast, guard, registerServiceWorker, icon, installButtonHtml, settingsButtonHtml, bindChrome } from './ui.js';
import { mountRedeem } from './redeem-ui.js';

const root = document.getElementById('app');
const tget = () => { try { return localStorage.getItem('lh:staff-token') || ''; } catch { return ''; } };
const tset = (v) => { try { v ? localStorage.setItem('lh:staff-token', v) : localStorage.removeItem('lh:staff-token'); } catch { /* storage blocked */ } token = v; };
let token = tget();

const bar = () => `${MODE === 'demo' ? '<div class="banner">Demo mode: data stays in this browser.</div>' : ''}
  <header class="topbar"><div class="topbar-in"><a class="brand" href="staff.html"><img src="icon.svg" alt="">LocalHints <span class="badge b-warn">Team</span></a><span class="grow"></span>${installButtonHtml()}${settingsButtonHtml()}</div></header>`;
const chrome = () => bindChrome(root, 'LocalHints Staff');

function intro() {
  root.innerHTML = `${bar()}<main class="page"><div class="narrow stack-lg">
    <div class="hero"><h1>Team sign-in</h1><p class="muted">Your manager gives you an invite link or a QR code. Open it on this phone and you are in. There is no password to remember.</p></div>
    <div class="card stack"><b>Have a code from your manager?</b><p class="small muted">Open the invite link, or scan the QR code with your phone camera.</p></div>
    <a class="btn btn-block" href="index.html">Go to the shopper view</a></div></main>`;
  chrome();
}

async function join(invite) {
  let pre;
  try { pre = await api.post('/api/staff/accept', { invite, preview: true }); } catch (e) {
    root.innerHTML = `${bar()}<main class="page"><div class="narrow stack-lg"><div class="err" role="alert">${esc(e.message)}</div><a class="btn btn-block" href="staff.html">Back</a></div></main>`;
    return chrome();
  }
  root.innerHTML = `${bar()}<main class="page"><div class="narrow stack-lg">
    <div class="hero"><h1>Join ${esc(pre.businessName)}</h1><p class="muted">You will be able to redeem LocalHints passes for this business. Your manager can turn your access off at any time.</p></div>
    <form id="jf" class="card stack" novalidate><label class="field"><span class="lbl">Your name</span><input class="input" name="name" value="${esc(pre.name)}" maxlength="60" required></label><div id="jerr"></div><button class="btn btn-primary btn-block">Accept and join</button></form></div></main>`;
  chrome();
  root.querySelector('#jf').onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => {
      try {
        const r = await api.post('/api/staff/accept', { invite, name: e.target.name.value });
        tset(r.token);
        history.replaceState(null, '', 'staff.html');
        await home();
      } catch (ex) { root.querySelector('#jerr').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
  };
}

async function home() {
  let me;
  try { me = await api.get('/api/staff/me', {}, token); } catch (e) {
    if (e instanceof ApiError && e.status === 401) { tset(''); toast('Your access was turned off or has expired. Ask your manager for a new invite.', 'bad'); return intro(); }
    root.innerHTML = `${bar()}<main class="page"><div class="empty"><div class="big">📡</div><p>${esc(e.message)}</p><button class="btn mt" onclick="location.reload()">Try again</button></div></main>`;
    return chrome();
  }
  root.innerHTML = `${bar()}<main class="page"><div class="narrow stack-lg">
    <div class="hero"><h1>${esc(me.business.emoji)} ${esc(me.business.name)}</h1><p class="muted">Signed in as <b>${esc(me.staff.name)}</b> · ${esc(me.staff.locationName)}</p></div>
    <div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><b id="nToday">${me.today.n}</b><span>Redeemed today</span></div><div class="stat"><b id="nTotal">${me.total.n}</b><span>Total redeemed</span></div></div>
    <div class="card stack"><h2>Redeem a pass</h2><div id="rd"></div></div>
    <button class="btn btn-block" id="leave">Leave this team</button></div></main>`;
  chrome();
  const bump = (id) => { const n = root.querySelector(id); n.textContent = String(+n.textContent + 1); };
  mountRedeem(root.querySelector('#rd'), {
    locations: me.locations,
    defaultLocation: (me.locations.find((l) => l.name === me.staff.locationName) || me.locations[0]).id,
    send: (b) => api.post('/api/staff/redeem', b, token),
    onDone: () => { bump('#nToday'); bump('#nTotal'); },
  });
  root.querySelector('#leave').onclick = () => { tset(''); toast('You left the team on this phone.'); intro(); };
}

registerServiceWorker();
const invite = new URLSearchParams(location.search).get('invite');
if (invite) join(invite); else if (token) home(); else intro();
