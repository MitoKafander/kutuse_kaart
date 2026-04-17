import type { CSSProperties } from 'react';

type Props = { size?: number; style?: CSSProperties };

// Fuel-pump dispenser with a pencil resting against it — the visual cue for
// manual price entry. Hand-drawn as an inline SVG so it inherits the parent's
// `color` (currentColor) and stays crisp at every size.
export function FuelPencilIcon({ size = 22, style }: Props) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M6.5 27 V10 a3.5 3.5 0 0 1 3.5 -3.5 h4 a3.5 3.5 0 0 1 3.5 3.5 V27 Z" />
      <path d="M5 27 h14.5" />
      <rect x="8.5" y="10" width="7" height="5.5" rx="0.4" />
      <g transform="rotate(-45 24 17)">
        <rect x="20" y="16.7" width="8" height="2.6" rx="0.4" />
        <path d="M20 16.7 L18 18 L20 19.3 Z" />
        <path d="M27 16.7 v2.6" />
      </g>
    </svg>
  );
}
