/*
 * nav.js: makes the browser Back button move between screens of THIS site.
 * Every screen change (a tab, a sign-in screen, a pop-up sheet) adds one history entry, so Back goes to the
 * previous screen instead of leaving the site. Pages call initNav() once and navigate() for each screen change.
 */
let handler = () => {};
let sheetHook = () => false;
let sheetConsume = () => false;
let skip = 0;

export function initNav(initial, onRoute) {
  handler = onRoute;
  try { history.replaceState({ lh: 1, ...initial }, ''); } catch { /* ignore */ }
  window.addEventListener('popstate', (e) => {
    if (skip > 0) { skip -= 1; return; }
    if (sheetHook()) return; // Back closed a pop-up sheet
    let st = e.state && e.state.lh ? e.state : { lh: 1, ...initial };
    if (st.sheet) { st = { ...st, sheet: 0 }; try { history.replaceState(st, ''); } catch { /* ignore */ } }
    handler(st);
  });
}
/** Show a new screen and remember it in history. */
export function navigate(st) {
  // if a pop-up sheet is still open (or just closed), its history entry becomes this screen instead of adding another
  const consumed = sheetConsume();
  try { consumed ? history.replaceState({ lh: 1, ...st }, '') : history.pushState({ lh: 1, ...st }, ''); } catch { /* ignore */ }
  handler({ lh: 1, ...st });
}
/** Change the current screen without adding a history entry (for example right after signing in). */
export function replaceScreen(st) {
  try { history.replaceState({ lh: 1, ...st }, ''); } catch { /* ignore */ }
}
export const currentScreen = () => (history.state && history.state.lh ? history.state : {});

// used by ui.js for pop-up sheets
export function setSheetHook(fn, consume) { sheetHook = fn; if (consume) sheetConsume = consume; }
export function skipNextPop() { skip += 1; }
