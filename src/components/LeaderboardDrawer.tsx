import { useEffect, useState } from 'react';
import { X, Trophy, Star, Compass, Map as MapIcon, UserCircle } from 'lucide-react';
import { supabase } from '../supabase';

type Period = '7d' | '30d' | 'all';
type Dimension = 'activity' | 'discovery';

type ActivityRow = {
  kind: 'activity';
  user_id: string;
  display_name: string;
  prices_count: number;
  upvotes_received: number;
};

type DiscoveryRow = {
  kind: 'discovery';
  user_id: string;
  display_name: string;
  maakonnad_completed: number;
  parishes_completed: number;
  stations_contributed: number;
  share_discovery_publicly: boolean;
};

type Row = ActivityRow | DiscoveryRow;

const VIEW_BY_PERIOD: Record<Period, string> = {
  '7d': 'v_leaderboard_7d',
  '30d': 'v_leaderboard_30d',
  'all': 'v_leaderboard_all',
};

const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Nädal',
  '30d': 'Kuu',
  'all': 'Kõik',
};

function activityScore(r: ActivityRow): number {
  return r.prices_count + 0.3 * r.upvotes_received;
}

export function LeaderboardDrawer({
  isOpen,
  onClose,
  currentUserId,
  onViewFootprint,
  displayName,
  onDisplayNameChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string | null;
  onViewFootprint?: (userId: string, displayName: string) => void;
  displayName?: string;
  onDisplayNameChange?: (name: string) => void;
}) {
  const [dimension, setDimension] = useState<Dimension>('activity');
  const [period, setPeriod] = useState<Period>('30d');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName ?? '');
  useEffect(() => { setNameDraft(displayName ?? ''); }, [displayName]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);

    if (dimension === 'activity') {
      supabase
        .from(VIEW_BY_PERIOD[period])
        .select('user_id, display_name, prices_count, upvotes_received')
        .limit(100)
        .then(({ data }) => {
          if (cancelled) return;
          const sorted = (data ?? [])
            .map((r: any): ActivityRow => ({ kind: 'activity', ...r }))
            .sort((a, b) => activityScore(b) - activityScore(a));
          setRows(sorted);
          setLoading(false);
        });
    } else {
      supabase
        .from('v_discovery_leaderboard')
        .select('user_id, display_name, maakonnad_completed, parishes_completed, stations_contributed, share_discovery_publicly')
        .limit(100)
        .then(({ data }) => {
          if (cancelled) return;
          const mapped: DiscoveryRow[] = (data ?? []).map((r: any) => ({
            kind: 'discovery',
            ...r,
            share_discovery_publicly: !!r.share_discovery_publicly,
          }));
          // View is pre-ordered, but sort client-side defensively.
          mapped.sort((a, b) =>
            b.maakonnad_completed - a.maakonnad_completed ||
            b.parishes_completed - a.parishes_completed ||
            b.stations_contributed - a.stations_contributed
          );
          setRows(mapped);
          setLoading(false);
        });
    }

    return () => { cancelled = true; };
  }, [period, isOpen, dimension]);

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      zIndex: 2100, display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%', height: '85vh', backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        padding: '24px', display: 'flex', flexDirection: 'column',
      }}>
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={24} color="var(--color-warning)" />
            <h2 className="heading-1">Edetabel</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Dimension pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([
            { k: 'activity' as const,  label: 'Aktiivsemad', icon: <Trophy size={14} /> },
            { k: 'discovery' as const, label: 'Avastajad',   icon: <Compass size={14} /> },
          ]).map(d => {
            const active = dimension === d.k;
            return (
              <button key={d.k} onClick={() => setDimension(d.k)} style={{
                flex: 1, padding: '10px 12px', borderRadius: 10,
                border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                background: active ? 'rgba(59,130,246,0.2)' : 'var(--color-surface)',
                color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '0.92rem', fontWeight: active ? 600 : 400, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {d.icon} {d.label}
              </button>
            );
          })}
        </div>

        {/* Period tabs (hidden on discovery — all-time only) */}
        {dimension === 'activity' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                flex: 1, padding: '8px 12px', borderRadius: 10,
                border: period === p ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                background: period === p ? 'rgba(59,130,246,0.2)' : 'var(--color-surface)',
                color: period === p ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '0.88rem', fontWeight: period === p ? 600 : 400, cursor: 'pointer',
              }}>{PERIOD_LABELS[p]}</button>
            ))}
          </div>
        )}
        {dimension === 'discovery' && (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
            Järjestatud maakondade, siis valdade, siis jaamade järgi — kõik aeg.
          </div>
        )}

        {/* Inline "your name in the leaderboard" editor — lives here because
            this is the one place in the app where the name actually surfaces
            to other users. Save on blur + Enter. Only shown when signed in
            and a handler is wired. */}
        {currentUserId && onDisplayNameChange && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', marginBottom: 10, borderRadius: 10,
            background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
          }}>
            <UserCircle size={16} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              Sina:
            </span>
            <input
              type="text"
              value={nameDraft}
              maxLength={32}
              placeholder="Anonüümne"
              onChange={e => setNameDraft(e.target.value)}
              onBlur={() => {
                const trimmed = nameDraft.trim();
                if (trimmed !== (displayName ?? '')) onDisplayNameChange(trimmed);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              style={{
                flex: 1, minWidth: 0, padding: '6px 10px',
                background: 'var(--color-bg)', border: '1px solid var(--color-surface-border)',
                borderRadius: 6, color: 'var(--color-text)', fontSize: '0.88rem', outline: 'none',
              }}
            />
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: 12 }}>Laadin...</div>
          )}
          {!loading && rows.length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: 12 }}>
              {dimension === 'discovery'
                ? 'Keegi pole veel midagi avastanud. Ole esimene!'
                : 'Selle perioodi kohta pole veel andmeid.'}
            </div>
          )}
          {!loading && rows.map((r, i) => {
            const isMe = currentUserId && r.user_id === currentUserId;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
            return (
              <div key={r.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                background: isMe ? 'rgba(59,130,246,0.15)' : 'var(--color-surface)',
                border: isMe ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
              }}>
                <div style={{
                  width: 32, textAlign: 'center', fontSize: medal ? '1.1rem' : '0.9rem',
                  fontWeight: 700, color: 'var(--color-text-muted)',
                }}>
                  {medal ?? `${i + 1}.`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: isMe ? 700 : 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.display_name || 'Anonüümne'}{isMe && ' (sina)'}
                  </div>
                  {r.kind === 'activity' ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                      <span>{r.prices_count} hinda</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Star size={11} /> {r.upvotes_received}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                      <span>{r.maakonnad_completed}/15 maakonda</span>
                      <span>{r.parishes_completed} valda</span>
                      <span>{r.stations_contributed} jaama</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  {r.kind === 'activity' ? activityScore(r).toFixed(1) : `${r.maakonnad_completed}/15`}
                </div>
                {r.kind === 'discovery' && r.share_discovery_publicly && !isMe && onViewFootprint && (
                  <button
                    onClick={() => onViewFootprint(r.user_id, r.display_name || 'Anonüümne')}
                    title="Vaata selle kasutaja avastuskaarti"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-surface-border)',
                      color: 'var(--color-primary)',
                      borderRadius: 8,
                      padding: '6px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.72rem',
                    }}
                  >
                    <MapIcon size={13} /> Vaata
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
