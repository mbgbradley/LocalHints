/*
 * redeem-ui.js: the "redeem a pass" form used by the owner (business.html) and by staff (staff.html).
 * Step 1: enter the pass code and the purchase total BEFORE the deal -> we show what the customer pays AFTER the deal.
 * Step 2: confirm. That records the sale (before and after), who rang it up and where, so results are measured.
 */
import { esc, openSheet, closeSheet, guard, toast, icon } from './ui.js';

const $ = (n) => '$' + Number(n).toFixed(2);

export function mountRedeem(el, { send, locations = [], defaultLocation = 'main', onDone }) {
  const multi = locations.length > 1;
  el.innerHTML = `<form class="stack" id="rf" novalidate>
      <label class="field"><span class="lbl">Pass code</span><input class="input big-input" name="code" placeholder="ABC123" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="14" required></label>
      ${'BarcodeDetector' in window ? `<button type="button" class="btn btn-sm" id="scan">${icon('install', 18)} Scan the customer’s QR code</button>` : ''}
      <label class="field"><span class="lbl">Purchase total BEFORE the deal ($)</span><input class="input" name="before" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="24.50"></label>
      ${multi ? `<label class="field"><span class="lbl">Location</span><select class="input" name="locationId">${locations.map((l) => `<option value="${esc(l.id)}" ${l.id === defaultLocation ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>` : ''}
      <div id="rOut"></div>
      <button class="btn btn-primary btn-block" id="rGo">Check pass</button></form>`;
  const form = el.querySelector('#rf'), out = el.querySelector('#rOut');
  const body = () => ({ code: form.code.value, before: form.before.value, locationId: multi ? form.locationId.value : undefined });
  const scan = el.querySelector('#scan');
  if (scan) scan.onclick = () => scanQr((v) => { form.code.value = v; form.before.focus(); });
  form.onsubmit = (e) => {
    e.preventDefault();
    out.innerHTML = '';
    guard(el.querySelector('#rGo'), async () => {
      try {
        const r = await send({ ...body(), preview: true });
        confirmStep(r);
      } catch (ex) {
        out.innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`;
      }
    });
  };
  function confirmStep(r) {
    const d = r.deal;
    out.innerHTML = `<div class="card flat stack" style="border-color:var(--brand)">
      <div><b>${d ? esc(d.label) + ': ' + esc(d.title) : 'Loop reward: ' + esc(r.pass.rewardText)}</b>${d && d.stamps > 1 ? `<div class="small muted">Stamp ${r.pass.stamps + 1} of ${d.stamps}</div>` : ''}</div>
      ${r.before != null ? `<div class="grid2"><div class="stat"><span>Before the deal</span><b>${$(r.before)}</b></div><div class="stat"><span>After the deal${r.exact ? '' : ' (estimate)'}</span><b>${$(r.after)}</b></div></div>
      <label class="field"><span class="lbl">Amount actually charged (change only if different)</span><input class="input" id="finalAmt" type="number" inputmode="decimal" step="0.01" min="0" max="${esc(r.before)}" value="${esc(r.after)}"></label>` : ''}
      <div class="row"><button type="button" class="btn grow" id="rNo">Cancel</button><button type="button" class="btn btn-primary grow" id="rYes">Confirm redeem</button></div></div>`;
    out.querySelector('#rNo').onclick = () => { out.innerHTML = ''; };
    out.querySelector('#rYes').onclick = (e) => guard(e.currentTarget, async () => {
      try {
        const fin = out.querySelector('#finalAmt');
        const b = body();
        if (fin && Number(fin.value) !== r.after) b.after = fin.value;
        const res = await send(b);
        out.innerHTML = `<div class="okmsg" role="status">✅ ${esc(res.message)}</div>`;
        form.code.value = ''; form.before.value = '';
        if (onDone) onDone(res);
      } catch (ex) {
        out.innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`;
      }
    });
  }
}

/** Optional camera scan. Only offered when the browser has BarcodeDetector (Chrome on Android, Safari 17+). */
async function scanQr(onCode) {
  let stream, stopped = false;
  const el = openSheet(`<h2>Scan the pass</h2><video id="cam" playsinline muted style="width:100%;border-radius:16px;background:#000;margin-top:12px"></video><button class="btn btn-block mt" data-close>Cancel</button>`, { onClose: () => { stopped = true; if (stream) stream.getTracks().forEach((t) => t.stop()); } });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = el.querySelector('#cam');
    video.srcObject = stream;
    await video.play();
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    while (!stopped) {
      const codes = await det.detect(video).catch(() => []);
      if (codes.length) {
        const v = String(codes[0].rawValue || '').toUpperCase().replace(/^LH-/, '').replace(/[^A-Z0-9]/g, '');
        if (v) { stopped = true; stream.getTracks().forEach((t) => t.stop()); closeSheet(true); onCode(v); return; }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    closeSheet(true);
    toast('The camera is not available. Type the code instead.', 'bad');
  }
}
