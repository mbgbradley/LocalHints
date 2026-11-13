'use client';

import { useStore } from '@/lib/store';
import type { Role } from '@/types/localhints';

const ROLES: ReadonlyArray<{ id: Role; label: string; icon: string }> = [
  { id: 'consumer', label: 'Consumer', icon: '📱' },
  { id: 'business', label: 'Business', icon: '🏪' },
  { id: 'admin', label: 'Admin', icon: '🛡️' },
];

/** Demo-only bar for jumping between the three personas without auth. */
export function RoleSwitcher() {
  const { state, setRole } = useStore();

  return (
    <div className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-hint-600 text-white">📍</span>
          <span className="hidden text-base font-black text-slate-900 sm:inline">LocalHints</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Demo
          </span>
        </div>

        <div role="tablist" aria-label="Demo role" className="flex rounded-full bg-slate-100 p-1">
          {ROLES.map((r) => {
            const active = state.role === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRole(r.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                  active ? 'bg-hint-600 text-white shadow' : 'text-slate-600'
                }`}
              >
                <span className="mr-1">{r.icon}</span>
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
