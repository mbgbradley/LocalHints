# LocalHints: project context for Claude

LocalHints is a promotional website: shoppers save hyper-local deals as Apple/Google Wallet passes, businesses
create and manage the deals, and an admin oversees the platform. It is its own project (unrelated to any other
codebase). The owner edits files in the GitHub web interface, so the site is **plain static HTML, CSS and
JavaScript** with no build step and no npm dependencies.

## Architecture

```
docs/                 Static site, served by GitHub Pages (Settings > Pages > main > /docs)
  index.html          Shopper side:  discover list + map, Main Street Loop, wallet, alerts (PWA)
  business.html       Merchant side: sign up, Free/Pro, deals, team (redeem agent), reach, Loop-In, insights (graphs), account (locations)
  admin.html          Admin side:    clickable count tiles, business search + inline details, live deals, activity log, pilot, spotted deals, settings
  staff.html          Team member (clerk) page: join from an invite, redeem passes. No dashboard.
  css/styles.css      All styling (CSS variables, phone first, dashboard layout from 900px)
  js/config.js        window.LH_CONFIG.API_BASE: "" = demo mode, "https://....workers.dev" = live mode
  js/engine.js        ALL business rules + the whole HTTP-style API. Single source of truth.
  js/seed.js          Demo data (all demo logins use password demo1234)
  js/api.js           Pages call api.get/post. Routes to the in-browser engine (demo) or the Worker (live)
  js/ui.js            Escaping, dates, history-aware sheets, toasts, QR (CDN), Leaflet loader, light/dark theme, install-to-home-screen, settings sheet
  js/nav.js           Back-button support: navigate()/replaceScreen() add history entries; sheets reuse them
  js/icons.js         Single-color SVG icon set (currentColor)
  js/charts.js        Hand-built SVG line + paired-bar charts (colors --s1..--s5, legend toggles, tooltip, table view)
  js/redeem-ui.js     Redeem form shared by the owner and staff pages (code + purchase total -> after-deal price -> confirm)
  js/consumer.js, business.js, admin.js, staff.js   One script per page
tests/                engine.test.mjs (Node, in-memory store) and browser_e2e.py (Playwright + Chrome; serve docs/ on :8123 first)
  sw.js, manifest*.webmanifest, icon*     PWA files. One manifest + icon per page (business/admin/staff) so each installs as its own home-screen icon
worker/               Cloudflare Worker: index.js wraps engine.js and stores state in KV (binding LH_KV)
  worker-single-file.js   GENERATED paste-in copy (engine + seed + index). Regenerate after engine/seed changes.
  wrangler.toml
guides/               STEP_BY_STEP.md (beginner), CLOUDFLARE_WORKER.md (settings + API), WALLET_RADIUS_PUSH.md
```

**The key idea:** `engine.js` is one ES module with `handle(ctx, req) -> {status, body}`. In demo mode the
browser imports it and stores state in `localStorage`. In live mode the Worker imports the same file and stores
state in KV. Change a rule once, it changes everywhere. Never duplicate business logic in the page scripts;
pages only render and call the API.

State is one JSON document (`emptyState()` in engine.js): businesses, deals, passes, events, loops, drops,
subscribers, alerts, tips, redemptions (the sales log: before/after amount, staff, location), staff, rate. Businesses may carry `locations` (extra shops), `resetNonce`, `pwChangedAt`; state may carry `adminCred` and `adminResetNonce`. Logos are separate blobs (`logo:<bizId>`). A KV document is fine for a pilot;
the upgrade path is D1 or a Durable Object (only the store and load/save in `handle` change).

## Roles and auth

- **Shopper:** anonymous. A random `consumerId` is kept in localStorage. No login.
- **Business:** one account = one business. Email + password (PBKDF2-SHA256, 100k rounds, the Workers max).
  Bearer token (HMAC-signed, 12h) kept in localStorage. 5 failed logins per 15 min per email+IP.
- **Admin:** username/password from Worker settings `ADMIN_USERNAME` / `ADMIN_PASSWORD`, default **Admin / Admin**
  (a red warning shows until both are set). Bearer token (8h) in sessionStorage. 5 failures per 15 min per IP.
- **Staff:** invited by a business (QR / SMS link / email link; single-use token, 7 days). Accepting gives a 14-day
  Bearer token (role `staff`) that stops working the moment staff is suspended/removed or the business is not approved.
- **Password reset:** business `POST /api/business/forgot|reset`, admin `POST /api/admin/forgot|password-reset`. Links are
  HMAC-signed, expire in 1 hour and carry a nonce that is cleared after use (single use; a new request voids older links).
  The link host comes from `SITE_URL` (never from the request). Responses are the same whether the account exists or not.
  Resetting invalidates older business tokens (`iat` < `pwChangedAt`). An admin reset stores `adminCred` in state, which
  overrides `ADMIN_PASSWORD`. In demo mode the response includes `demoLink` because no email is sent.
