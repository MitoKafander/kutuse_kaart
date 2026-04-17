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
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M6.5 27 V10 a3.5 3.5 0 0 1 3.5 -3.5 h4 a3.5 3.5 0 0 1 3.5 3.5 V27 Z" />
      <path d="M5 27 h14.5" />
      <rect x="8.5" y="10" width="7" height="5.5" rx="0.4" />
      <g transform="translate(20 24) rotate(-45)">
        <rect x="3" y="-3" width="20" height="6" rx="1" />
        <path d="M3 -3 L-2 0 L3 3 Z" />
        <path d="M21 -3 v6" />
      </g>
    </svg>
  );
}
