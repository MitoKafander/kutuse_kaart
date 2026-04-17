import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { RegionProgress } from '../hooks/useRegionProgress';

// 3-column grid of 15 maakond tiles + inline-expandable parish list per tile.
// Visual language deliberately mirrors the contributor-tier badge in
// ProfileDrawer (emoji + accent color + subtle border) so the two feel
// like they're from the same "game" vocabulary.

export function DiscoveryBadgeGrid({
  progress,
  onMaakondFocus,
}: {
  progress: RegionProgress;
  onMaakondFocus?: (maakondId: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!progress.perMaakond.length) {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '8px 0' }}>
        Regioone pole veel laetud…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {progress.perMaakond.map(entry => {
          const { maakond, parishesDone, parishesTotal, stationsDone, stationsTotal } = entry;
          const hasStations = parishesTotal > 0;
          const isComplete = hasStations && parishesDone >= parishesTotal;
          const hasProgress = parishesDone > 0;
          const pct = hasStations ? parishesDone / parishesTotal : 0;
          const isExpanded = expandedId === maakond.id;

          return (
            <button
              key={maakond.id}
              onClick={() => {
                // Tile click does double duty: focus the map on this
                // maakond AND expand the parish accordion inline, so the
                // user can see the list while the map zooms in.
                if (hasStations && onMaakondFocus) onMaakondFocus(maakond.id);
                setExpandedId(isExpanded ? null : maakond.id);
              }}
              style={{
                position: 'relative',
                padding: '10px 8px',
                border: isComplete
                  ? '1px solid var(--color-primary)'
                  : hasProgress
                    ? '1px solid var(--color-surface-border)'
                    : '1px solid var(--color-surface-border)',
                borderRadius: 10,
                background: isComplete
                  ? 'rgba(59, 130, 246, 0.18)'
                  : 'var(--color-surface)',
                color: 'var(--color-text)',
                cursor: hasStations ? 'pointer' : 'default',
                opacity: hasStations ? 1 : 0.4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.75rem',
                textAlign: 'center',
                overflow: 'hidden',
              }}
            >
              {hasProgress && !isComplete && (
                // Thin bottom progress bar
                <div style={{
                  position: 'absolute',
                  left: 0,
                  bottom: 0,
                  height: 3,
                  width: `${pct * 100}%`,
                  background: 'var(--color-primary)',
                  transition: 'width 0.4s ease-out',
                }} />
              )}
              {isComplete && (
                <div style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: 'var(--color-primary)',
                  color: 'white',
                  borderRadius: '50%',
                  width: 14,
                  height: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Check size={10} strokeWidth={3} />
                </div>
              )}
              <span style={{ fontSize: 22 }}>{maakond.emoji || '📍'}</span>
              <span style={{
                fontWeight: isComplete ? 600 : 500,
                lineHeight: 1.1,
              }}>
                {maakond.name.replace(' maakond', '')}
              </span>
              {hasStations ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 1, fontSize: '0.68rem', color: 'var(--color-text-muted)',
                  lineHeight: 1.2,
                }}>
                  <span>{stationsDone}/{stationsTotal} jaama</span>
                  <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>{parishesDone}/{parishesTotal} valda</span>
                </div>
              ) : (
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>pole jaamu</span>
              )}
            </button>
          );
        })}
      </div>

      {expandedId !== null && (() => {
        const entry = progress.perMaakond.find(pm => pm.maakond.id === expandedId);
        if (!entry || entry.parishesTotal === 0) return null;
        return (
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 10,
            padding: 12,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              fontSize: '0.85rem',
              color: 'var(--color-text-muted)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>{entry.maakond.emoji || '📍'}</span>
                {entry.maakond.name}
              </span>
              <button
                onClick={() => setExpandedId(null)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0 }}
              >
                <ChevronDown size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entry.parishes.map(p => {
                const pct = p.stationsTotal > 0 ? p.stationsDone / p.stationsTotal : 0;
                const done = pct >= 1;
                return (
                  <div key={p.parish.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ color: done ? 'var(--color-primary)' : 'var(--color-text)' }}>
                        {done ? '✓ ' : ''}{p.parish.name}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {p.stationsDone}/{p.stationsTotal}
                      </span>
                    </div>
                    <div style={{
                      height: 4,
                      borderRadius: 2,
                      background: 'var(--color-surface-border)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct * 100}%`,
                        height: '100%',
                        background: done ? 'var(--color-primary)' : 'rgba(59,130,246,0.55)',
                        transition: 'width 0.4s ease-out',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
