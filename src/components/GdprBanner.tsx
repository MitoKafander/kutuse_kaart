import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';

export function GdprBanner({ onOpenPrivacy, onOpenTerms, onAccept }: { onOpenPrivacy: () => void, onOpenTerms?: () => void, onAccept?: () => void }) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasAccepted = localStorage.getItem('gdpr_accepted');
    if (!hasAccepted) {
      setIsVisible(true);
    }
  }, []);

  if (!isVisible) return null;

  const handleAccept = () => {
    localStorage.setItem('gdpr_accepted', 'true');
    setIsVisible(false);
    onAccept?.();
  };

  const linkBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--color-primary)',
    cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline',
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

      <button
        onClick={handleAccept}
        style={{
          background: 'var(--color-primary)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '0.95rem', fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        {t('gdpr.accept')}
      </button>
    </div>
  );
}
