import { useEffect, useState } from 'react';
import { X, Trophy, Star } from 'lucide-react';
import { supabase } from '../supabase';

type Period = '7d' | '30d' | 'all';

interface Row {
  user_id: string;
  display_name: string;
  prices_count: number;
  upvotes_received: number;
}

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

function score(r: Row): number {
  return r.prices_count + 0.3 * r.upvotes_received;
}

export function LeaderboardDrawer({
  isOpen,
  onClose,
  currentUserId,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string | null;
}) {
  const [period, setPeriod] = useState<Period>('30d');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from(VIEW_BY_PERIOD[period])
      .select('user_id, display_name, prices_count, upvotes_received')
      .limit(100)
      .then(({ data }) => {
        if (cancelled) return;
        const sorted = (data ?? []).slice().sort((a: Row, b: Row) => score(b) - score(a));
        setRows(sorted);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period, isOpen]);

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

        {/* Period tabs */}
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

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: 12 }}>Laadin...</div>
          )}
          {!loading && rows.length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: 12 }}>
              Selle perioodi kohta pole veel andmeid.
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
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                    <span>{r.prices_count} hinda</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Star size={11} /> {r.upvotes_received}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  {score(r).toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
