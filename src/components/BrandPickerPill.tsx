import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

const QUICK_BRANDS = ['Circle K', 'Neste', 'Olerex', 'Alexela', 'Terminal'];

export function BrandPickerPill({ selected, onChange }: {
  selected: string[];
  onChange: (brands: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
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
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', borderRadius: '20px',
          border: activeCount > 0 ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-alpha-12)',
          background: activeCount > 0 ? 'rgba(59,130,246,0.2)' : 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          color: activeCount > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
          fontSize: '0.85rem', fontWeight: activeCount > 0 ? 600 : 400,
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {label} <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }} />
      </button>

      {open && rect && createPortal(
        <div ref={popRef} className="glass-panel" style={{
          position: 'fixed', top: rect.top, left: rect.left,
          minWidth: 160, padding: 6, borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 2,
          zIndex: 2500,
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
          background: 'var(--color-bg)',
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
        </div>,
        document.body,
      )}
    </>
  );
}
