import { useTranslation } from 'react-i18next';
import { Newspaper, X, TrendingUp, TrendingDown, Minus, Zap, Pause } from 'lucide-react';

export type Signal = 'buy_now' | 'hold' | 'wait' | 'neutral';

type GlobalSeries = {
  today: number;
  delta7d: number;
  asOf: string;
} | null;

export type InsightData = {
  kyts?: {
    diesel?: { today: number | null; prev7: number | null; samples7d: number };
    gasoline95?: { today: number | null; prev7: number | null; samples7d: number };
  };
  globals?: {
    brent?: GlobalSeries;
    eurUsd?: GlobalSeries;
    gasoil?: GlobalSeries;
    rbob?: GlobalSeries;
  };
  signals?: Record<string, unknown>;
};

export interface MarketInsight {
  id: string;
  created_at: string;
  content_et: string;
  content_en?: string | null;
  content_ru?: string | null;
  content_fi?: string | null;
  content_lv?: string | null;
  content_lt?: string | null;
  headline_et?: string | null;
  headline_en?: string | null;
  headline_ru?: string | null;
  headline_fi?: string | null;
  headline_lv?: string | null;
  headline_lt?: string | null;
  trend?: 'up' | 'down' | 'flat' | null;
  signal_diesel?: Signal | null;
  signal_gasoline?: Signal | null;
  confidence?: number | null;
  data?: InsightData | null;
}

const SIGNAL_COLORS: Record<Signal, { bg: string; fg: string; border: string }> = {
  buy_now: { bg: 'rgba(34,197,94,0.18)',  fg: '#22c55e', border: 'rgba(34,197,94,0.45)' },
  hold:    { bg: 'rgba(250,204,21,0.18)', fg: '#facc15', border: 'rgba(250,204,21,0.45)' },
  wait:    { bg: 'rgba(239,68,68,0.18)',  fg: '#ef4444', border: 'rgba(239,68,68,0.45)' },
  neutral: { bg: 'rgba(148,163,184,0.18)',fg: '#94a3b8', border: 'rgba(148,163,184,0.45)' },
};

function SignalIcon({ signal, size = 18 }: { signal: Signal; size?: number }) {
  switch (signal) {
    case 'buy_now': return <Zap size={size} />;
    case 'wait':    return <Pause size={size} />;
    case 'hold':    return <Minus size={size} />;
    case 'neutral': return <Minus size={size} />;
  }
}

export function SignalChip({ fuel, signal }: { fuel: string; signal: Signal }) {
  const { t } = useTranslation();
  const c = SIGNAL_COLORS[signal];
  const labelKey = `marketInsight.signal.${signal}`;
  const defaults: Record<Signal, string> = {
    buy_now: 'OSTA NÜÜD',
    hold:    'OOTA',
    wait:    'OOTA 3-5 PÄEVA',
    neutral: 'RAHULIK',
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      borderRadius: 12,
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.fg,
    }}>
      <SignalIcon signal={signal} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{fuel}</span>
        <strong style={{ fontSize: '0.95rem' }}>{t(labelKey, defaults[signal])}</strong>
      </div>
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
        <span>{t('marketInsight.confidence', 'Kindel')}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-surface-alpha-12)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-primary)' }} />
      </div>
    </div>
  );
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n) * 100;
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${abs.toFixed(1)}%`;
}

function fmtEur(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(3)}€`;
}

function fmtUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—';
  return `$${n.toFixed(digits)}`;
}

function DeltaArrow({ delta }: { delta: number | null | undefined }) {
  if (delta == null || !isFinite(delta)) return null;
  if (Math.abs(delta) < 0.005) return <Minus size={12} style={{ color: 'var(--color-text-muted)' }} />;
  return delta > 0
    ? <TrendingUp size={12} style={{ color: '#ef4444' }} />
    : <TrendingDown size={12} style={{ color: '#22c55e' }} />;
}

