import type { CSSProperties } from 'react';
import { Fuel, Pencil } from 'lucide-react';

type Props = { size?: number; style?: CSSProperties };

export function FuelPencilIcon({ size = 22, style }: Props) {
  const badgeSize = Math.round(size * 0.58);
  const pencilSize = Math.round(badgeSize * 0.75);
  const nudge = -Math.round(badgeSize * 0.18);

  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        lineHeight: 0,
        ...style,
      }}
    >
      <Fuel size={size} />
      <span
        style={{
          position: 'absolute',
          right: nudge,
          bottom: nudge,
          width: badgeSize,
          height: badgeSize,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          borderRadius: '50%',
          lineHeight: 0,
        }}
      >
        <Pencil size={pencilSize} strokeWidth={2.4} />
      </span>
    </span>
  );
}
