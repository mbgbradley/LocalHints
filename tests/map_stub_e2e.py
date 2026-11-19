# Offline check of the map popup heart + red pin outline, using a tiny stand-in for Leaflet (the real one needs the internet).
import sys
from playwright.sync_api import sync_playwright
STUB = """
window.L = (() => {
  const mk = (o) => o;
  class Marker { constructor(ll, o) { this.ll = ll; this.o = o; this.html = ''; }
    addTo(g) { g.items.push(this); return this; }
    bindPopup(h) { this.html = h; return this; }
    getLatLng() { return { lat: this.ll[0], lng: this.ll[1] }; }
    openPopup() { let p = document.getElementById('stubpop'); if (!p) { p = document.createElement('div'); p.id = 'stubpop'; document.body.appendChild(p); } p.innerHTML = this.html; }
    bindTooltip() { return this; } }
  const group = () => ({ items: [], addTo() { window.__layer = this; return this; }, clearLayers() { this.items = []; }, eachLayer(f) { this.items.forEach(f); } });
  return { map: () => ({ setView() { return this; }, fitBounds() {} }), tileLayer: () => ({ addTo() {} }), layerGroup: group,
    divIcon: (o) => o, marker: (ll, o) => new Marker(ll, o.icon ? o : o), circleMarker: () => new Marker([0, 0], {}) };
})();
"""
B = 'http://localhost:8123/'
fails = []
def check(n, c):
    print(('ok   ' if c else 'FAIL ') + n)
    if not c: fails.append(n)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = br.new_context(viewport={'width': 390, 'height': 780}).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/leaflet.js', lambda r: r.fulfill(content_type='application/javascript', body=STUB))
    pg.route('**/leaflet.css', lambda r: r.fulfill(content_type='text/css', body=''))
    pg.goto(B + 'index.html'); pg.wait_for_selector('.deal')
    pg.click('[data-tab=map]'); pg.wait_for_timeout(800)
    pins = lambda: pg.evaluate("()=>window.__layer.items.filter(m=>m.o&&m.o.icon&&m.o.icon.html).map(m=>m.o.icon.html.includes('#e11d48'))")
    check('pins start white', pins() and not any(pins()))
    pg.evaluate("()=>window.__layer.items.find(m=>m.html).openPopup()")
    check('popup has a heart per deal', pg.locator('#stubpop [data-popheart]').count() >= 1)
    first = pg.locator('#stubpop [data-popheart]').first; did = first.get_attribute('data-popheart')
    first.click(); pg.wait_for_timeout(600)
    check('pin outline turns red', any(pins()))
    check('popup heart now red', pg.locator('#stubpop [data-popheart="%s"].on' % did).count() == 1)
    pg.locator('#stubpop [data-popheart="%s"]' % did).click(); pg.wait_for_timeout(600)
    check('second tap: outline back to white', not any(pins()))
    check('popup heart unfilled again', pg.locator('#stubpop [data-popheart="%s"].on' % did).count() == 0)
    pg.locator('#stubpop [data-popheart="%s"]' % did).click(); pg.wait_for_timeout(600)
    pg.locator('#stubpop [data-popdeal="%s"]' % did).click(); pg.wait_for_timeout(500)
    check('tapping a saved deal in the popup opens the pass', pg.locator('.sheet .code, .sheet .pass').count() >= 1)
    br.close()
print('page errors:', errs[:3]); check('no page errors', not errs)
sys.exit(1 if fails else 0)
