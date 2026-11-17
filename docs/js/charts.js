/*
 * charts.js: small hand-built SVG charts (no library). Built to the LocalHints data-viz rules:
 * one axis, thin 2px lines, categorical colors in a fixed order (--s1..--s5 in styles.css, with their own dark-mode steps),
 * a legend you can click to hide a series, a hover tooltip, and a "Show as table" view for screen readers and printing.
 */
import { esc } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const MD = (ms) => { const d = new Date(ms); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** series: [{ id, name, values:number[], color:1..5 }]  days: number[] (ms). fmt formats a value for people. */
export function lineChart(host, { days, series, fmt = (n) => String(Math.round(n * 100) / 100), label }) {
  const hidden = new Set();
  let asTable = false;
  host.classList.add('chart');
  const draw = () => {
    const vis = series.filter((s) => !hidden.has(s.id));
    host.innerHTML = `
      <div class="legend" role="group" aria-label="Show or hide lines">${series.map((s) => `<button type="button" class="lg" aria-pressed="${!hidden.has(s.id)}" data-sid="${esc(s.id)}"><i style="background:var(--s${s.color})"></i>${esc(s.name)}</button>`).join('')}
        <span class="grow"></span><button type="button" class="link small" data-view>${asTable ? 'Show chart' : 'Show as table'}</button></div>
      ${asTable ? tableHtml() : '<div class="plot"></div>'}`;
    host.querySelectorAll('[data-sid]').forEach((b) => (b.onclick = () => { hidden.has(b.dataset.sid) ? hidden.delete(b.dataset.sid) : hidden.add(b.dataset.sid); draw(); }));
    host.querySelector('[data-view]').onclick = () => { asTable = !asTable; draw(); };
    if (!asTable) plot(host.querySelector('.plot'), vis);
  };
  const tableHtml = () => `<div class="tablewrap" style="max-height:260px;overflow:auto"><table class="t"><caption class="hide">${esc(label || 'Chart data')}</caption><thead><tr><th>Day</th>${series.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${days.map((d, i) => `<tr><td>${MD(d)}</td>${series.map((s) => `<td>${esc(fmt(s.values[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  function plot(el, vis) {
    const W = Math.max(280, el.clientWidth || host.clientWidth || 320), H = 220;
    const m = { l: 40, r: 12, t: 10, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = niceMax(Math.max(0, ...vis.flatMap((s) => s.values)));
    const x = (i) => m.l + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / max) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${label || 'Line chart'}. Use Show as table for the numbers.`);
    svg.style.cssText = 'width:100%;height:auto;display:block;touch-action:pan-y';
    let h = ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end" class="axis">${esc(fmt(t))}</text>`).join('');
    const xi = [0, 7, 14, 21, days.length - 1].filter((v, i, a) => v < days.length && a.indexOf(v) === i);
    h += xi.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}" class="axis">${MD(days[i])}</text>`).join('');
    h += vis.map((s) => `<polyline fill="none" stroke="var(--s${s.color})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`).join('');
    h += '<g class="hover" style="display:none"><line class="cross" y1="' + m.t + '" y2="' + (m.t + ih) + '"/></g>';
    svg.innerHTML = h;
    el.innerHTML = '';
    el.style.position = 'relative';
    el.appendChild(svg);
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.style.display = 'none';
    el.appendChild(tip);
    const g = svg.querySelector('.hover');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(days.length - 1, Math.round(((px - m.l) / iw) * (days.length - 1))));
      g.style.display = '';
      g.querySelector('.cross').setAttribute('x1', x(i)); g.querySelector('.cross').setAttribute('x2', x(i));
      g.querySelectorAll('circle').forEach((c) => c.remove());
      for (const s of vis) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', x(i)); c.setAttribute('cy', y(s.values[i])); c.setAttribute('r', 4.5);
        c.setAttribute('fill', `var(--s${s.color})`); c.setAttribute('class', 'pt');
        g.appendChild(c);
      }
      tip.innerHTML = `<b>${MD(days[i])}</b>${vis.map((s) => `<div class="row" style="gap:6px"><i class="sw" style="background:var(--s${s.color})"></i><span>${esc(s.name)}</span><b style="margin-left:auto">${esc(fmt(s.values[i]))}</b></div>`).join('')}`;
      tip.style.display = '';
      const left = (x(i) / W) * r.width;
      tip.style.left = Math.min(Math.max(left + 10, 4), r.width - tip.offsetWidth - 4) + 'px';
      tip.style.top = '6px';
    };
    const leave = () => { g.style.display = 'none'; tip.style.display = 'none'; };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', leave);
    if (!vis.length) el.insertAdjacentHTML('beforeend', '<p class="hint center">Turn a line back on in the legend.</p>');
  }
  draw();
  if (window.ResizeObserver) {
    let w = host.clientWidth;
    new ResizeObserver(() => { if (host.isConnected && Math.abs(host.clientWidth - w) > 20) { w = host.clientWidth; draw(); } }).observe(host);
  }
}

/** Grouped horizontal bars: rows [{ label, a, b }], two measures (a = "before", b = "after"). */
export function pairBars(host, { rows, aName, bName, fmt }) {
  host.classList.add('chart');
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  host.innerHTML = `<div class="legend"><span class="lg static"><i style="background:var(--s1)"></i>${esc(aName)}</span><span class="lg static"><i style="background:var(--s2)"></i>${esc(bName)}</span></div>
    <div class="hbars">${rows.map((r) => `<div class="hb"><div class="small hb-l">${esc(r.label)}</div>
      <div class="hb-bars"><div class="hb-bar" style="width:${Math.max(2, (r.a / max) * 100)}%;background:var(--s1)"></div><span class="small">${esc(fmt(r.a))}</span></div>
      <div class="hb-bars"><div class="hb-bar" style="width:${Math.max(2, (r.b / max) * 100)}%;background:var(--s2)"></div><span class="small">${esc(fmt(r.b))}</span></div></div>`).join('')}</div>`;
}