export function NumbersBlock({ data }: { data: InsightData }) {
  const { t } = useTranslation();
  const rows: Array<{ label: string; value: string; delta?: number | null }> = [];

  const d = data.kyts?.diesel;
  if (d?.today != null) {
    const delta = d.prev7 ? (d.today - d.prev7) / d.prev7 : null;
    rows.push({ label: t('marketInsight.row.kytsDiesel', 'Kyts D keskmine'), value: fmtEur(d.today), delta });
  }
  const g = data.kyts?.gasoline95;
  if (g?.today != null) {
    const delta = g.prev7 ? (g.today - g.prev7) / g.prev7 : null;
    rows.push({ label: t('marketInsight.row.kyts95', 'Kyts 95 keskmine'), value: fmtEur(g.today), delta });
  }
  if (data.globals?.brent) {
    rows.push({ label: t('marketInsight.row.brent', 'Brent'), value: fmtUsd(data.globals.brent.today), delta: data.globals.brent.delta7d });
  }
  if (data.globals?.eurUsd) {
    rows.push({ label: t('marketInsight.row.eurUsd', 'EUR/USD'), value: fmtUsd(data.globals.eurUsd.today, 3), delta: data.globals.eurUsd.delta7d });
  }
  if (data.globals?.gasoil) {
    rows.push({ label: t('marketInsight.row.gasoil', 'ICE Gasoil 7p'), value: fmtPct(data.globals.gasoil.delta7d), delta: data.globals.gasoil.delta7d });
  }
  if (data.globals?.rbob) {
    rows.push({ label: t('marketInsight.row.rbob', 'NYMEX RBOB 7p'), value: fmtPct(data.globals.rbob.delta7d), delta: data.globals.rbob.delta7d });
  }
  if (rows.length === 0) return null;

  return (
    <div style={{
      marginTop: 16,
      padding: 12,
      borderRadius: 10,
      background: 'var(--color-surface-alpha-06)',
      border: '1px solid var(--color-surface-border)',
    }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: 0.3 }}>
        {t('marketInsight.numbers', 'NUMBRID')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', color: 'var(--color-text)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{r.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
              <DeltaArrow delta={r.delta} />
              {r.value}
              {r.delta != null && r.label.indexOf('7p') === -1 && (
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>({fmtPct(r.delta)})</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketInsightDrawer({
  isOpen,
  onClose,
  insight,
}: {
  isOpen: boolean;
  onClose: () => void;
  insight: MarketInsight | null;
}) {
  const { t, i18n } = useTranslation();
  if (!isOpen || !insight) return null;

  // Pick the current locale's content if Gemini produced it (v1.1+ writes
  // all six). Fall back through EN → ET so legacy rows or partial responses
  // never leave the drawer empty.
  const lang = (i18n.language || 'en').slice(0, 2) as 'et' | 'en' | 'ru' | 'fi' | 'lv' | 'lt';
  const pickText = (field: 'headline' | 'content'): string => {
    const chain: Array<'et' | 'en' | 'ru' | 'fi' | 'lv' | 'lt'> = [lang, 'en', 'et'];
    for (const l of chain) {
      const v = (insight as any)[`${field}_${l}`];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return field === 'content' ? insight.content_et : '';
  };
  const content  = pickText('content');
  const headline = pickText('headline');

  // Legacy rows have no signal_* fields; fall back to the original layout.
  const hasSignals = !!(insight.signal_diesel || insight.signal_gasoline);

  const legacyIcon = () => {
    switch (insight.trend) {
      case 'up':   return <TrendingUp size={24} color="#ef4444" />;
      case 'down': return <TrendingDown size={24} color="#10b981" />;
      case 'flat': return <Minus size={24} color="#6b7280" />;
      default:     return <Newspaper size={24} color="var(--color-primary)" />;
    }
  };

  const getRelativeTime = (dateStr: string) => {
    const diffHours = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return t('time.justNow', 'just nüüd');
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours, defaultValue: `${diffHours}h tagasi` });
    const days = Math.floor(diffHours / 24);
    return t('time.daysAgo', { count: days, defaultValue: `${days}p tagasi` });
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%',
        maxHeight: '85dvh',
        backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: '24px 24px calc(24px + env(safe-area-inset-bottom)) 24px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 20,
              background: 'var(--color-surface-alpha-12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {hasSignals ? <Newspaper size={24} color="var(--color-primary)" /> : legacyIcon()}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-text)' }}>
              {t('marketInsight.title', 'Turu Ülevaade')}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
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
              {typeof insight.confidence === 'number' && <ConfidenceBar value={insight.confidence} />}
              {headline && (
                <h3 style={{ margin: '18px 0 10px 0', fontSize: '1.05rem', color: 'var(--color-text)', lineHeight: 1.35 }}>
                  {headline}
                </h3>
              )}
              {insight.data && <NumbersBlock data={insight.data} />}
            </>
          )}

          <div style={{ marginTop: hasSignals ? 16 : 0, lineHeight: 1.6, fontSize: '1rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
            {content}
          </div>
        </div>

        <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{getRelativeTime(insight.created_at)}</span>
          {hasSignals && (
            <span style={{ fontStyle: 'italic' }}>{t('marketInsight.disclaimer', 'Indikatiivne — mitte investeerimisnõuanne')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
