import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface MarketInsight {
  id: string;
  created_at: string;
  content_et: string;
  content_en?: string;
  trend?: 'up' | 'down' | 'flat';
}

interface MarketInsightBannerProps {
  insight: MarketInsight | null;
  // If DiscoveryBanner is active, we might need to shift this one down further
  isShiftedDown?: boolean; 
}

export function MarketInsightBanner({ insight, isShiftedDown }: MarketInsightBannerProps) {
  const { i18n } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!insight) {
      setIsVisible(false);
      return;
    }

    // Check if user has permanently dismissed this specific insight
    const dismissedInsights = JSON.parse(localStorage.getItem('kyts-dismissed-insights') || '[]');
    if (!dismissedInsights.includes(insight.id)) {
      setIsVisible(true);
      setIsClosing(false);
    }
  }, [insight]);

  if (!insight || (!isVisible && !isClosing)) return null;

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      // Save permanently for this specific insight
      const dismissedInsights = JSON.parse(localStorage.getItem('kyts-dismissed-insights') || '[]');
      dismissedInsights.push(insight.id);
      localStorage.setItem('kyts-dismissed-insights', JSON.stringify(dismissedInsights));
    }, 300); // Wait for transition
  };

  const getIcon = () => {
    switch (insight.trend) {
      case 'up': return <TrendingUp size={18} color="#ef4444" style={{ flexShrink: 0 }} />; // red-500
      case 'down': return <TrendingDown size={18} color="#10b981" style={{ flexShrink: 0 }} />; // emerald-500
      case 'flat': return <Minus size={18} color="#6b7280" style={{ flexShrink: 0 }} />; // gray-500
      default: return null;
    }
  };

  // Select content based on active language
  const content = (i18n.language === 'en' && insight.content_en) 
    ? insight.content_en 
    : insight.content_et;

  return (
    <div
      className="glass-panel"
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        top: `calc(${isShiftedDown ? '195px' : '140px'} + env(safe-area-inset-top))`,
        left: '20px',
        right: '20px',
        zIndex: 900, // Below the search header (1000)
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        // Premium subtle amber/orange tint to signify "Market News" without being alarming
        border: '1px solid rgba(245, 158, 11, 0.3)',
        background: 'rgba(245, 158, 11, 0.08)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: 'var(--color-text)',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: isClosing ? 0 : 1,
        transform: isClosing ? 'translateY(-10px)' : 'translateY(0)',
        pointerEvents: isClosing ? 'none' : 'auto',
      }}
    >
      {getIcon()}
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35, fontSize: '0.85rem' }}>
        {content}
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss market insight"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
          padding: '4px',
          margin: '-4px', // Increase hit area
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
