import type { SVGProps } from 'react';

type Props = { size?: number } & SVGProps<SVGSVGElement>;

export function FuelPencilIcon({ size = 22, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <path d="M2 19h8" />
      <path d="M10 19V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 2 4v15" />
      <path d="M10 10h1.5A1.5 1.5 0 0 1 13 11.5v1a1.5 1.5 0 0 0 3 0V8L14.5 6.5" />
      <path d="M17 13l4 4-5 5h-4v-4z" />
      <path d="M17 13l4 4" />
    </svg>
  );
}
