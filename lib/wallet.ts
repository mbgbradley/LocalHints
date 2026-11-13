/**
 * Wallet payload builders (Apple Wallet + Google Wallet).
 *
 * These pure functions turn a LocalHints pass into the JSON each wallet expects. They are what the real
 * integration will serve; today the app only shows them in a developer preview. To go live:
 *
 *  Apple:  sign this JSON into a .pkpass (needs an Apple Developer account, Pass Type ID certificate and
 *          the WWDR certificate), serve it from /api/wallet/apple/<passId>, and implement Apple's web
 *          service (register/unregister device, list updated serials, fetch latest pass, APNs push).
 *  Google: create an Offer class once, then insert/patch an Offer object per pass with a service account,
 *          and hand the user a signed "Save to Google Wallet" JWT link.
 *
 * Field names follow the public PassKit and Google Wallet Offer docs. Check them against the current
 * docs when you wire it up, because wallet schemas gain fields over time.
 */

import { dealLabel, scheduleText } from '@/components/ui/format';
import { isPassUpgraded, passExpiresAt, passStatus } from '@/lib/store';
import type { Business, Deal, Pass } from '@/types/localhints';

/** How close (meters) a shopper must be for the pass to surface on the lock screen. */
export const WALLET_GEOFENCE_METERS = 300;
/** Apple allows at most 10 relevant locations per pass. */
export const APPLE_MAX_LOCATIONS = 10;

export const APPLE_PASS_TYPE_ID = 'pass.com.localhints.deal';
export const APPLE_TEAM_ID = 'YOUR_TEAM_ID';
export const GOOGLE_ISSUER_ID = 'YOUR_ISSUER_ID';

function rgb(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgb(79,70,229)';
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

function label(deal: Deal, pass: Pass): string {
  return dealLabel(deal, isPassUpgraded(deal, pass) && deal.shareUpgrade ? deal.shareUpgrade.upgradedValue : undefined);
}

export function shareUrl(pass: Pass, origin = 'https://localhints.com'): string {
  return `${origin}/p/${pass.referralCode}`;
}

export interface WalletContext {
  deal: Deal;
  business: Business;
  pass: Pass;
  now: number;
  /** Public origin of the deployed site, used for the Apple web service URL. */
  origin?: string;
}

/** The pass.json that goes inside an Apple .pkpass bundle. */
export function applePassJson({ deal, business, pass, now, origin = 'https://localhints.com' }: WalletContext) {
  const status = passStatus(deal, pass, now);
  const voided = status === 'voided' || status === 'expired' || status === 'complete';
  return {
    formatVersion: 1,
    passTypeIdentifier: APPLE_PASS_TYPE_ID,
    teamIdentifier: APPLE_TEAM_ID,
    serialNumber: pass.id,
    organizationName: business.name,
    description: `${business.name}: ${deal.title}`,
    logoText: business.name,
    backgroundColor: rgb(deal.brandColor),
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(255,255,255)',
    expirationDate: new Date(passExpiresAt(deal, pass)).toISOString(),
    voided,
    // The wallet re-fetches the pass from here whenever the server pushes an update (APNs). This single
    // mechanism powers upgrades, pause/resume, "ended by merchant", stamp progress and Pass Push messages.
    webServiceURL: `${origin}/api/wallet/apple`,
    authenticationToken: `${pass.id}-${pass.code}`.padEnd(16, '0'),
    // Surfaces the pass on the lock screen when the shopper is physically near the business.
    locations: [
      {
        latitude: business.lat,
        longitude: business.lng,
        relevantText: `You are near ${business.name}. Show this pass to save.`,
      },
    ].slice(0, APPLE_MAX_LOCATIONS),
    maxDistance: WALLET_GEOFENCE_METERS,
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: `${pass.code}${isPassUpgraded(deal, pass) ? ':UP' : ''}`,
        messageEncoding: 'iso-8859-1',
        altText: pass.code,
      },
    ],
    coupon: {
      primaryFields: [{ key: 'offer', label: 'OFFER', value: label(deal, pass), changeMessage: 'Your offer is now %@' }],
      secondaryFields: [
        { key: 'title', label: 'DEAL', value: deal.title },
        ...(deal.punchVisits > 1
          ? [{ key: 'stamps', label: 'STAMPS', value: `${pass.stamps} of ${deal.punchVisits}`, changeMessage: 'Stamps: %@' }]
          : []),
      ],
      auxiliaryFields: [
        {
          key: 'when',
          label: deal.recurring ? 'VALID' : 'EXPIRES',
          value: deal.recurring ? scheduleText(deal.recurring) : new Date(passExpiresAt(deal, pass)).toLocaleDateString(),
        },
      ],
      backFields: [
        { key: 'terms', label: 'Terms', value: deal.terms || 'See the business for details.' },
        { key: 'share', label: 'Share with a friend', value: shareUrl(pass, origin) },
        // Pass Push and Neighborhood Drop messages are written here; changeMessage makes iOS show them
        // as a lock-screen notification when the value changes.
        { key: 'message', label: 'From ' + business.name, value: 'Welcome!', changeMessage: '%@' },
      ],
    },
  };
}

type GoogleState = 'ACTIVE' | 'EXPIRED' | 'INACTIVE';

/** The Offer object inserted via the Google Wallet API for a pass. */
export function googleOfferObject({ deal, business, pass, now, origin = 'https://localhints.com' }: WalletContext) {
  const status = passStatus(deal, pass, now);
  const state: GoogleState =
    status === 'active' || status === 'scheduled' ? 'ACTIVE' : status === 'paused' ? 'INACTIVE' : 'EXPIRED';
  return {
    id: `${GOOGLE_ISSUER_ID}.${pass.id}`,
    classId: `${GOOGLE_ISSUER_ID}.localhints_offer`,
    state,
    title: deal.title,
    provider: business.name,
    redemptionChannel: 'INSTORE',
    hexBackgroundColor: deal.brandColor,
    validTimeInterval: {
      start: { date: pass.claimedAt },
      end: { date: new Date(passExpiresAt(deal, pass)).toISOString() },
    },
    barcode: {
      type: 'QR_CODE',
      value: `${pass.code}${isPassUpgraded(deal, pass) ? ':UP' : ''}`,
      alternateText: pass.code,
    },
    // Geofence: Google surfaces the pass near these points.
    locations: [{ latitude: business.lat, longitude: business.lng }],
    textModulesData: [
      { id: 'offer', header: 'OFFER', body: label(deal, pass) },
      { id: 'terms', header: 'TERMS', body: deal.terms || 'See the business for details.' },
      ...(deal.punchVisits > 1
        ? [{ id: 'stamps', header: 'STAMPS', body: `${pass.stamps} of ${deal.punchVisits}` }]
        : []),
    ],
    linksModuleData: { uris: [{ id: 'share', description: 'Share with a friend', uri: shareUrl(pass, origin) }] },
    // Pass Push / Neighborhood Drop messages for existing holders use the object's addMessage endpoint.
  };
}
