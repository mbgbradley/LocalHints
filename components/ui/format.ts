import type { Deal, DealKind, PassTheme } from '@/types/localhints';

export function dealLabel(deal: Pick<Deal, 'kind' | 'value'>): string {
  switch (deal.kind) {
    case 'percent':
      return `${deal.value}% OFF`;
    case 'amount':
      return `$${deal.value} OFF`;
    case 'bogo':
      return 'BOGO';
    case 'freebie':
      return 'FREE GIFT';
  }
}

export const KIND_LABELS: Record<DealKind, string> = {
  percent: 'Percent off',
  amount: 'Dollars off',
  bogo: 'Buy one, get one',
  freebie: 'Free gift',
};

export function timeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
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

/** A short, valid coupon code such as SUNN20 or BEANBOGO. */
export function suggestCode(businessName: string, kind: DealKind, value: number): string {
  const prefix = businessName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'HINT';
  if (kind === 'percent' || kind === 'amount') return `${prefix}${value}`;
  return kind === 'bogo' ? `${prefix}BOGO` : `${prefix}GIFT`;
}

export const THEMES: Record<PassTheme, { label: string; card: string; swatch: string }> = {
  indigo: { label: 'Indigo', card: 'from-indigo-600 via-indigo-700 to-violet-800', swatch: 'bg-indigo-600' },
  emerald: { label: 'Emerald', card: 'from-emerald-500 via-emerald-600 to-teal-700', swatch: 'bg-emerald-600' },
  rose: { label: 'Rose', card: 'from-rose-500 via-rose-600 to-pink-700', swatch: 'bg-rose-600' },
  amber: { label: 'Amber', card: 'from-amber-500 via-orange-500 to-orange-700', swatch: 'bg-amber-500' },
  slate: { label: 'Slate', card: 'from-slate-700 via-slate-800 to-slate-950', swatch: 'bg-slate-800' },
};

export const THEME_IDS = Object.keys(THEMES) as PassTheme[];
