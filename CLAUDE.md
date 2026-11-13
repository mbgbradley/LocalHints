# LocalHints: project context for Claude

LocalHints is a mobile-first website/PWA for hyper-local promotions delivered as **Apple/Google Wallet
passes**. Shoppers save a pass; the business can change it remotely (upgrade, pause, end, push a message)
because the pass is linked to the server by a unique ID. Data is still in-browser (no database or payments
yet), but admin sign-in is a real server-side flow.

LocalHints is its own project. It is unrelated to any other codebase.

Stack: Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS 3.4 · Leaflet (map).

## Routes

| URL | Who | Notes |
|---|---|---|
| `/` | Shoppers | `ConsumerFeed`: list and map of nearby deals, wallet, profile. No role switcher. |
| `/business` | Owners | `BusinessAuth` (sign up / sign in) until an account is signed in, then `BusinessDashboard` |
| `/admin` | Admin | `AdminGate` checks the server session, then `AdminPortal` |
| `/api/admin/{login,session,logout}` | | Route Handlers, nodejs runtime |

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Deploy: push to GitHub, import in Vercel, set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` (see
`.env.example`). Defaults are Admin / Admin and show a warning banner; change them before sharing a URL.
State lives in each browser's `localStorage` (key `localhints:v3`). "Reset demo data" is in the Admin portal.
Demo business login: see `data/seed.ts` (`DEMO_EMAIL`, `DEMO_PASSWORD`).

## Folder structure

```text
types/localhints.ts        Domain types + constants (TIER_LIMITS incl. dropsPerMonth, POINTS, PILOT_*)
data/seed.ts               buildSeed(now), conciergeDealFor(), demo account, CATEGORY_BENCHMARKS
lib/geo.ts                 haversine, formatMiles, jitter, browser geolocation, DEFAULT_CENTER
lib/store.tsx              StoreProvider + useStore(): ALL app state, rules and persistence
lib/auth.ts                Business password hashing (PBKDF2, WebCrypto), email/password validation
lib/adminAuth.ts           Server-only: credential check, signed session cookie, rate limit
lib/wallet.ts              applePassJson(), googleOfferObject(), WALLET_GEOFENCE_METERS
app/api/admin/*/route.ts   Admin login, session, logout
components/ui/             Sheet, AppBar, Icon, format.ts
components/consumer/       ConsumerFeed, DealMap, WalletPassModal, WalletPayloadPreview,
                           DealSpotterModal, ConsumerProfileDrawer
components/business/       BusinessAuth, BusinessDashboard, OnboardingWizard, ProCouponBuilder,
                           WalletPassPreview, CampaignAndBlasts (Neighborhood Drops + Pass Push),
                           AnalyticsAndBenchmarks, PrintableStandModal
components/admin/          AdminGate, AdminPortal
docs/WALLET_RADIUS_PUSH.md How radius drops and wallet passes work (read before building wallet features)
```

`components/ui/*`, `lib/auth.ts`, `lib/adminAuth.ts`, `lib/wallet.ts` and the admin/business auth components
are additions to the originally specified tree. `components/demo/RoleSwitcher` was removed.

## Auth model

- **Admin (real):** `POST /api/admin/login` compares to env vars with `timingSafeEqual`, sets an HMAC-signed
  HttpOnly, SameSite=Strict cookie `lh_admin` (8h). Rate limit: 5 failures per 15 min per IP (in-memory,
  best effort; use a shared store in production). `/admin` is noindex.
- **Business (prototype):** accounts live in the browser store; passwords hashed with PBKDF2-SHA256 via
  WebCrypto, which needs HTTPS or localhost. One account can own several businesses. Replace with
  server-side auth (Supabase Auth) when the store moves to a database.
- **Per-browser data caveat:** a signup on one device is invisible to an admin on another until Supabase.

## State architecture

- `lib/store.tsx` is the ONLY file that knows where data lives. Components call `useStore()` and never
  touch `localStorage`.
- One `AppState` object (`types/localhints.ts`, `version: 3`). Actions read the latest state from a ref,
  validate, then `commit()`. Validated actions return `Result<T>` so the UI can show the error inline.
- Pure selectors are exported from the store (`isDealLive`, `passStatus`, `isPassUpgraded`,
  `effectiveTier`, `limitsFor`, `dealsThisMonth`, `savesThisMonth`, `passHolders`, ...). Put new business
  logic there so a server can reuse it.
- Pass state is derived, not stored: `passStatus(deal, pass, now)` returns
  `active | scheduled | paused | complete | expired | voided`. Ending/pausing a deal therefore changes every
  holder's pass instantly, mirroring a Wallet pass update. Consumer-facing "lock screen" messages are
  stored in `state.notifications` and shown under Wallet → Wallet updates.

### Swapping in Supabase + Stripe + real Wallet passes

Change only `lib/store.tsx`: replace the action bodies with API calls and load initial state from the
server. Types map 1:1 to tables (`accounts`, `businesses`, `deals`, `passes`, `spotted_deals`, `pushes`, `drops`). Replace
`haversineMiles` filtering with PostGIS `ST_DWithin`. `upgradeTier` becomes Stripe Checkout + webhook.
Real Wallet (see `docs/WALLET_RADIUS_PUSH.md`): sign `.pkpass` / Google Wallet objects server-side; the pass `code`/`referralCode` is the
server key; `endDeal`, `setDealStatus`, `saveViaReferral` and `sendPassPush` become pass-update pushes.

## Business rules (enforced in the store, mirrored in the UI)

**Plans (`TIER_LIMITS`)**

| | Free Starter | Pro ($29/mo, $290/yr = 2 months free) |
|---|---|---|
| Deals | 2 published per calendar month | unlimited |
| Wallet saves | 50 per calendar month (all deals combined); at the cap, new saves are refused | unlimited |
| Deal types | % off, $ off | + BOGO (buy X get Y), free item, bundle price |
| Builder | basics only; 7-day fixed run, QR redemption, default color | all five parameter groups (below) |
| Pass Push | locked | yes |
| Neighborhood Drops | locked (0) | 4 per calendar month |
| Funnel + local benchmarks | locked (blurred) | yes |

Drafts do not count toward the deal quota; publishing does.

**Pilot:** `PILOT_SLOTS` = 5 businesses get Pro features free for `PILOT_DAYS` = 60 (`pilotEndsAt`).
`effectiveTier()` returns `pro` while the pilot is active, then falls back to `tier`. Admin enrolls/ends
pilots. Always use `limitsFor(biz, now)` instead of reading `biz.tier` directly.

**Pro Coupon Builder, 5 groups:** (1) Offer structure: discount type, minimum spend, single-use vs
3/5/10-visit stamp card. (2) Viral & loop: share-to-upgrade (base value → upgraded value after 1/2/3
friend saves; percent/$ deals only, upgraded must exceed base), Main Street Loop partner (an approved,
different-category neighbor). (3) Time & scarcity: fixed date (≤90 days), rolling timer (hours after
saving), weekly recurring window (days + hours, "slow-hours recycling"), first-N quantity cap.
(4) Branding: hex brand color tints the whole card; logo is the business emoji (no image upload yet).
(5) Redemption: dynamic QR, POS promo code, or cashier tap; per-customer limit (once/weekly/unlimited).
Free tier gets these reset to defaults by `createDeal` even if the UI is bypassed.

**Share-to-upgrade:** each pass has a `referralCode` (link `localhints.com/p/<code>`). When a friend saves
through it (`saveViaReferral`), the source pass's `friendSaves` increments. Once `friendSaves >=
friendsNeeded`, `isPassUpgraded` is true: the pass shows the upgraded label, the QR value changes, and a
"Your friend saved the deal! … upgraded to 25% OFF" wallet update is queued. Friend saves count toward the
business's monthly save cap. The consumer UI has a "pretend a friend just saved it" demo button.

**Remote control:** `setDealStatus` pauses/resumes (passes show "Paused by merchant", resume reactivates
existing passes). `endDeal` voids permanently ("Offer ended by merchant", pass moves to Expired Passes).
Recurring deals are hidden from "Nearby" outside their window and shown under "Opens soon".

**Redemption:** the business enters the pass code (Overview → Redeem a pass) or, for `tap` deals, the
consumer taps in their wallet. Stamp cards add one stamp per redemption and complete at N. Single-use
`once` passes complete on first redemption; `weekly` blocks a second redemption within 7 days. Expired,
paused, voided, out-of-window and completed passes cannot be redeemed.

**Pass Push (Pro):** 10 to 100 chars, delivered to every holder of an active/scheduled/paused pass. Free to
deliver (Wallet update, not SMS). The demo consumer sees it under Wallet updates if they hold a pass.

**Onboarding:** registering creates a `pending` Free business plus a "concierge" draft deal
(`conciergeDealFor`, templated by category). The owner previews it on Overview and taps "Approve & go
live" (needs admin approval first). Admin approves/suspends businesses; pending or suspended businesses
cannot publish and their deals are hidden.

**Analytics:** funnel is Views → Wallet saves → Friend shares → Redemptions (a pass counts as redeemed
once `stamps > 0`). Benchmarks compare against static `CATEGORY_BENCHMARKS`. Revenue is an estimate from
`AVG_TICKET`.

**Points:** claim +5, redeem +20, approved community tip +25 (demo consumer's own tips only).
**Community tips ("Spot a deal"):** submitted `pending`, admin approves/rejects, approved tips show as
"Spotted by neighbors" and cannot be claimed.

**Neighborhood Drop (Pro):** a radius alert (0.5 to 5 mi from the business) about one live deal; message 10 to
100 chars; needs an approved business. `estimateDropReach` simulates the audience. The demo shopper receives
it only if `notifyNearby` is on and they are within the radius. A drop alerts people; they still tap to add
the pass to their wallet (platforms forbid silent insertion). Details in `docs/WALLET_RADIUS_PUSH.md`.

## Known prototype shortcuts (not bugs)

- The QR is a decorative deterministic pattern, not scannable. Replace `QrPattern` with a real QR lib.
- Apple/Google Wallet buttons show the generated payload (`WalletPayloadPreview`); passes are unsigned and
  nothing is added to a real wallet. Real passes need Apple/Google accounts, signing keys and a server.
- Pass Push, Neighborhood Drops and wallet notifications are simulated in-app; nothing reaches devices.
- Stripe checkout, hero photo upload and the Counter Stand PDF are stand-ins (the stand uses the browser
  print dialog).
- Concierge drafts come from category templates. Addresses are not geocoded (the signup uses a location
  button or a spot in the demo district).
- Map tiles (CARTO Positron) need internet. "Use my location" can empty the feed because sample shops are in
  a fictional district; "Demo district" resets it.
- No service worker yet (installable, not offline). The code was written without running `npm install` or a
  build in the authoring environment: run `npm run typecheck && npm run build` first.

## Conventions

- Mobile-first at 390px. Consumer view is a `max-w-[430px]` column with sticky bottom nav and bottom
  sheets; Business/Admin use `max-w-7xl` multi-column layouts from `lg` up.
- Tailwind only (neutral palette plus brand color `hint-*`). Use complete class strings. Per-deal brand colors are applied
  with inline `style` (arbitrary hex values cannot be Tailwind classes).
- Printing: only `.print-area` prints; add `no-print` to controls.
- Types in `types/localhints.ts`, seed in `data/seed.ts`, rules in the store; components stay
  presentational plus local form state. Never leave TODO stubs.
