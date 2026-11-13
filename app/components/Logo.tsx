/** Ferry mark: a hull riding a wave inside a porthole ring. Pure SVG, inherits currentColor. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 17.5h16l-2.6 4.2H10.6L8 17.5Z" fill="currentColor" />
      <path d="M12.5 17.5v-3.4h6.4v3.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17.3 14.1v-2.6" stroke="var(--signal)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 25c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" stroke="var(--sea)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Small boat glyph used on the route line. */
export function Boat({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 32 24" fill="none" aria-hidden>
      <path d="M2 14h28l-4.5 7H6.5L2 14Z" fill="currentColor" />
      <path d="M9 14V9h12v5" stroke="currentColor" strokeWidth="2" />
      <path d="M18 9V4" stroke="var(--signal)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
