import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { COUNTRIES, type CountryCode } from '../constants/countries';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';

// The country selector.
//
// It decides which stations the map draws, which Avastuskaart you collect,
// which statistics and leaderboard you see and which currency prices render
// in — the scope of everything on screen.
//
// It has moved three times and the dead ends are the reason it is here. First
// two controls writing the same state on two tabs of the profile drawer. Then
// one control in Settings with a "change" link from Profile, which traded a
// duplicate for a wasted tap. Then Mikk's suggestion: a bubble on the map,
// which is one instance and zero navigation — and the only placement that also
// works for signed-out users, who never reach the Profile tab.
//
// `CountryMenu` is shared so the profile drawer can open the same list in
// place rather than sending anyone to the map for it. Two triggers, one menu,
// one state — the thing that went wrong before was two *controls*, not two
// ways of reaching one.

/** The option list. Opaque on purpose — see the background note below. */
export function CountryMenu({
  activeCountry,
  availableCountries,
  onPick,
  style,
}: {
  activeCountry: CountryCode;
  availableCountries: CountryCode[];
  onPick: (country: CountryCode) => void;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="listbox"
      style={{
        // NOT .glass-panel. That is --color-surface, which is 5% white in dark
        // mode — fine over the app's own background, unreadable over a map,
        // where the labels competed with roads and coastline showing through.
        // A menu floating over content needs to occlude it.
        background: 'var(--color-bg)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
        padding: 6,
        borderRadius: 14,
        minWidth: 170,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        // Scrolls rather than running off a short screen once there are more
        // countries than fit.
        maxHeight: '60vh',
        overflowY: 'auto',
        ...style,
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
            onClick={() => onPick(code)}
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
  );
}

/**
 * The map trigger: a small bubble on the left edge, above the freshness
 * slider.
 *
 * Positioned at a fixed offset rather than relative to the slider, because the
 * slider is hidden in discovery mode and this is not — a control that jumps
 * when its neighbour disappears is worse than one that stays put.
 */
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

  useDismissOnOutside(open, rootRef, () => setOpen(false));

  // One country means no choice to offer.
  if (availableCountries.length <= 1) return null;

  const meta = COUNTRIES[activeCountry];

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        left: 10,
        // Clears the freshness slider (~230 px tall, centred) without depending
        // on it being rendered. The floor keeps it out of the search bar on a
        // short landscape viewport, where 50% − 175 px alone lands at the top.
        top: 'max(calc(84px + env(safe-area-inset-top)), calc(50% - 175px))',
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
          // Flag above, chevron below: it reads as a bubble rather than a
          // pill, and it keeps the footprint square against the slider below.
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
          padding: '6px 8px', borderRadius: 14, cursor: 'pointer',
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
        <CountryMenu
          activeCountry={activeCountry}
          availableCountries={availableCountries}
          onPick={(code) => { if (code !== activeCountry) onChange(code); setOpen(false); }}
        />
      )}
    </div>
  );
}
