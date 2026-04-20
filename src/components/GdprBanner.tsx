import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { initAnalytics, setAnalyticsOptOut } from '../utils/analytics';

type Props = {
  onOpenPrivacy: () => void;
  onOpenTerms?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
};

export function GdprBanner({ onOpenPrivacy, onOpenTerms, onAccept, onDecline }: Props) {
  const { t } = useTranslation();
  // Honour both the new key and the legacy one so returning users who
  // already consented are not re-prompted.
  const [isVisible, setIsVisible] = useState(() => {
    try {
      const consent = localStorage.getItem('gdpr_consent');
      const legacy = localStorage.getItem('gdpr_accepted') === 'true';
      return !consent && !legacy;
    } catch { return false; }
  });

  if (!isVisible) return null;

  const handleAccept = () => {
    localStorage.setItem('gdpr_consent', 'accepted');
    setIsVisible(false);
    initAnalytics();
    onAccept?.();
  };

  const handleDecline = () => {
    localStorage.setItem('gdpr_consent', 'declined');
    setAnalyticsOptOut(true);
    setIsVisible(false);
    onDecline?.();
  };

  const linkBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--color-primary)',
    cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline',
  };

  // Both buttons share padding/font/border-radius so reject has equal prominence
  // to accept (GDPR requirement). Accept is filled-primary; decline is a neutral
  // filled button — NOT a text link, which would fail the equal-prominence test.
  const btnBase: React.CSSProperties = {
    flex: 1,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    padding: '10px',
    fontSize: '0.95rem',
    fontWeight: 'bold',
    cursor: 'pointer',
  };

  return (
    <div className="glass-panel animate-slide-up" style={{
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      right: '16px',
      backgroundColor: 'var(--color-overlay-bg)',
      padding: '16px',
      zIndex: 2500,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
    }}>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: '1.4', margin: 0 }}>
        <Trans
          i18nKey="gdpr.body"
          components={{
            terms: onOpenTerms
              ? <button onClick={onOpenTerms} style={linkBtnStyle} />
              : <span />,
            privacy: <button onClick={onOpenPrivacy} style={linkBtnStyle} />,
          }}
        />
      </p>

      <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
        <button
          onClick={handleDecline}
          style={{
            ...btnBase,
            background: 'var(--color-surface-alpha-12)',
            color: 'var(--color-text)',
          }}
        >
          {t('gdpr.decline')}
        </button>
        <button
          onClick={handleAccept}
          style={{
            ...btnBase,
            background: 'var(--color-primary)',
            color: 'white',
          }}
        >
          {t('gdpr.accept')}
        </button>
      </div>
    </div>
  );
}
