'use client';

import { useEffect, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Bottom sheet on phones, centered dialog from the md breakpoint up.
 * Closes on backdrop tap and Escape, and locks background scroll while open.
 */
export function Sheet({ open, onClose, title, children, size = 'md' }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Dialog'}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="no-print absolute inset-0 animate-fade-in bg-neutral-900/60"
      />
      <div
        className={`relative flex max-h-[92vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:animate-fade-in md:rounded-3xl ${
          size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-md'
        }`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300 md:hidden" />
        {title && (
          <div className="flex items-center justify-between px-5 pb-1 pt-3">
            <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="no-print flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 active:bg-neutral-200"
            >
              ✕
            </button>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain px-5 pt-2 pb-safe">{children}</div>
      </div>
    </div>
  );
}
