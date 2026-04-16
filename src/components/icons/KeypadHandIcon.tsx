import type { SVGProps } from 'react';

type Props = { size?: number } & SVGProps<SVGSVGElement>;

export function KeypadHandIcon({ size = 22, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      <rect x="1" y="1" width="4" height="4" rx="0.6" />
      <rect x="6.5" y="1" width="4" height="4" rx="0.6" />
      <rect x="12" y="1" width="4" height="4" rx="0.6" />
      <rect x="1" y="6.5" width="4" height="4" rx="0.6" />
      <rect x="12" y="6.5" width="4" height="4" rx="0.6" />
      <path d="
        M7.25 13.5
        V8.5
        a1.5 1.5 0 0 1 3 0
        V12.5
        h1.25
        V11
        a1.25 1.25 0 0 1 2.5 0
        v1.5
        h0.75
        V11.75
        a1.25 1.25 0 0 1 2.5 0
        v1.25
        h0.75
        V12.5
        a1.25 1.25 0 0 1 2.5 0
        V17
        a5 5 0 0 1 -5 5
        h-2.5
        a5.25 5.25 0 0 1 -5.25 -5.25
        V14.5
        a1 1 0 0 1 1 -1
        Z" />
    </svg>
  );
}
