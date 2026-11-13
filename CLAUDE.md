# LocalHints: project context for Claude

Mobile-first PWA prototype: hyper-local wallet passes and community deals. Three demo personas
(Consumer, Business, Admin) share one in-browser data store. No backend, no auth, no payments yet.

Stack: Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS 3.4. Zero other runtime deps.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000, open on your phone via your LAN IP to test mobile
npm run typecheck  # tsc --noEmit
npm run build
```

Deploy: push to GitHub, import the repo in Vercel, accept defaults. No env vars needed.
State lives in each browser's `localStorage` (key `localhints:v1`); "Reset demo data" is in the Admin role.

## Folder structure

```text
types/localhints.ts        Domain types + business-rule constants (TIER_LIMITS, POINTS, ...)
data/seed.ts               buildSeed(now): 8 businesses, 11 deals, passes, tips, a blast. Also benchmarks.
lib/geo.ts                 haversine, formatMiles, jitter, browser geolocation, DEFAULT_CENTER
lib/store.tsx              StoreProvider + useStore(): ALL state, rules and persistence
app/layout.tsx             Root layout, PWA metadata, wraps <StoreProvider>
app/page.tsx               Renders RoleSwitcher + the view for state.role
app/globals.css            Tailwind layers, scrollbar/safe-area utilities, @media print rules
public/manifest.json       PWA manifest (icon in public/icon.svg)
components/ui/Sheet.tsx    Bottom sheet (phone) / centered dialog (md+)
components/ui/format.ts    dealLabel, timeLeft, relativeTime, suggestCode, THEMES
components/demo/           RoleSwitcher (sticky top bar, demo only)
components/consumer/       ConsumerFeed, WalletPassModal, DealSpotterModal, ConsumerProfileDrawer
components/business/       BusinessDashboard, OnboardingWizard, ProCouponBuilder, WalletPassPreview,
                           CampaignAndBlasts, AnalyticsAndBenchmarks, PrintableStandModal
components/admin/          AdminPortal
```

`components/ui/*` is the only addition to the originally specified tree (shared sheet + formatters).

## State architecture

- `lib/store.tsx` is the ONLY file that knows where data lives. Components call `useStore()` and never
  touch `localStorage`.
- State is one `AppState` object (see `types/localhints.ts`). Actions read the latest state from a ref,
  validate, then `commit()` a new object. Validated actions return `Result<T>`
  (`{ ok: true, data } | { ok: false, error }`) so the UI can show the error inline.
- The provider renders a splash until it has hydrated from `localStorage` (avoids SSR mismatches).
  `now` ticks every 30 s so countdowns stay fresh.
- Pure selectors are exported from the store (`isDealLive`, `countActiveDeals`, `blastsThisMonth`,
  `claimsFor`, `estimateReach`). Keep new business logic there.

### Swapping in Supabase + Stripe

Change only `lib/store.tsx`: replace the bodies of the actions in `actions` with API calls, load initial
state from the server instead of `buildSeed`, and replace `haversineMiles` filtering in the feed with a
PostGIS `ST_DWithin` query exposed through the store. Types in `types/localhints.ts` map 1:1 to tables
(`businesses`, `deals`, `passes`, `spotted_deals`, `blasts`, `consumers`). `upgradeTier` becomes a Stripe
Checkout/Customer Portal redirect plus a webhook that flips `tier`.

## Business rules (enforced in the store, mirrored in UI)

Roles are picked from the top bar. The Business role plays `owner-demo`, who owns `biz-bean` (Pro) and
`biz-sunny` (Free). The Consumer role plays `consumer-demo` ("Alex").

**Monetization (`TIER_LIMITS` in `types/localhints.ts`)**

| | Free | Pro ($29/mo) |
|---|---|---|
| Active deals (unpaused + unexpired) | 1 | 25 |
| Deal types | percent off, dollars off | + BOGO, free gift |
| Duration | fixed 7 days (`FREE_DEAL_DURATION_DAYS`) | 1 to 30 days |
| Claim cap, pass color, custom code | no | yes |
| Neighborhood blasts | none | 4 per calendar month, 10 to 140 chars |
| Benchmarks vs category average | locked (blurred) | yes |

**Business lifecycle:** registering creates a `pending` Free business. Pending or suspended businesses
cannot publish deals or send blasts, and their deals are hidden from consumers. An admin approves,
suspends or reinstates. Admin can also flip a business's tier (simulates Stripe).

**Deals:** a deal is live for consumers only if it is `live`, not expired, under its claim cap, and its
business is `approved` (`isDealLive`). Codes are 3 to 12 uppercase letters or digits.

**Passes:** one pass per deal per consumer, ever. The pass code is `<dealCode>-<4 chars>`. A pass is
redeemed either from the consumer wallet ("Cashier: redeem" with confirmation) or by the business typing
the code in the dashboard's "Redeem a pass" box (`redeemByCode`, scoped to that business's deals).
Expired or already-redeemed passes cannot be redeemed.

**Points (`POINTS`):** claim +5, redeem +20, an approved community tip +25 (only for tips the demo
consumer submitted).

**Community tips ("Spot a deal"):** consumers submit tips as `pending`; admin approves or rejects.
Approved tips appear in the feed as "Spotted by neighbors" with a one-tap "Still valid" upvote. Tips
cannot be claimed or redeemed and are not verified by the business.

**Feed:** live deals within `consumer.radiusMiles` (0.5 to 10 mi), favorite categories first, then
nearest. "Ending soon" is deals expiring within 3 days. If the user taps "Use my location", real
coordinates are far from the fictional demo district and the feed empties: the empty state and the
profile drawer both offer "Demo district" to jump back (`DEFAULT_CENTER` in `lib/geo.ts`).

## Known prototype shortcuts (do not mistake for bugs)

- The QR graphic is a deterministic decorative pattern, not a scannable QR. Swap `QrPattern` in
  `WalletPassPreview.tsx` for a real QR library when pass URLs exist.
- "Add to Apple/Google Wallet" buttons only show a toast (real passes need signing keys and a server).
- Blast "reach" is a formula (`estimateReach`), not a real audience count. Nothing is actually pushed.
- Business addresses are not geocoded; new businesses are placed near the demo district center, or at
  the user's real location if they choose that.
- Analytics "revenue influenced" uses assumed ticket sizes (`AVG_TICKET`), and benchmarks use static
  numbers (`CATEGORY_BENCHMARKS`), both in `data/seed.ts`.
- No service worker yet, so the app is "Add to Home Screen" capable but not offline.
- Auth is simulated by the role switcher. Anything role-gated must move to server-side checks later.

## Conventions

- Mobile-first at 390px. Consumer view is a max-w-[430px] column with a sticky bottom nav and bottom
  sheets; Business and Admin use `max-w-7xl` multi-column layouts from the `lg` breakpoint up.
- Tailwind only (brand color is `hint-*` in `tailwind.config.ts`). Use complete class strings, never
  string-built class names, so Tailwind can detect them.
- Printing: elements inside `.print-area` are the only things printed; add `no-print` to controls.
- Keep types in `types/localhints.ts`, seed data in `data/seed.ts`, rules in the store. Components stay
  presentational plus local form state.
- Never leave TODO stubs; prefer small, complete features.
