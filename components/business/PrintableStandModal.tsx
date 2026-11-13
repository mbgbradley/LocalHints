'use client';

import { useStore, isDealLive } from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { dealLabel } from '@/components/ui/format';
import type { Business } from '@/types/localhints';
import { QrPattern } from './WalletPassPreview';

interface PrintableStandModalProps {
  open: boolean;
  onClose: () => void;
  business: Business;
}

/** A counter-top table tent customers scan to find the business's live deals. */
export function PrintableStandModal({ open, onClose, business }: PrintableStandModalProps) {
  const { state, now } = useStore();
  const liveDeals = state.deals.filter(
    (d) => d.businessId === business.id && isDealLive(d, state, now),
  );

  return (
    <Sheet open={open} onClose={onClose} title="Counter stand" size="lg">
      <div className="space-y-4">
        <p className="no-print text-sm text-slate-600">
          Print this and fold it into a table tent. Customers scan the code to see your live deals and add
          passes to their wallet.
        </p>

        <div className="print-area">
          <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border-4 border-hint-600 bg-white p-8 text-center">
            <p className="text-5xl">{business.emoji}</p>
            <h3 className="mt-2 text-3xl font-black text-slate-900">{business.name}</h3>
            <p className="mt-1 text-sm font-semibold uppercase tracking-widest text-hint-700">
              Scan for today&apos;s deals
            </p>

            <div className="mt-6 rounded-2xl border-2 border-slate-900 p-3">
              <QrPattern value={`localhints.app/b/${business.id}`} size={220} />
            </div>
            <p className="mt-2 font-mono text-xs text-slate-500">localhints.app/b/{business.id}</p>

            <div className="mt-6 w-full space-y-2">
              {liveDeals.length === 0 ? (
                <p className="text-sm text-slate-500">New deals are coming soon.</p>
              ) : (
                liveDeals.slice(0, 3).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-xl bg-hint-50 px-4 py-2 text-left"
                  >
                    <span className="text-sm font-bold text-slate-900">{d.title}</span>
                    <span className="ml-3 shrink-0 text-sm font-black text-hint-700">{dealLabel(d)}</span>
                  </div>
                ))
              )}
            </div>

            <p className="mt-6 text-xs font-semibold text-slate-400">Powered by LocalHints</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="no-print w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30"
        >
          Print stand
        </button>
        <p className="no-print text-center text-[11px] text-slate-400">
          Demo code: the pattern is decorative until a real QR library is wired in.
        </p>
      </div>
    </Sheet>
  );
}
