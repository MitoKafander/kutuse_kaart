import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { AGE_STOPS, ageStopLabel } from '../utils';

// Vertical "how stale may a price be" slider, pinned to the left edge of the map.
//
// It replaces the old boolean "hide stale prices" switch, which cut at
// FRESH_HOURS (5h) and so left about ten stations visible in the whole country
// — a control nobody could use. The map's own hard 24h cutoff had the same
// problem from the other side.
//
// Top = freshest, bottom = 48h. The default sits on 24h, exactly what the map
// did before this existed, so the slider changes nothing until it is dragged.
//
// COMMITS ON RELEASE. The thumb, the label and the station count follow the
// finger immediately — they read from a precomputed per-stop array, so they
// cost nothing — but the map is only told the new cutoff when the drag ends.
// Even with the map's price lookup indexed, re-rendering a few thousand
// markers mid-drag is the kind of thing that turns smooth into sticky on a
// phone, and there is no value in rendering the stops you are sliding past.
//
// The per-stop counts matter as much as the slider itself: they show *where
// the data is* before you touch it.

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

  const committedIndex = useMemo(() => {
    const i = (AGE_STOPS as readonly number[]).indexOf(maxAgeHours);
    return i === -1 ? AGE_STOPS.length - 1 : i;
  }, [maxAgeHours]);

  // What the thumb shows right now. Diverges from the committed value only
  // between pointerdown and release.
  const [pendingIndex, setPendingIndex] = useState(committedIndex);
  useEffect(() => { setPendingIndex(committedIndex); }, [committedIndex]);
  const index = dragging ? pendingIndex : committedIndex;

  const commit = (i: number) => {
    setDragging(false);
    if (AGE_STOPS[i] !== maxAgeHours) onChange(AGE_STOPS[i]);
  };

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
            onChange={(e) => {
              const next = AGE_STOPS.length - 1 - Number(e.target.value);
              setPendingIndex(next);
              // Keyboard and click-on-track produce a change with no drag in
              // progress — commit those immediately, they are single steps.
              if (!dragging) commit(next);
            }}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => commit(pendingIndex)}
            onPointerCancel={() => commit(pendingIndex)}
            onBlur={() => commit(pendingIndex)}
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
