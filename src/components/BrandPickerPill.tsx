import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const QUICK_BRANDS = ['Circle K', 'Neste', 'Olerex', 'Alexela', 'Terminal'];

export function BrandPickerPill({ selected, onChange }: {
  selected: string[];
  onChange: (brands: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const activeCount = selected.filter(s => QUICK_BRANDS.includes(s)).length;
  const label = activeCount > 0 ? `Kett · ${activeCount}` : 'Kett';

  const toggle = (b: string) => {
    if (selected.includes(b)) onChange(selected.filter(x => x !== b));
    else onChange([...selected, b]);
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', borderRadius: '20px',
          border: activeCount > 0 ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-alpha-12)',
          background: activeCount > 0 ? 'rgba(59,130,246,0.2)' : 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          color: activeCount > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
          fontSize: '0.85rem', fontWeight: activeCount > 0 ? 600 : 400,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {label} <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }} />
      </button>

      {open && (
        <div className="glass-panel" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 160, padding: 6, borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 2,
          zIndex: 1100,
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
        }}>
          {QUICK_BRANDS.map(b => {
            const isOn = selected.includes(b);
            return (
              <button
                key={b}
                onClick={() => toggle(b)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 8,
                  background: isOn ? 'rgba(59,130,246,0.15)' : 'transparent',
                  border: 'none', color: 'var(--color-text)', cursor: 'pointer',
                  fontSize: '0.88rem', textAlign: 'left',
                }}
              >
                <span>{b}</span>
                {isOn && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
              </button>
            );
          })}
          {activeCount > 0 && (
            <button
              onClick={() => onChange(selected.filter(s => !QUICK_BRANDS.includes(s)))}
              style={{
                padding: '6px 10px', marginTop: 4,
                border: '1px solid var(--color-surface-border)', borderRadius: 8,
                background: 'transparent', color: 'var(--color-text-muted)',
                cursor: 'pointer', fontSize: '0.78rem',
              }}
            >
              Tühista valik
            </button>
          )}
        </div>
      )}
    </div>
  );
}
