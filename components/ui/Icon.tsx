import type { ReactNode } from 'react';

export type IconName =
  | 'compass'
  | 'wallet'
  | 'camera'
  | 'user'
  | 'map'
  | 'list'
  | 'heart'
  | 'pin'
  | 'close'
  | 'chevron'
  | 'locate'
  | 'store'
  | 'shield'
  | 'logout'
  | 'bell'
  | 'back';

const PATHS: Record<IconName, ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v1" />
      <path d="M4 7.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 1 4 5.5" />
      <circle cx="16" cy="13.5" r="1" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v8A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19c.8-3.2 3.7-5 7-5s6.2 1.8 7 5" />
    </>
  ),
  map: (
    <>
      <path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2z" />
      <path d="M9 5v12M15 7v12" />
    </>
  ),
  list: (
    <>
      <path d="M8 7h11M8 12h11M8 17h11" />
      <circle cx="4.5" cy="7" r=".6" />
      <circle cx="4.5" cy="12" r=".6" />
      <circle cx="4.5" cy="17" r=".6" />
    </>
  ),
  heart: <path d="M12 19.5S4.5 15 4.5 9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7.5 1.6C19.5 15 12 19.5 12 19.5z" />,
  pin: (
    <>
      <path d="M12 20.5s6-5.2 6-10.2a6 6 0 0 0-12 0c0 5 6 10.2 6 10.2z" />
      <circle cx="12" cy="10.3" r="2.2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.5 5.5 5h13L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M5.5 12.5V19h13v-6.5" />
    </>
  ),
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 3 7.2 7 9 4-1.8 7-4.8 7-9V6z" />,
  logout: (
    <>
      <path d="M14 5h-7a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 7 19h7" />
      <path d="m16.5 8.5 3.5 3.5-3.5 3.5M20 12H10" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  back: <path d="m15 6-6 6 6 6" />,
};

interface IconProps {
  name: IconName;
  className?: string;
  /** Fill the shape (used for active heart). */
  filled?: boolean;
}

/** Minimal 24px stroke icon set. Decorative by default (aria-hidden). */
export function Icon({ name, className = 'h-5 w-5', filled = false }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
