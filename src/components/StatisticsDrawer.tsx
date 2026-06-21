import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { X, TrendingUp } from 'lucide-react';
import { getStationDisplayName, getBrand, FRESH_HOURS, EXPIRY_HOURS, fuelLabel } from '../utils';
import {
  SignalChip,
  ConfidenceBar,
  NumbersBlock,
  type MarketInsight,
  type SignalBreakdown,
} from './MarketInsightDrawer';

const FUEL_TYPES = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'];
const FUEL_LABEL: Record<string, string> = { 'Bensiin 95': '95', 'Bensiin 98': '98', 'Diisel': 'D', 'LPG': 'LPG' };
const DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Robust-trend tuning. Endpoints are pooled over several days so a single
// boundary report can't swing the headline; see trendsByFuel.
const MIN_DAY_SAMPLES = 2;        // a day needs this many reports to anchor the sparkline
const CURRENT_WINDOW_DAYS = 3;    // "current" price = median of the last N days …
const CURRENT_WIDEN_DAYS = 7;     // … widened to this when the last 3 days are sparse
const ENDPOINT_WINDOW_DAYS = 5;   // earliest reference = median of the first N days of data
const MIN_ENDPOINT_SAMPLES = 3;   // each endpoint needs this many reports or the change is hidden
const BRAND_WINDOW_DAYS = 14;     // brand-median ranking window (fresh + comparable)
const MIN_BRAND_SAMPLES = 3;      // brands below this are dropped from the ranking
const DROP_WINDOW_REQ = 2;        // biggest-drops: reports required each side (anti-artifact)
const DROP_MARKET_MARGIN = 0.005; // …and must beat the market median drop by ≥0.5¢

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmtPctSigned(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n) * 100;
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${abs.toFixed(1)}%`;
}

function fmtPpSigned(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n) * 100;
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${abs.toFixed(1)}pp`;
}

