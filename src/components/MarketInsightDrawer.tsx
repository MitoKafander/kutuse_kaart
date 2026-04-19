import { useTranslation } from 'react-i18next';
import { Newspaper, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface MarketInsight {
  id: string;
  created_at: string;
  content_et: string;
  content_en?: string;
  trend?: 'up' | 'down' | 'flat';
}

export function MarketInsightDrawer({
  isOpen,
  onClose,
  insight
}: {
  isOpen: boolean;
  onClose: () => void;
  insight: MarketInsight | null;
}) {
  const { t, i18n } = useTranslation();
  if (!isOpen || !insight) return null;

  const content = (i18n.language === 'en' && insight.content_en) 
    ? insight.content_en 
    : insight.content_et;

  const getIcon = () => {
    switch (insight.trend) {
      case 'up': return <TrendingUp size={24} color="#ef4444" />;
      case 'down': return <TrendingDown size={24} color="#10b981" />;
      case 'flat': return <Minus size={24} color="#6b7280" />;
      default: return <Newspaper size={24} color="var(--color-primary)" />;
    }
  };

  const getRelativeTime = (dateStr: string) => {
    const diffHours = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return t('common.justNow', 'just nüüd');
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours, defaultValue: `${diffHours}h tagasi` });
    const days = Math.floor(diffHours / 24);
    return t('common.daysAgo', { count: days, defaultValue: `${days}p tagasi` });
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
              {getIcon()}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-text)' }}>
              {t('marketInsight.title', 'Turu Ülevaade')}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', lineHeight: 1.6, fontSize: '1.05rem', color: 'var(--color-text)' }}>
          {content}
        </div>

        <div style={{ marginTop: '24px', fontSize: '0.85rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)', paddingTop: '16px' }}>
          {getRelativeTime(insight.created_at)}
        </div>
      </div>
    </div>
  );
}
