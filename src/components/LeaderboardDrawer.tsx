import { useEffect, useState } from 'react';
import { COUNTRIES, toCountryCode, type CountryCode } from '../constants/countries';
import { useTranslation } from 'react-i18next';
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

const PERIOD_KEYS: Record<Period, string> = {
  '7d': 'leaderboard.period.week',
  '30d': 'leaderboard.period.month',
  'all': 'leaderboard.period.all',
};

/**
 * The number on the right of a discovery row.
 *
 * It used to be hardcoded to `maakonnad_completed/level1Total`, which is zero
 * for essentially everyone — completing one Estonian maakond means pricing
 * every station in it, and in Latvia and Lithuania the level-1 regions are
 * bigger still. A leaderboard whose headline figure is structurally 0 for all
 * 100 rows ranks nobody and tells nobody anything. So show the deepest tier
 * that is actually moving, and fall back to raw stations for a new user.
 */
function discoveryScore(r: DiscoveryRow, level1Total: number): string {
  if (r.maakonnad_completed > 0) return `${r.maakonnad_completed}/${level1Total}`;
  if (r.parishes_completed > 0) return String(r.parishes_completed);
  return String(r.stations_contributed);
}

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
  activeCountry,
  level1Total,
  level1Unit,
  level2Unit,
  availableCountries,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string | null;
  onViewFootprint?: (userId: string, displayName: string) => void;
  displayName?: string;
  onDisplayNameChange?: (name: string) => void;
  /**
   * Avastajad is ranked per country (phase 65). Estonia's 78 vallad took a
   * five-year head start; a Latvian completing Latvia has to be able to top
   * Latvia's board, not sit behind every Estonian forever.
   */
  activeCountry: CountryCode;
  /** Level-1 regions with at least one station, in the active country. */
  level1Total: number;
  /** Translated name for those regions ("maakonda", "reģioni", "apskritys"). */
  level1Unit: string;
  /** Translated name for level-2 units ("valda", "novadi", "savivaldybės"). */
  level2Unit: string;
  /** Countries with a seeded catalog, for the header label. */
  availableCountries: CountryCode[];
}) {
  const { t } = useTranslation();
  const [dimension, setDimension] = useState<Dimension>('activity');
  const [period, setPeriod] = useState<Period>('30d');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName ?? '');
  // Mirror the displayName prop into a local editable draft.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setNameDraft(displayName ?? ''); }, [displayName]);

  // Async data fetch; loading flag flips synchronously, results land asynchronously.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);

    if (dimension === 'activity') {
      // Activity is the DEFAULT tab, and it was global while the discovery tab
      // beside it was per country — so a Latvian's first look at "the
      // leaderboard" was 100 Estonians. Phase 66 adds `country` to these three
      // views; filtering client-side keeps this working either side of that
      // migration, since a row with no country is Estonian by definition.
      supabase
        .from(VIEW_BY_PERIOD[period])
        .select('*')
        .limit(300)
        .then(({ data }) => {
          if (cancelled) return;
          const sorted = (data ?? [])
            .filter((r: any) => toCountryCode(r.country) === activeCountry)
            .map((r: any): ActivityRow => ({ kind: 'activity', ...r }))
            .sort((a, b) => activityScore(b) - activityScore(a))
            .slice(0, 100);
          setRows(sorted);
          setLoading(false);
        });
    } else {
      supabase
        // Filter server-side by country. This used to select('*') and filter
        // client-side under .limit(300) — exactly 3 countries x the view's
        // 100-per-country cap, so country number four would have silently
        // truncated whichever country sorted last. Asking for one country's
        // rows has no such ceiling to trip over, and moves less over the wire.
        //
        // Safe to filter on `country` now: the phase-65 migration is applied
        // in prod, so the column exists on every row.
        .from('v_discovery_leaderboard')
        .select('*')
        .eq('country', activeCountry)
        .limit(100)
        .then(({ data }) => {
          if (cancelled) return;
          const mapped: DiscoveryRow[] = (data ?? [])
            .filter((r: any) => toCountryCode(r.country) === activeCountry)
            .map((r: any) => ({
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
  }, [period, isOpen, dimension, activeCountry]);

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
            <h2 className="heading-1">{t('leaderboard.title')}</h2>
            {/* Which country's board this is. Without it the drawer silently
                shows one country's players and the only switcher was behind
                the drawer the user just closed to get here. */}
            {availableCountries.length > 1 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden>{COUNTRIES[activeCountry].flag}</span>
                {t(COUNTRIES[activeCountry].nameKey)}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Dimension pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([
            { k: 'activity' as const,  label: t('leaderboard.dimension.activity'),  icon: <Trophy size={14} /> },
            { k: 'discovery' as const, label: t('leaderboard.dimension.discovery'), icon: <Compass size={14} /> },
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
            {(Object.keys(PERIOD_KEYS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                flex: 1, padding: '8px 12px', borderRadius: 10,
                border: period === p ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                background: period === p ? 'rgba(59,130,246,0.2)' : 'var(--color-surface)',
                color: period === p ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '0.88rem', fontWeight: period === p ? 600 : 400, cursor: 'pointer',
              }}>{t(PERIOD_KEYS[p])}</button>
            ))}
          </div>
        )}
        {dimension === 'discovery' && (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
            {t('leaderboard.discoveryHint')}
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
              {t('leaderboard.youLabel')}
            </span>
            <input
              type="text"
              value={nameDraft}
              maxLength={32}
              placeholder={t('leaderboard.anonymous')}
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
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: 12 }}>{t('leaderboard.loading')}</div>
          )}
          {!loading && rows.length === 0 && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', padding: 12 }}>
              {dimension === 'discovery'
                ? t('leaderboard.empty.discovery')
                : t('leaderboard.empty.activity')}
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
                    {r.display_name || t('leaderboard.anonymous')}{isMe && ' ' + t('leaderboard.youSuffix')}
                  </div>
                  {r.kind === 'activity' ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                      <span>{t('leaderboard.stats.prices', { count: r.prices_count })}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Star size={11} /> {r.upvotes_received}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                      <span>{t('leaderboard.stats.level1', { done: r.maakonnad_completed, total: level1Total, unit: level1Unit })}</span>
                      <span>{t('leaderboard.stats.level2', { count: r.parishes_completed, unit: level2Unit })}</span>
                      <span>{t('leaderboard.stats.stations', { count: r.stations_contributed })}</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  {r.kind === 'activity' ? activityScore(r).toFixed(1) : discoveryScore(r, level1Total)}
                </div>
                {r.kind === 'discovery' && r.share_discovery_publicly && !isMe && onViewFootprint && (
                  <button
                    onClick={() => onViewFootprint(r.user_id, r.display_name || t('leaderboard.anonymous'))}
                    title={t('leaderboard.viewFootprint.title')}
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
                    <MapIcon size={13} /> {t('leaderboard.viewFootprint.label')}
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