// Shows exactly which inputs drove each fuel's signal — the wholesale vs pump
// 7-day deltas, the divergence between them, and the rule that matched. All
// derived from the deterministic signal in `data.signals`; no LLM involved.
function WhyBlock({
  diesel, gasoline, dieselSamples, gasolineSamples,
}: {
  diesel?: SignalBreakdown;
  gasoline?: SignalBreakdown;
  dieselSamples: number;
  gasolineSamples: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rows: Array<{ fuelKey: 'diesel' | 'gasoline95'; s: SignalBreakdown; samples: number }> = [];
  if (diesel) rows.push({ fuelKey: 'diesel', s: diesel, samples: dieselSamples });
  if (gasoline) rows.push({ fuelKey: 'gasoline95', s: gasoline, samples: gasolineSamples });
  if (rows.length === 0) return null;

  return (
    <div style={{
      marginTop: 12,
      padding: 12,
      borderRadius: 10,
      background: 'var(--color-surface-alpha-06)',
      border: '1px solid var(--color-surface-border)',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'var(--color-text-muted)',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: 0.3,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
        {t('marketInsight.why.heading', 'MIKS SELLINE SIGNAAL?')}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(({ fuelKey, s, samples }) => (
            <div key={fuelKey} style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {t(`marketInsight.fuel.${fuelKey}`)} · {t(`marketInsight.signal.${s.signal}`)}
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                color: 'var(--color-text-muted)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.8rem',
              }}>
                <span>{t('marketInsight.why.wholesale', 'Hulgi 7p')}: <strong style={{ color: 'var(--color-text)' }}>{fmtPctSigned(s.wholesaleDelta7d)}</strong></span>
                <span>{t('marketInsight.why.pump', 'Pump 7p')}: <strong style={{ color: 'var(--color-text)' }}>{fmtPctSigned(s.pumpDelta7d)}</strong></span>
                <span>{t('marketInsight.why.gap', 'Vahe')}: <strong style={{ color: 'var(--color-text)' }}>{fmtPpSigned(s.divergence)}</strong></span>
                <span>{samples} {t('marketInsight.why.samples', 'raportit')}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: '0.85rem', lineHeight: 1.4 }}>
                {t(`marketInsight.why.reason.${s.reasonCode}`, s.reasonCode)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatisticsDrawer({
  isOpen, onClose, stations, prices, session, onStationSelect, insight,
}: {
  isOpen: boolean;
  onClose: () => void;
  stations: any[];
  prices: any[];
  session: any;
  onStationSelect?: (station: any) => void;
  insight?: MarketInsight | null;
}) {
  const { t, i18n } = useTranslation();
  const [selectedFuel, setSelectedFuel] = useState<string>('Bensiin 95');
  // eslint-disable-next-line react-hooks/purity -- horizon "now" anchor for trend window; intentionally captured per render.
  const now = Date.now();
  const horizonMs = DAYS * DAY_MS;

  const recent = useMemo(
    () => prices.filter(p => now - new Date(p.reported_at).getTime() < horizonMs),
    [prices, now, horizonMs]
  );

  // Robust per-fuel trend. Two failure modes we design around:
  //  · the headline change used to compare a single boundary day to another
  //    single day — with n=1 on either end, one report swung it by 10¢+;
  //  · "today" is a partial day (only the morning's reports), so the latest
  //    day-median jumped around through the day.
  // Fix: the displayed price is a median over the last few DAYS of reports
  // (widened if sparse), and the change is that vs. a median over the first
  // few days of the window — both pooled across days, never a single report.
  const trendsByFuel = useMemo(() => {
    const ts = (p: any) => new Date(p.reported_at).getTime();
    const out: Record<string, { pts: { day: number; med: number }[]; current: number | null; delta: number | null }> = {};
    for (const f of FUEL_TYPES) {
      const rows = recent.filter(p => p.fuel_type === f);

      // Daily medians for the sparkline. Prefer days with enough samples so a
      // lone report can't spike the line; fall back to all days if that leaves
      // too few points (sparse fuels like LPG). Median, not mean, per phase 50.
      const byDay = new Map<number, number[]>();
      for (const p of rows) {
        const day = Math.floor(ts(p) / DAY_MS);
        const arr = byDay.get(day) || [];
        arr.push(p.price);
        byDay.set(day, arr);
      }
      const allPts = [...byDay.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day, arr]) => ({ day, med: median(arr), n: arr.length }));
      let dayPts = allPts.filter(p => p.n >= MIN_DAY_SAMPLES);
      if (dayPts.length < 2) dayPts = allPts;

      // Robust "current" price: median of the last few days, widened if sparse.
      const windowMedian = (loDaysAgo: number) => {
        const lo = now - loDaysAgo * DAY_MS;
        const xs = rows.filter(p => ts(p) >= lo).map(p => p.price);
        return { med: xs.length ? median(xs) : null, n: xs.length };
      };
      let cur = windowMedian(CURRENT_WINDOW_DAYS);
      if (cur.n < MIN_ENDPOINT_SAMPLES) cur = windowMedian(CURRENT_WIDEN_DAYS);

      // Robust earliest reference: median of the first few days of data in the
      // 30-day window. null when too sparse → the headline change is hidden
      // rather than shown off a single boundary report.
      let earliest: number | null = null;
      if (rows.length) {
        const firstTs = Math.min(...rows.map(ts));
        const xs = rows.filter(p => ts(p) <= firstTs + ENDPOINT_WINDOW_DAYS * DAY_MS).map(p => p.price);
        earliest = xs.length >= MIN_ENDPOINT_SAMPLES ? median(xs) : null;
      }
      const current = cur.med;
      const delta = current != null && earliest != null ? current - earliest : null;
      out[f] = { pts: dayPts.map(p => ({ day: p.day, med: p.med })), current, delta };
    }
    return out;
  }, [recent, now]);

  const stationById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of stations) m.set(s.id, s);
    return m;
  }, [stations]);

  // Per-brand median over a single recent window (not the full 30 days). The
  // 30-day median read ~10¢ stale in a trending month, and mixing windows made
  // the ranking unfair — a brand with only older reports looked pricier than it
  // is. One shared window keeps every brand on the same fresh, comparable basis;
  // exact ties break toward the brand with more samples.
  const brandMedians = useMemo(() => {
    const lo = now - BRAND_WINDOW_DAYS * DAY_MS;
    const byBrand = new Map<string, number[]>();
    for (const p of recent) {
      if (p.fuel_type !== selectedFuel) continue;
      if (new Date(p.reported_at).getTime() < lo) continue;
      const st = stationById.get(p.station_id);
      if (!st) continue;
      const brand = getBrand(st.name);
      const arr = byBrand.get(brand) || [];
      arr.push(p.price);
      byBrand.set(brand, arr);
    }
    return [...byBrand.entries()]
      .map(([brand, arr]) => ({ brand, median: median(arr), n: arr.length }))
      .filter(x => x.n >= MIN_BRAND_SAMPLES)
      .sort((a, b) => a.median - b.median || b.n - a.n);
  }, [recent, stationById, selectedFuel, now]);

  // Latest price per station for the selected fuel within the 24h expiry window.
  // "Odavaim hetkel" prefers genuinely fresh (≤5h) data, but a hard 5h gate left
  // the flagship tile blank most of the day (overnight gaps + bursty reporting),
  // so we fall back to the freshest report inside 24h and mark it stale in the UI.
  const freshLatestByStation = useMemo(() => {
    const m = new Map<string, { price: number; reportedAt: number }>();
    const cutoff = now - EXPIRY_HOURS * 60 * 60 * 1000;
    for (const p of recent) {
      if (p.fuel_type !== selectedFuel) continue;
      const t = new Date(p.reported_at).getTime();
      if (t < cutoff) continue;
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

  // Older than the 5h freshness bar → keep showing it (better than blank) but
  // drop the green "fresh" framing and flag it as a not-current price.
  const cheapestNowStale = cheapestNow ? now - cheapestNow.reportedAt > FRESH_HOURS * 60 * 60 * 1000 : false;

  // Biggest 7-day drops, reworked to surface genuine station-specific bargains
  // instead of market beta. Three reliability changes vs. the old version:
  //  · compares the MEDIAN of each window, not a single latest report, so one
  //    misread (or a premium-vs-regular reading inside the "Diisel" bucket)
  //    can't fabricate a drop — both sides need ≥2 corroborating reports;
  //  · subtracts the market-wide median drop for that fuel, so a station only
  //    qualifies if it fell MORE than the market did;
  //  · ranks by that market-relative excess.
  const biggestDrops = useMemo(() => {
    const cutoff7 = now - 7 * DAY_MS;
    const cutoff14 = now - 14 * DAY_MS;
    const map = new Map<string, { recent: number[]; prior: number[]; fuel: string; stationId: string }>();
    for (const p of recent) {
      const t = new Date(p.reported_at).getTime();
      const key = `${p.station_id}|${p.fuel_type}`;
      const entry = map.get(key) || { recent: [] as number[], prior: [] as number[], fuel: p.fuel_type, stationId: p.station_id };
      if (t >= cutoff7 && t <= now) entry.recent.push(p.price);
      else if (t >= cutoff14 && t < cutoff7) entry.prior.push(p.price);
      map.set(key, entry);
    }
    // Corroborated per-(station,fuel) median delta + the market median delta per fuel.
    const perStation: { stationId: string; fuel: string; oldPrice: number; newPrice: number; delta: number }[] = [];
    const marketDeltas = new Map<string, number[]>();
    for (const e of map.values()) {
      if (e.recent.length < DROP_WINDOW_REQ || e.prior.length < DROP_WINDOW_REQ) continue;
      const newPrice = median(e.recent);
      const oldPrice = median(e.prior);
      const delta = newPrice - oldPrice;
      perStation.push({ stationId: e.stationId, fuel: e.fuel, oldPrice, newPrice, delta });
      const arr = marketDeltas.get(e.fuel) || [];
      arr.push(delta);
      marketDeltas.set(e.fuel, arr);
    }
    const marketDelta = new Map<string, number>();
    for (const [fuel, arr] of marketDeltas) marketDelta.set(fuel, median(arr));

    return perStation
      .map(r => ({ ...r, excess: r.delta - (marketDelta.get(r.fuel) ?? 0) }))
      .filter(r => r.delta < 0 && r.excess < -DROP_MARKET_MARGIN)
      .map(r => ({ station: stationById.get(r.stationId), fuel: r.fuel, oldPrice: r.oldPrice, newPrice: r.newPrice, delta: r.delta, excess: r.excess }))
      .filter(r => !!r.station)
      .sort((a, b) => a.excess - b.excess)
      .slice(0, 5);
  }, [recent, stationById, now]);

  const userCount = useMemo(
    () => session?.user?.id ? prices.filter(p => p.user_id === session.user.id).length : 0,
    [prices, session]
  );

  // Current-locale pick for Gemini text. Falls through EN → ET so partial
  // Gemini responses or legacy rows never leave the section empty.
  const lang = (i18n.language || 'en').slice(0, 2) as 'et' | 'en' | 'ru' | 'fi' | 'lv' | 'lt';
  const pickInsightText = (field: 'headline' | 'content'): string => {
    if (!insight) return '';
    const chain: Array<'et' | 'en' | 'ru' | 'fi' | 'lv' | 'lt'> = [lang, 'en', 'et'];
    for (const l of chain) {
      const v = (insight as any)[`${field}_${l}`];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return field === 'content' ? (insight.content_et || '') : '';
  };
  const insightContent = pickInsightText('content');
  const insightHeadline = pickInsightText('headline');
  const hasSignals = !!(insight && (insight.signal_diesel || insight.signal_gasoline));

  const getInsightRelativeTime = (dateStr: string) => {
    // eslint-disable-next-line react-hooks/purity -- relative-time label; Date.now() is the intended source of "now" for display freshness.
    const diffHours = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return t('time.justNow');
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    return t('time.daysAgo', { count: Math.floor(diffHours / 24) });
  };

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      zIndex: 1500, display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%', background: 'var(--color-bg)',
        padding: 'calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom)) 20px',
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

        <div className="stats-grid">
          <div className="stats-col">
        {insight && (
          <div>
            <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
              {t('marketInsight.title', 'Turu Ülevaade')}
            </h3>
            {hasSignals && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {insight.signal_diesel && (
                    <SignalChip
                      fuel={t('marketInsight.fuel.diesel', 'Diisel')}
                      signal={insight.signal_diesel}
                    />
                  )}
                  {insight.signal_gasoline && (
                    <SignalChip
                      fuel={t('marketInsight.fuel.gasoline95', 'Bensiin 95')}
                      signal={insight.signal_gasoline}
                    />
                  )}
                </div>
                {insight.data?.signals && (
                  <WhyBlock
                    diesel={insight.data.signals.diesel}
                    gasoline={insight.data.signals.gasoline}
                    dieselSamples={insight.data.kyts?.diesel?.samples7d ?? 0}
                    gasolineSamples={insight.data.kyts?.gasoline95?.samples7d ?? 0}
                  />
                )}
                {typeof insight.confidence === 'number' && <ConfidenceBar value={insight.confidence} />}
              </>
            )}
            {insightHeadline && (
              <h4 style={{ margin: '14px 0 8px 0', fontSize: '1.05rem', color: 'var(--color-text)', lineHeight: 1.35 }}>
                {insightHeadline}
              </h4>
            )}
            {insightContent && (
              <div style={{ lineHeight: 1.6, fontSize: '0.95rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                {insightContent}
              </div>
            )}
            {insight.data && <NumbersBlock data={insight.data} />}
            <div style={{
              marginTop: 12,
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
            }}>
              <span>{getInsightRelativeTime(insight.created_at)}</span>
              {hasSignals && (
                <span style={{ fontStyle: 'italic' }}>
                  {t('marketInsight.disclaimer', 'Indikatiivne — mitte investeerimisnõuanne')}
                </span>
              )}
            </div>
          </div>
        )}

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
                background: cheapestNowStale ? 'var(--color-surface)' : 'rgba(34,197,94,0.10)',
                border: cheapestNowStale ? '1px solid var(--color-surface-border)' : '1px solid rgba(34,197,94,0.3)',
                display: 'block', width: '100%', textAlign: 'left',
                color: 'var(--color-text)', font: 'inherit',
                cursor: onStationSelect ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{t('stats.cheapestNow.heading')}</span>
                {cheapestNowStale && (
                  <span style={{ color: 'var(--color-warning)' }}>{t('stats.cheapestNow.stale', 'pole värske')}</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{getStationDisplayName(cheapestNow.station)}</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: cheapestNowStale ? 'var(--color-text)' : 'var(--color-primary)' }}>€{cheapestNow.price.toFixed(3)}</span>
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
          </div>

          <div className="stats-col">
        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>{t('stats.trends.heading')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {FUEL_TYPES.map(f => {
              const trend = trendsByFuel[f];
              const pts = trend?.pts ?? [];
              if (!trend || trend.current == null || pts.length < 2) {
                return (
                  <div key={f} className="glass-panel" style={{ padding: 10, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.85rem' }}>{fuelLabel(f, t)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('stats.trends.notEnoughData')}</div>
                  </div>
                );
              }
              const min = Math.min(...pts.map(p => p.med));
              const max = Math.max(...pts.map(p => p.med));
              const w = 140, h = 40;
              const first = pts[0].day, last = pts[pts.length - 1].day;
              const xs = (d: number) => last === first ? w : ((d - first) / (last - first)) * w;
              const ys = (v: number) => max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
              const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(p.day).toFixed(1)} ${ys(p.med).toFixed(1)}`).join(' ');
              const current = trend.current;
              const delta = trend.delta;
              return (
                <div key={f} className="glass-panel" style={{ padding: 10, borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{fuelLabel(f, t)}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)' }}>€{current.toFixed(3)}</span>
                    {delta != null && (
                      <span style={{ fontSize: '0.75rem', color: delta >= 0 ? 'var(--color-warning)' : 'var(--color-fresh)' }}>
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(1)}¢
                      </span>
                    )}
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
                    {' · '}
                    <span style={{ color: 'var(--color-fresh)' }}>
                      {Math.abs(d.excess * 100).toFixed(1)}¢ {t('stats.drops.belowMarket', 'alla turu')}
                    </span>
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
