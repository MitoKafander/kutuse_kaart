import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { AGE_STOPS, ageStopLabel } from '../utils';

// Vertical "how stale may a price be" slider, pinned to the left edge of the map.
//
// It replaces the old boolean "hide stale prices" switch, which cut at
// FRESH_HOURS (5h) and therefore left about ten stations visible in the whole
// country — a control nobody could use. The map's own hard 24h cutoff had the
// same problem from the other side: 320 Estonian stations carry a price and
// only ~13 of them are under a day old, so the rest were simply invisible.
//
// Top = freshest, bottom = everything. The default sits on 24h, which is
// exactly what the map did before this existed, so the slider changes nothing
// until it is dragged.
//
// The per-stop counts matter as much as the slider: they tell you *where the
// data is* before you drag, so the control teaches the shape of the dataset
// rather than making you hunt for it.

export function FreshnessSlider({
  maxAgeHours,
  onChange,
  countsByStop,
}: {
  maxAgeHours: number;
  onChange: (hours: number) => void;
  /** Stations that would show a price at each stop, same order as AGE_STOPS. */
  countsByStop: number[];
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  const index = useMemo(() => {
    const i = AGE_STOPS.indexOf(maxAgeHours);
    return i === -1 ? AGE_STOPS.length - 1 : i;
  }, [maxAgeHours]);

  // The range input runs 0..n-1 left-to-right and is rotated -90°, which puts 0
  // at the bottom. We want the freshest at the TOP, so the slider value is the
  // reversed index.
  const sliderValue = AGE_STOPS.length - 1 - index;
  const count = countsByStop[index] ?? 0;

  const TRACK = 168; // px of travel; the rotated input is this wide

  return (
    <div
      style={{
        position: 'absolute',
        left: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <div
        className="glass-panel"
        style={{
          pointerEvents: 'auto',
          padding: '10px 6px',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Clock size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <div style={{ height: TRACK, width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="range"
            min={0}
            max={AGE_STOPS.length - 1}
            step={1}
            value={sliderValue}
            aria-label={t('freshness.label')}
            aria-valuetext={`${ageStopLabel(AGE_STOPS[index], t)} · ${t('freshness.stations', { count })}`}
            onChange={(e) => onChange(AGE_STOPS[AGE_STOPS.length - 1 - Number(e.target.value)])}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onBlur={() => setDragging(false)}
            style={{
              // Rotating a horizontal range is the portable way to get a
              // vertical one — `writing-mode: vertical-*` on a range input is
              // still uneven across the Safari versions this PWA runs on.
              width: TRACK,
              transform: 'rotate(-90deg)',
              accentColor: 'var(--color-primary)',
              cursor: 'pointer',
            }}
          />
        </div>
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 600,
            color: 'var(--color-text)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {ageStopLabel(AGE_STOPS[index], t)}
        </span>
      </div>

      {/* Live read-out, only while the control has the user's attention — it
          would otherwise be one more permanent label competing with the map. */}
      {dragging && (
        <div
          className="glass-panel"
          style={{
            pointerEvents: 'none',
            padding: '6px 10px',
            borderRadius: 10,
            fontSize: '0.75rem',
            color: 'var(--color-text)',
            whiteSpace: 'nowrap',
          }}
        >
          {t('freshness.stations', { count })}
        </div>
      )}
    </div>
  );
}