- **Back button:** every screen change goes through `nav.navigate()`; a sheet owns exactly one history entry.
- All user text is escaped with `esc()` before it goes into `innerHTML`. Keep doing this.

## Business rules (all in engine.js)

| | Free Starter | Pro ($29/mo, $290/yr) |
|---|---|---|
| Published deals | 2 per calendar month | unlimited |
| Wallet saves | 50 per month across the business | unlimited |
| Deal types | % off, $ off | + BOGO, free item, bundle |
| Run length | fixed 7 days from start date | custom end date, up to 90 days |
| Extras | none (reset by the server even if the form is bypassed) | min spend, claim cap, punch card (3/5/10), pass color, share-to-upgrade |
| Logo | LocalHints logo on deals | own logo upload (256px PNG, under ~150KB) |
| Neighborhood Drops / Pass Push | no | 4 drops per month, Pass Push |
| Full funnel, Neighborhood Benchmarks, Compare past deals | locked (totals only) | yes |
| Loop-In | can accept, cannot propose | propose + accept |

- **Pilot:** 5 slots, 60 days of Pro for approved businesses. `effectiveTier()` returns `pro` during a pilot. Always
  use `effectiveTier` / `limitsFor`, never `biz.tier` directly, for feature checks.
- **First deal:** every new business gets a "concierge" draft (`makeConcierge`, by category). The owner can **edit**
  it with the Free options (title, details, % or $ off, value, start date) and publish it once approved.
- **Statuses:** business `pending | approved | suspended | closed`. Deal `draft | live | paused | suspended | ended`.
  Admin suspend sets live/paused deals to `suspended` (remembering `suspendedFrom`); reinstate restores them.
  Closing ends all deals. Admin filter "all deals suspended or paused" ignores drafts and ended deals.
- **Address check:** `POST /api/address/verify` and signup call Google Geocoding (`GOOGLE_MAPS_API_KEY`). A match must be
  street level. The business is stored with Google's formatted address, `placeId`, lat/lng and
  `addressVerified: true`. Without a key, signup still works with a browser location and is flagged "unverified"
  in Admin. Other businesses at the same `placeId` are flagged "shared address".
- **Loop-In (Pro):** A proposes (own deal + partner business + reward text), B accepts or declines (free). When a
  customer's first redemption of A's deal happens, a `loop` pass for B's reward is created (valid 14 days) and the
  shopper is alerted. B redeems it by code. One active/pending Loop-In per deal.
- **Share-to-upgrade:** pass `referralCode`; a friend who saves through `?deal=ID&ref=CODE` bumps `friendSaves`;
  enough friends upgrades the label and sends an alert.
- **Drops:** radius 0.5 to 5 miles from the business to opted-in shoppers' rounded (about 1 km) location. They
  receive an in-app alert, then add the pass (Apple/Google never allow silent insertion).
- **Redeem:** by pass code (QR content is `LH-<code>`). Min-spend deals ask the owner to confirm. Stamps add up.
- **Activity log:** every business action writes an event (`EVENT_LABELS` in engine.js): signup, approved,
  suspended, reinstated, closed, reopened, login, deal created/published/edited/status, plan changed, upgrade
  requested, pilot started/ended, Loop-In events, drop, push, redeem, profile, logo. Admin shows signup date,
  approval date, last login, closed date and the full timeline per business.

### Why a business logs in (use these to guide features)

Check how a deal is doing; redeem a customer's pass at the counter; edit or publish the suggested first deal;
create a new deal for a slow day; pause, resume or end a deal; answer a Loop-In request from a neighbor; send a
Neighborhood Drop or Pass Push; read the funnel, benchmarks and past-deal comparison; upgrade, downgrade or
see the pilot end date; update hours/address/logo; see why they were suspended or when they were approved;
close the account.

## V6 additions (shopper filters, heart, business reports, team cancel)

- **Shopper list:** no search box or chips. Three custom popover menus (`.fbar/.fbtn/.fmenu` in consumer.js): **Deal Distance**
  (0.5 to 50 miles, needs a location), **Deal Type** (All + 8 categories), **Sort Deals** (% off, $ off, ending; ▲ low to high,
  ▼ high to low; deals that never end sort last on Ending ▲ and first on Ending ▼). State is `S.cat`, `S.sort`, `S.radius`.
  The three buttons are equal width (CSS grid); the Map tab shows only distance + type.
