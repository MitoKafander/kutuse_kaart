import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { COUNTRIES, type CountryCode } from '../constants/countries';

// The country selector, on the map itself.
//
// It decides which stations the map draws, which Avastuskaart you collect,
// which statistics and leaderboard you see and which currency prices render
// in. That is the scope of everything on screen, so it belongs on screen —
// not in a drawer behind a tab.
//
// It has been in three places and this is why it ended up here. Originally two
// controls that both wrote the same state, on two different tabs of the profile
// drawer. Then one control in Settings, with a "change" link from Profile —
// which replaced a duplicate with a wasted tap. Then Mikk's suggestion: a
// bubble on the main view. That is one instance, zero navigation, and it works
// for signed-out users, who never reach the Profile tab at all.
//
// Sits above the freshness slider on the left edge, at a fixed offset rather
// than relative to it: the slider is hidden in discovery mode and the bubble is
// not, and a control that moves when its neighbour disappears is worse than one
// that stays put.

export function CountryBubble({
  activeCountry,
  availableCountries,
  onChange,
}: {
  activeCountry: CountryCode;
  /** Countries with a seeded catalog. A registry entry alone must not be offerable. */
  availableCountries: CountryCode[];
  onChange: (country: CountryCode) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Dismiss on an outside tap or Escape. Without this the list stays over the
  // map and swallows the next pan.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // One country means no choice to offer — an Estonia-only install sees nothing.
  if (availableCountries.length <= 1) return null;

  const meta = COUNTRIES[activeCountry];

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        left: 10,
        // Clears the freshness slider (~230 px tall, centred) without depending
        // on it being rendered.
        top: 'calc(50% - 165px)',
        zIndex: 800,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <button
        className="glass-panel"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={t('country.picker.label', 'Country')}
        title={t(meta.nameKey)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '7px 8px', borderRadius: 14, cursor: 'pointer',
          border: '1px solid var(--color-surface-border)',
          lineHeight: 1,
        }}
      >
        <span aria-hidden style={{ fontSize: '1.15rem' }}>{meta.flag}</span>
        <ChevronDown
          size={13}
          style={{
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {open && (
        <div
          className="glass-panel"
          role="listbox"
          style={{
            padding: 6, borderRadius: 14, minWidth: 170,
            display: 'flex', flexDirection: 'column', gap: 4,
            border: '1px solid var(--color-surface-border)',
            // Six countries at ~38 px plus padding; scrolls rather than running
            // off a short screen once there are more.
            maxHeight: '60vh', overflowY: 'auto',
          }}
        >
          {availableCountries.map(code => {
            const m = COUNTRIES[code];
            const isActive = code === activeCountry;
            return (
              <button
                key={code}
                role="option"
                aria-selected={isActive}
                onClick={() => { if (!isActive) onChange(code); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 10, width: '100%',
                  cursor: isActive ? 'default' : 'pointer', textAlign: 'left',
                  background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                  color: 'var(--color-text)', fontSize: '0.85rem', whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden style={{ fontSize: '1.05rem' }}>{m.flag}</span>
                <span style={{ flex: 1 }}>{t(m.nameKey)}</span>
                {isActive && <Check size={15} color="var(--color-primary)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
