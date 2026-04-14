import { useState, useEffect } from 'react';

export function GdprBanner({ onOpenPrivacy, onOpenTerms }: { onOpenPrivacy: () => void, onOpenTerms?: () => void }) {
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
        Kyts kasutab ainult hädavajalikke küpsiseid (sisselogimine, eelistused). Kasutades nõustud{' '}
        {onOpenTerms ? (
          <button onClick={onOpenTerms} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>kasutustingimustega</button>
        ) : 'kasutustingimustega'}
        {' '}ja{' '}
        <button onClick={onOpenPrivacy} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>privaatsuspoliitikaga</button>.
      </p>

      <button
        onClick={handleAccept}
        style={{
          background: 'var(--color-primary)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '0.95rem', fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        Nõustun
      </button>
    </div>
  );
}