- **Heart:** bottom right of every deal card (`dealCard`). One tap calls the same claim route as "Save", so the pass lands in the
  **LocalHints wallet** (the Wallet tab). It cannot add to Apple/Google Wallet silently (platforms require a user tap), so
  that stays a button on the pass. Filled red = already saved; tapping a filled heart opens the pass. The card is a
  `div[role=button]` because a button may not contain a button.
- **Wallet tab = saved passes** (in LocalHints). Adding to the phone's wallet is a separate optional step.
- **Reports (`GET /api/business/report?kind=live|published|saves|redemptions&from&to`):** live deals and published-this-month
  sorted oldest first; saves this month with `savedAt`, `shared`, `sharedAt`, `friendSaves`, sorted oldest saved first;
  redemptions per deal for [from,to) sorted most to least redeemed. Period keys used by the UI (`PERIODS` in business.js):
  past week = last 7 days, previous week = the 7 days before, past month = last 30 days, previous month = the 30 before.
  The Deals page period filter shows deals that were **running at any time** in the period (drafts only under All).
  Overview tiles are buttons: `navigate({tab:'overview', list:kind})`, drawn by `vList`.
- **Redemption log:** `GET /api/business/redemptions?staffId=owner|<id>&from&to` (newest first, max 300) shows who entered each one.
- **Staff statuses:** `invited | accepted | suspended | cancelled` (legacy `removed` is hidden). Actions on
  `POST /api/business/staff/:id`: `suspend | reinstate | cancel` (alias `remove`) `| reinvite | new_device | location`.
  `cancel` keeps the row and all stats (audit trail), kills the invite and bumps `tokenVer` so the old phone token stops
  working immediately. `new_device` (lost phone) bumps `tokenVer` and issues a fresh invite for the same person.
  `reinvite` on a cancelled person makes a new invite. Cancelled people do not count toward the team limit.
- **Abuse flags (`staffRows`):** "High volume" = 5+ redemptions and at least 2x the average of everyone else; "Big discounts" =
  5+ redemptions and discounts above 35% of purchase totals. Only nudges, shown as ⚑ badges plus each person's share of all redemptions.
