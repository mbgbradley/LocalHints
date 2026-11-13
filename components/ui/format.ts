import type { Deal, DealKind, RecurringSchedule } from '@/types/localhints';

type LabelFields = Pick<Deal, 'kind' | 'value' | 'buyQty' | 'getQty'>;

/** Big headline on a pass. Pass `value` override to render the upgraded offer. */
export function dealLabel(deal: LabelFields, valueOverride?: number): string {
  const value = valueOverride ?? deal.value;
  switch (deal.kind) {
    case 'percent':
      return `${value}% OFF`;
    case 'amount':
      return `$${value} OFF`;
    case 'bogo':
      return deal.buyQty === 1 && deal.getQty === 1 ? 'BOGO' : `BUY ${deal.buyQty} GET ${deal.getQty}`;
    case 'freebie':
      return 'FREE ITEM';
    case 'bundle':
      return `$${value} BUNDLE`;
  }
}

export const KIND_LABELS: Record<DealKind, string> = {
  percent: '% off',
  amount: '$ off',
  bogo: 'BOGO (Buy X, Get Y)',
  freebie: 'Free item with purchase',
  bundle: 'Bundle price',
};

export function timeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  return timeLeftMs(ms);
}

export function timeLeftMs(ms: number): string {
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m left`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h left`;
}

/** True when a deal has under 24 hours left (used for urgency styling). */
export function isUrgent(iso: string, now: number): boolean {
  const ms = new Date(iso).getTime() - now;
  return ms > 0 && ms < 24 * 3_600_000;
}

export function relativeTime(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** A short, valid promo code (3 to 15 letters or digits) such as SUNN20 or BEANBOGO. */
export function suggestCode(businessName: string, kind: DealKind, value: number): string {
  const prefix = businessName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'HINT';
  if (kind === 'percent' || kind === 'amount' || kind === 'bundle') return `${prefix}${value}`;
  return kind === 'bogo' ? `${prefix}BOGO` : `${prefix}FREE`;
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatHour(h: number): string {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}

export function scheduleText(r: RecurringSchedule): string {
  const days = [...r.days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(', ');
  return `${days} · ${formatHour(r.startHour)} to ${formatHour(r.endHour)}`;
}

/** "Opens Tue 11 AM" for the next window of a recurring deal, or null if none is found. */
export function nextOpenText(r: RecurringSchedule, now: number): string | null {
  const base = new Date(now);
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    if (!r.days.includes(d.getDay())) continue;
    const opens = new Date(d);
    opens.setHours(r.startHour, 0, 0, 0);
    if (opens.getTime() > now) return `Opens ${DAY_LABELS[d.getDay()]} ${formatHour(r.startHour)}`;
  }
  return null;
}

/** Black or white text, whichever reads better on the given #rrggbb background. */
export function readableText(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0f172a' : '#ffffff';
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export const BRAND_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Indigo', hex: '#4f46e5' },
  { label: 'Emerald', hex: '#059669' },
  { label: 'Rose', hex: '#e11d48' },
  { label: 'Amber', hex: '#d97706' },
  { label: 'Espresso', hex: '#78350f' },
  { label: 'Slate', hex: '#1e293b' },
  { label: 'Sunshine', hex: '#facc15' },
];

/** "2026-11-14" for the day that is `days` from `now`, in local time. */
export function dateInputValue(now: number, days: number): string {
  const d = new Date(now + days * 86_400_000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
