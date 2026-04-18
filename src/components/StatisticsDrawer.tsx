import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { X, TrendingUp } from 'lucide-react';
import { getStationDisplayName, getBrand, FRESH_HOURS } from '../utils';

const FUEL_TYPES = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'];
const FUEL_LABEL: Record<string, string> = { 'Bensiin 95': '95', 'Bensiin 98': '98', 'Diisel': 'D', 'LPG': 'LPG' };
const DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function StatisticsDrawer({
  isOpen, onClose, stations, prices, session, onStationSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  stations: any[];
  prices: any[];
  session: any;
  onStationSelect?: (station: any) => void;
}) {
  const { t } = useTranslation();
  const [selectedFuel, setSelectedFuel] = useState<string>('Bensiin 95');
  const now = Date.now();
  const horizonMs = DAYS * DAY_MS;

  const recent = useMemo(
    () => prices.filter(p => now - new Date(p.reported_at).getTime() < horizonMs),
    [prices, now, horizonMs]
  );

  const trendsByFuel = useMemo(() => {
    const out: Record<string, { day: number; avg: number }[]> = {};
    for (const f of FUEL_TYPES) {
      const byDay = new Map<number, number[]>();
      for (const p of recent) {
        if (p.fuel_type !== f) continue;
        const day = Math.floor(new Date(p.reported_at).getTime() / (24 * 60 * 60 * 1000));
        const arr = byDay.get(day) || [];
        arr.push(p.price);
        byDay.set(day, arr);
      }
      const pts = [...byDay.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day, arr]) => ({ day, avg: arr.reduce((s, v) => s + v, 0) / arr.length }));
      out[f] = pts;
    }
    return out;
  }, [recent]);

  const stationById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of stations) m.set(s.id, s);
    return m;
  }, [stations]);

  const brandMedians = useMemo(() => {
    const byBrand = new Map<string, number[]>();
    for (const p of recent) {
      if (p.fuel_type !== selectedFuel) continue;
      const st = stationById.get(p.station_id);
      if (!st) continue;
      const brand = getBrand(st.name);
      const arr = byBrand.get(brand) || [];
      arr.push(p.price);
      byBrand.set(brand, arr);
    }
    return [...byBrand.entries()]
      .map(([brand, arr]) => ({ brand, median: median(arr), n: arr.length }))
      .filter(x => x.n >= 3)
      .sort((a, b) => a.median - b.median);
  }, [recent, stationById, selectedFuel]);

  // Latest FRESH price per station for the selected fuel — used by "Odavaim hetkel"
  // so we don't surface stale numbers as current. 5h matches the app's freshness bar.
  const freshLatestByStation = useMemo(() => {
    const m = new Map<string, { price: number; reportedAt: number }>();
    const freshCutoff = now - FRESH_HOURS * 60 * 60 * 1000;
    for (const p of recent) {
      if (p.fuel_type !== selectedFuel) continue;
      const t = new Date(p.reported_at).getTime();
      if (t < freshCutoff) continue;
      const cur = m.get(p.station_id);
      if (!cur || t > cur.reportedAt) m.set(p.station_id, { price: p.price, reportedAt: t });
    }
    return m;
  }, [recent, selectedFuel, now]);

  const cheapestNow = useMemo(() => {
    let best: { station: any; price: number; reportedAt: number } | null = null;
    for (const [stationId, v] of freshLatestByStation) {
      const st = stationById.get(stationId);
      if (!st) continue;
      if (!best || v.price < best.price) best = { station: st, price: v.price, reportedAt: v.reportedAt };
    }
    return best;
  }, [freshLatestByStation, stationById]);

  // Biggest 7-day drops: compare latest price in 0–7d window vs. 7–14d window per (station, fuel).
  const biggestDrops = useMemo(() => {
    const cutoffNow = now;
    const cutoff7 = now - 7 * DAY_MS;
    const cutoff14 = now - 14 * DAY_MS;
    const map = new Map<string, { recent: { price: number; t: number } | null; prior: { price: number; t: number } | null; fuel: string; stationId: string }>();
    for (const p of recent) {
      const t = new Date(p.reported_at).getTime();
      const key = `${p.station_id}|${p.fuel_type}`;
      const entry = map.get(key) || { recent: null, prior: null, fuel: p.fuel_type, stationId: p.station_id };
      if (t >= cutoff7 && t <= cutoffNow) {
        if (!entry.recent || t > entry.recent.t) entry.recent = { price: p.price, t };
      } else if (t >= cutoff14 && t < cutoff7) {
        if (!entry.prior || t > entry.prior.t) entry.prior = { price: p.price, t };
      }
      map.set(key, entry);
    }
    const rows: { station: any; fuel: string; oldPrice: number; newPrice: number; delta: number }[] = [];
    for (const e of map.values()) {
      if (!e.recent || !e.prior) continue;
      const delta = e.recent.price - e.prior.price;
      if (delta >= 0) continue;
      const st = stationById.get(e.stationId);
      if (!st) continue;
      rows.push({ station: st, fuel: e.fuel, oldPrice: e.prior.price, newPrice: e.recent.price, delta });
    }
    return rows.sort((a, b) => a.delta - b.delta).slice(0, 5);
  }, [recent, stationById, now]);

  const userCount = useMemo(
    () => session?.user?.id ? prices.filter(p => p.user_id === session.user.id).length : 0,
    [prices, session]
  );

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      zIndex: 1500, display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%', background: 'var(--color-bg)',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom)) 20px',
        display: 'flex', flexDirection: 'column', gap: 20,
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div className="flex-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TrendingUp size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 className="heading-1">{t('stats.title', { days: DAYS })}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>{t('stats.trends.heading')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {FUEL_TYPES.map(f => {
              const pts = trendsByFuel[f];
              if (!pts || pts.length < 2) {
                return (
                  <div key={f} className="glass-panel" style={{ padding: 10, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.85rem' }}>{f}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('stats.trends.notEnoughData')}</div>
                  </div>
                );
              }
              const min = Math.min(...pts.map(p => p.avg));
              const max = Math.max(...pts.map(p => p.avg));
              const w = 140, h = 40;
              const first = pts[0].day, last = pts[pts.length - 1].day;
              const xs = (d: number) => last === first ? w : ((d - first) / (last - first)) * w;
              const ys = (v: number) => max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
              const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(p.day).toFixed(1)} ${ys(p.avg).toFixed(1)}`).join(' ');
              const latest = pts[pts.length - 1].avg;
              const earliest = pts[0].avg;
              const delta = latest - earliest;
              return (
                <div key={f} className="glass-panel" style={{ padding: 10, borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{f}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)' }}>€{latest.toFixed(3)}</span>
                    <span style={{ fontSize: '0.75rem', color: delta >= 0 ? 'var(--color-warning)' : 'var(--color-fresh)' }}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(1)}¢
                    </span>
                  </div>
                  <svg width={w} height={h} style={{ marginTop: 4 }}>
                    <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={1.5} />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{t('stats.fuelLabel')}</span>
            {FUEL_TYPES.map(f => (
              <button
                key={f}
                onClick={() => setSelectedFuel(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: selectedFuel === f ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-alpha-12)',
                  background: selectedFuel === f ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-surface-alpha-06)',
                  color: selectedFuel === f ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: selectedFuel === f ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {FUEL_LABEL[f] ?? f}
              </button>
            ))}
          </div>

          {!cheapestNow && (
            <div className="glass-panel" style={{
              padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 12,
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('stats.cheapestNow.heading')}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                {t('stats.cheapestNow.noFresh', { hours: FRESH_HOURS })}
              </div>
            </div>
          )}

          {cheapestNow && (
            <button
              type="button"
              onClick={() => {
                if (onStationSelect && cheapestNow) {
                  onStationSelect(cheapestNow.station);
                  onClose();
                }
              }}
              disabled={!onStationSelect}
              className="glass-panel"
              style={{
                padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 12,
                background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
                display: 'block', width: '100%', textAlign: 'left',
                color: 'var(--color-text)', font: 'inherit',
                cursor: onStationSelect ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('stats.cheapestNow.heading')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{getStationDisplayName(cheapestNow.station)}</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>€{cheapestNow.price.toFixed(3)}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {(() => {
                  const h = Math.floor((now - cheapestNow.reportedAt) / (60 * 60 * 1000));
                  if (h < 1) return t('time.justNow');
                  if (h < 24) return t('time.hoursAgo', { count: h });
                  return t('time.daysAgo', { count: Math.floor(h / 24) });
                })()}
              </div>
            </button>
          )}

          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>{t('stats.brandMedians.heading', { fuel: selectedFuel })}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {brandMedians.slice(0, 10).map((b, i) => (
              <div key={b.brand} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px',
                background: i === 0 ? 'rgba(34,197,94,0.12)' : 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)', borderRadius: 8, fontSize: '0.9rem' }}>
                <span>{i + 1}. {b.brand} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>({b.n})</span></span>
                <span style={{ fontWeight: 600 }}>€{b.median.toFixed(3)}</span>
              </div>
            ))}
            {brandMedians.length === 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{t('stats.brandMedians.empty')}</div>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>{t('stats.drops.heading')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {biggestDrops.map(d => (
              <div key={`${d.station.id}-${d.fuel}`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '8px 10px', background: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)', borderRadius: 8, fontSize: '0.85rem',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getStationDisplayName(d.station)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    {FUEL_LABEL[d.fuel] ?? d.fuel} · €{d.oldPrice.toFixed(3)} → €{d.newPrice.toFixed(3)}
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--color-fresh)' }}>
                  ▼ {Math.abs(d.delta * 100).toFixed(1)}¢
                </span>
              </div>
            ))}
            {biggestDrops.length === 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{t('stats.drops.empty')}</div>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>{t('stats.contribution.heading')}</h3>
          <div className="glass-panel" style={{ padding: 12, borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
            {session ? (
              <Trans
                i18nKey="stats.contribution.body"
                values={{ count: userCount, days: DAYS }}
                components={{ strong: <strong /> }}
              />
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>{t('stats.contribution.signIn')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
