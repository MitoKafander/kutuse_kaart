import { useEffect, useState } from 'react';

export type PointsEvent = { id: number; amount: number };

export function PointsToast({ events, onDrain }: { events: PointsEvent[]; onDrain: () => void }) {
  const [queue, setQueue] = useState<PointsEvent[]>([]);

  useEffect(() => {
    if (!events.length) return;
    setQueue(q => [...q, ...events]);
    onDrain();
  }, [events, onDrain]);

  const active = queue[0];
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setQueue(q => q.slice(1)), 1800);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <div
      key={active.id}
      className="points-toast"
      style={{
        position: 'fixed',
        top: 'calc(80px + env(safe-area-inset-top))',
        right: 'calc(20px + env(safe-area-inset-right))',
        zIndex: 4200,
        pointerEvents: 'none',
        fontSize: '1.6rem',
        fontWeight: 800,
        color: 'var(--color-fresh, #4ade80)',
        textShadow: '0 2px 12px rgba(0,0,0,0.55)',
        letterSpacing: 0.5,
      }}
    >
      +{active.amount}
    </div>
  );
}
