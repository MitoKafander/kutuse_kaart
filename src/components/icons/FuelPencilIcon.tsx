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
      <g transform="rotate(-45 24 15)">
        <rect x="18" y="15.5" width="10" height="3" rx="0.5" />
        <path d="M18 15.5 L15.5 17 L18 18.5 Z" />
        <path d="M27 15.5 v3" />
      </g>
    </svg>
  );
}
