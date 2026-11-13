import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

interface AppBarProps {
  /** Short label next to the logo, e.g. "Business" or "Admin". */
  section: string;
  children?: ReactNode;
}

/** Top bar for the Business and Admin areas. Links back to the consumer home. */
export function AppBar({ section, children }: AppBarProps) {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to LocalHints"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 active:bg-neutral-200"
          >
            <Icon name="back" className="h-5 w-5" />
          </Link>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-tight text-neutral-900">LocalHints</span>
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              {section}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
