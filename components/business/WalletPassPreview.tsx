'use client';

import { useMemo } from 'react';
import type { PassTheme } from '@/types/localhints';
import { THEMES } from '@/components/ui/format';

const GRID = 25;

/** Deterministic pseudo-random matrix seeded from `value`, with QR-style finder squares. */
function buildMatrix(value: string): boolean[][] {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let seed = h >>> 0 || 1;
  const rand = (): number => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };

  const m: boolean[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => rand() > 0.5),
  );

  const finder = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const xx = ox + x;
        const yy = oy + y;
        if (xx < 0 || yy < 0 || xx >= GRID || yy >= GRID) continue;
        const inRing = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const border = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        m[yy][xx] = inRing && (border || core);
      }
    }
  };
  finder(0, 0);
  finder(GRID - 7, 0);
  finder(0, GRID - 7);
  return m;
}

/** Decorative QR-style code. Demo only: it is NOT scannable. Swap for a real QR lib later. */
export function QrPattern({ value, size = 160 }: { value: string; size?: number }) {
  const cells = useMemo(() => buildMatrix(value), [value]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Pass code ${value}`}
    >
      <rect width={GRID} height={GRID} fill="#ffffff" />
      {cells.flatMap((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0f172a" /> : null,
        ),
      )}
    </svg>
  );
}

export type PassVisualState = 'preview' | 'active' | 'redeemed' | 'expired';

interface WalletPassPreviewProps {
  businessName: string;
  emoji: string;
  label: string;
  title: string;
  terms?: string;
  theme: PassTheme;
  code: string;
  expiryText: string;
  state?: PassVisualState;
}

/** The visual wallet pass. Used by the coupon builder (live preview) and the consumer wallet modal. */
export function WalletPassPreview({
  businessName,
  emoji,
  label,
  title,
  terms,
  theme,
  code,
  expiryText,
  state = 'preview',
}: WalletPassPreviewProps) {
  const dimmed = state === 'redeemed' || state === 'expired';
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${THEMES[theme].card} p-5 text-white shadow-xl ${
          dimmed ? 'opacity-60 saturate-50' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl">
            {emoji}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{businessName || 'Your business'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
              LocalHints pass
            </p>
          </div>
        </div>

        <p className="mt-5 text-4xl font-black leading-none tracking-tight">{label}</p>
        <p className="mt-2 text-base font-semibold leading-snug">{title || 'Your offer title'}</p>
        {terms ? <p className="mt-2 text-xs leading-snug text-white/75">{terms}</p> : null}

        <div className="relative -mx-5 my-5">
          <div className="border-t-2 border-dashed border-white/40" />
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-slate-100" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-slate-100" />
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="rounded-2xl bg-white p-2">
            <QrPattern value={code || 'PREVIEW'} size={112} />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Code</p>
            <p className="break-all font-mono text-base font-bold">{code || 'PREVIEW'}</p>
            <p className="mt-2 text-xs font-semibold text-white/85">{expiryText}</p>
          </div>
        </div>
      </div>

      {state === 'redeemed' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-xl border-4 border-emerald-400 bg-white/95 px-4 py-1 text-2xl font-black uppercase tracking-widest text-emerald-600">
            Redeemed ✓
          </span>
        </div>
      )}
      {state === 'expired' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-xl border-4 border-slate-400 bg-white/95 px-4 py-1 text-2xl font-black uppercase tracking-widest text-slate-500">
            Expired
          </span>
        </div>
      )}
    </div>
  );
}