- **Share-to-upgrade:** `friendsNeeded` 1 to 10; `upgradedType` is `percent|amount` (defaults to the deal's type). Same type
  must be larger than the deal; a different type skips that check. `upgradedType(d)` is the helper. Also shared by Edit Deal.
- **Emoji icons:** any emoji is accepted. `firstEmoji()` keeps one whole grapheme (flags, family, skin-tone, ZWJ). The UI has
  `emojiFieldHtml/bindEmoji` in ui.js: a typed/pasted field plus a "Choose an emoji" panel. Used at signup and in the profile.
- **`POST /api/share`** records that a pass was shared (`sharedAt`).
- After engine/seed changes regenerate `worker/worker-single-file.js`; bump `CACHE` in `docs/sw.js` (now `localhints-v6`).
- `node --check file.js` treats files as CommonJS and misses ES-module template errors. Copy to a `.mjs` first, or open the page.

## Settings (Worker, not committed)

`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `ALLOWED_ORIGIN`, `SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`,
`ANTHROPIC_API_KEY`, `AI_MODEL`, `GOOGLE_MAPS_API_KEY`,
`GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY`, `ALLOW_SELF_UPGRADE`
(testing only). Details in `guides/CLOUDFLARE_WORKER.md`. Never commit secrets.

## Known shortcuts (not bugs)

- Apple Wallet: pass data is generated but there is no signed `.pkpass` yet. Google Wallet works once the three
  `GOOGLE_WALLET_*` settings exist (a signed Save link; the engine's JWT signing was tested with a generated key
  but not against Google's servers).
- Alerts (drops, pushes) are in-app only. Real web push, SMS and email are not built.
- Billing is not connected. On live, "Upgrade to Pro" becomes an `upgrade_requested` event for the admin; in demo
  mode it switches instantly.
- Single KV document (see above). Rate limits and events live in it too.
- QR codes and map tiles load from CDNs (qrcode-generator on cdnjs, Leaflet on unpkg, CARTO tiles); offline they
  fall back to showing the code / a message. No Subresource Integrity hashes yet.
- Camera QR scanning in redeem-ui uses the browser's BarcodeDetector (Chrome/Android, Safari 17+); untested on real devices. Typing the code always works.
- Email (Resend) and the Claude-written "What to try next" were tested with a mock `fetch` only, never against the real services.
- Limits that are my choices: Free 2 team members / 1 location, Pro 15 / 10; spotted deals live 30 days; reset links 1 hour.
- Redemption math: % off, $ off and bundle are exact; BOGO is estimated as half the purchase and free-item as purchase minus the item value unless the staff member types the amount actually charged.
- Spotted deals: the spotter gives a first name (required) and optional contact + consent; contact is only visible to admin.

## Conventions

- No build tools, no frameworks, no npm packages. ES modules, `async/await`, template strings.
- Phone first at 390px; dashboards use wider layouts from 900px. Light/dark is chosen in Settings (Light / Dark / Automatic) via `data-theme` on `<html>`; every page has an inline head script so there is no flash.
- After changing `engine.js` or `seed.js`, regenerate `worker/worker-single-file.js` (concatenate engine + seed +
  index, strip imports/exports) and bump `CACHE` in `docs/sw.js` when site files change.
- Test: `node tests/engine.test.mjs`; browser test: `cd docs && python3 -m http.server 8123` then `python3 tests/browser_e2e.py`.
- Never leave TODO stubs.

## V7 additions (Favorites)

- **Heart is a toggle** (`toggleHeart` in consumer.js): empty heart = `POST /api/claim` (pass goes to My Deals), red heart =
  `POST /api/unsave {dealId, consumerId}` (pass removed). A pass already used at the shop cannot be unsaved (400). Tapping the
  box itself (`openDeal`): saved deal opens its pass, otherwise the deal details.
- **Nav:** the old Wallet tab is now **Favorites** with a heart icon (tab id is still `wallet`, so `?tab=wallet` links keep working).
  The page title is **My Deals**.
- **Map:** a business pin gets a red outline when any of its deals is hearted (white otherwise). The Leaflet popup lists each
  deal with a heart (`.popheart`, ~30px, about the size of Leaflet's close X). Toggling redraws the pins and reopens the popup.
- Tests: `tests/map_stub_e2e.py` checks the popup heart and pin outline with a stand-in for Leaflet (the real library needs internet).

## V8 additions (spotted deals become first-class, zip location)

- **One list:** the Discover list holds real deals and spotted deals together (`filtered()` = `filteredDeals()` + `filteredTips()`,
  tips shaped by `tipAsItem`). There is no separate "Spotted by neighbors" section any more. The Map uses `filteredDeals()` only.
- **Buttons:** Deal Distance, Deal Type, Sort Deals, **Add Deal** in one equal-width row (`.fbar.four`; the Map shows two).
  Add Deal opens the tip form. Sorts: **Newest (default)**, Oldest, % Off ▲▼, $ Off ▲▼, Ending ▲▼. Menu text has no parentheses.
  Newest/Oldest use `startsAt` for deals and `publishedAt` (approval time) for spotted deals. On the % / $ sorts spotted deals sort after
  real deals (they have no % or $). Ending uses the 30-day spotted-deal life. Ties keep list order.
- **Spotted deal hearts:** `POST /api/tips/favorite {tipId, consumerId, on?}` toggles `state.tipFavs` (`{tipId, consumerId, at}`).
  `GET /api/deals?consumerId=` marks each tip `favorite`. No pass is created. My Deals lists them under "Spotted deals you hearted".
- **Tip form fields:** business name, address, **category (required, same ids as business categories)**, note, optional contact + consent,
  optional **photo** (`<input capture="environment">`, shrunk in the browser to about 160 KB, `data:image/...` only). No spotter name any more
  (`spotterName` is ignored). Tips store `lat/lng` only if the Google address check is configured and finds the address; tips with no
  position stay visible when a distance is chosen (their distance is unknown).
- **Never public:** `tipPublic()` leaves out photo, contact and device details. Admin (`GET /api/admin/tips`) gets photo, device and `flags`.
- **Device check:** a website cannot read a MAC address (browsers and phones block it). We save `device = {id, hash, ip, ua, screen, tz, lang, platform}`:
  `id` is the browser's saved shopper id, `hash` is a 16-character fingerprint (`deviceHash`), `ip` comes from the Worker (`CF-Connecting-IP`),
  `ua` from the `User-Agent` header (the Worker passes it). Admin flags: 3+ tips from one device or fingerprint, 5+ from one network,
  or a device that already had a tip rejected. Only the newest 60 tips keep their photo (`MAX_TIP_PHOTOS_KEPT`) so stored data stays small.
- **ZIP location:** "Where are you?" has a 5-digit numeric box and "Use my zip code". `lookupZip()` calls the free `api.zippopotam.us` from the
  browser (US only, no key). The result becomes `S.pos` (`label: 'ZIP 10001'`), deals re-sort by distance from that point, and the Map recenters on it.
- Tests: `tests/engine.test.mjs` (76 checks) and `tests/browser_e2e.py` cover all of the above; the ZIP service is mocked in the browser test.
