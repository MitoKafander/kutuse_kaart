import { useEffect, useMemo, useRef, useState } from 'react';
import type { CelebrationEvent } from '../hooks/useRegionProgress';

// Splits incoming events into a parish toast queue (shown serially) and a
// maakond overlay queue (shown one at a time, coalesced if several fire at
// once). Pure CSS animations — the keyframes live in src/index.css.

export function CelebrationOverlay({ events, onDrain }: { events: CelebrationEvent[]; onDrain: () => void }) {
  const [toastQueue, setToastQueue] = useState<CelebrationEvent[]>([]);
  const [maakondQueue, setMaakondQueue] = useState<CelebrationEvent[]>([]);
  const drainedRef = useRef(false);

  useEffect(() => {
    if (!events.length) return;
    const toasts = events.filter(e => e.kind === 'parish');
    const maakonnad = events.filter(e => e.kind === 'maakond');
    if (toasts.length)    setToastQueue(q => [...q, ...toasts]);
    if (maakonnad.length) setMaakondQueue(q => [...q, ...maakonnad]);
    // Drain parent queue so we don't process the same events twice.
    if (!drainedRef.current) { drainedRef.current = true; onDrain(); drainedRef.current = false; }
  }, [events, onDrain]);

  const activeToast = toastQueue[0];
  useEffect(() => {
    if (!activeToast) return;
    const t = setTimeout(() => setToastQueue(q => q.slice(1)), 2000);
    return () => clearTimeout(t);
  }, [activeToast]);

  const activeMaakond = maakondQueue[0];
  useEffect(() => {
    if (!activeMaakond) return;
    const t = setTimeout(() => setMaakondQueue(q => q.slice(1)), 3000);
    return () => clearTimeout(t);
  }, [activeMaakond]);

  return (
    <>
      {activeToast && activeToast.kind === 'parish' && (
        <div
          className="discovery-toast"
          style={{
            position: 'fixed',
            left: '20px',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            borderRadius: 12,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            border: '1px solid var(--color-surface-border)',
            backdropFilter: 'blur(12px)',
            zIndex: 4000,
            maxWidth: 'calc(100vw - 40px)',
          }}
        >
          <span style={{ fontSize: 22 }}>{activeToast.emoji}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
              {activeToast.name} kaetud!
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {activeToast.maakondName}
            </span>
          </div>
        </div>
      )}

      {activeMaakond && activeMaakond.kind === 'maakond' && (
        <MaakondBurst event={activeMaakond} onDismiss={() => setMaakondQueue(q => q.slice(1))} />
      )}
    </>
  );
}

function MaakondBurst({ event, onDismiss }: { event: CelebrationEvent & { kind: 'maakond' }; onDismiss: () => void }) {
  // Pre-compute particles once per mount so each render doesn't re-randomize.
  const particles = useMemo(() => {
    const list: Array<{ angle: number; dist: number; size: number; hue: number; delay: number }> = [];
    for (let i = 0; i < 28; i++) {
      list.push({
        angle: (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
        dist: 120 + Math.random() * 80,
        size: 6 + Math.random() * 6,
        hue: Math.floor(Math.random() * 360),
        delay: Math.random() * 0.12,
      });
    }
    return list;
  }, []);

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4500,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', width: 0, height: 0 }}>
        {particles.map((p, i) => (
          <span
            key={i}
            className="discovery-particle"
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: `hsl(${p.hue}, 85%, 60%)`,
              left: 0,
              top: 0,
              animationDelay: `${p.delay}s`,
              // CSS custom props consumed by @keyframes particleBurst in index.css
              // (typed as style vars via cast)
              ['--angle' as any]: `${p.angle}rad`,
              ['--dist' as any]: `${p.dist}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <div
        className="discovery-headline"
        style={{
          position: 'absolute',
          color: 'white',
          textAlign: 'center',
          padding: '20px 28px',
          background: 'rgba(0, 0, 0, 0.35)',
          borderRadius: 16,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
          maxWidth: 'calc(100vw - 48px)',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 6 }}>{event.emoji}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: 0.3 }}>
          {event.name} avastatud!
        </div>
        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>
          Kõik jaamad kaetud
        </div>
      </div>
    </div>
  );
}
