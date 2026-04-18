import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { subscribeToUpdate, applyUpdate } from '../utils/swUpdate';

// Sits at z 2500 — above every map/FAB overlay but below modals (3000) so
// it doesn't interrupt a mid-flow price submit. Non-dismissible on purpose:
// the whole reason we built this was users sitting on stale bundles for
// days; giving them an "X" defeats the point. If users complain, add a
// dismiss that re-shows on the next session.
export function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [reloading, setReloading] = useState(false);
  useEffect(() => subscribeToUpdate(v => setShow(v)), []);
  if (!show) return null;
  return (
    <div
      className="glass-panel animate-slide-up"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(20px + env(safe-area-inset-bottom))',
        left: '20px',
        right: '20px',
        zIndex: 2500,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        border: '1px solid rgba(59,130,246,0.55)',
        background: 'rgba(59,130,246,0.22)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: 'var(--color-text)',
      }}
    >
      <RefreshCw size={18} color="var(--color-primary)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Uus versioon saadaval</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
          Värskenda, et kasutada uusimat Kytsi.
        </div>
      </div>
      <button
        onClick={() => { setReloading(true); applyUpdate(); }}
        disabled={reloading}
        style={{
          background: 'var(--color-primary)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: reloading ? 'default' : 'pointer',
          opacity: reloading ? 0.6 : 1,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {reloading ? 'Värskendan…' : 'Värskenda'}
      </button>
    </div>
  );
}
