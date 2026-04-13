import { useMemo } from 'react';
import { X, TrendingUp } from 'lucide-react';

const FUEL_TYPES = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'];
const DAYS = 30;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function StatisticsDrawer({
  isOpen, onClose, stations, prices, session,
}: {
  isOpen: boolean;
  onClose: () => void;
  stations: any[];
  prices: any[];
  session: any;
}) {
  const now = Date.now();
  const horizonMs = DAYS * 24 * 60 * 60 * 1000;

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

  const brandMedians = useMemo(() => {
    const stationBrand = new Map<string, string>();
    for (const s of stations) stationBrand.set(s.id, s.name);
    const byBrand = new Map<string, number[]>();
    for (const p of recent) {
      if (p.fuel_type !== 'Bensiin 95') continue;
      const brand = stationBrand.get(p.station_id);
      if (!brand) continue;
      const arr = byBrand.get(brand) || [];
      arr.push(p.price);
      byBrand.set(brand, arr);
    }
    return [...byBrand.entries()]
      .map(([brand, arr]) => ({ brand, median: median(arr), n: arr.length }))
      .filter(x => x.n >= 3)
      .sort((a, b) => a.median - b.median);
  }, [recent, stations]);

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
            <h2 className="heading-1">Statistika ({DAYS} päeva)</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>Hinnatrendid</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {FUEL_TYPES.map(f => {
              const pts = trendsByFuel[f];
              if (!pts || pts.length < 2) {
                return (
                  <div key={f} className="glass-panel" style={{ padding: 10, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.85rem' }}>{f}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>pole piisavalt andmeid</div>
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
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>Soodsaim bränd (95, mediaan)</h3>
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
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Pole piisavalt hindu.</div>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>Minu panus</h3>
          <div className="glass-panel" style={{ padding: 12, borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
            {session ? (
              <>Oled raporteerinud <strong>{userCount}</strong> hinda viimase {DAYS} päeva jooksul.</>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>Logi sisse, et näha oma panust.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
