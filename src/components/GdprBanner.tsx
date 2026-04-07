import { useState, useEffect } from 'react';

export function GdprBanner({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
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
      backgroundColor: 'rgba(20, 24, 30, 0.95)',
      padding: '16px',
      zIndex: 2500, // High enough to cover map UI, but below modals
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
    }}>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: '1.4', margin: 0 }}>
        Kasutame küpsiseid, et hoida sind sisselogituna ning pakkuda turvalist kasutajakogemust. Loe meie andmekaitse põhimõtetest lähemalt.
      </p>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          onClick={handleAccept}
          style={{
            flex: 1, background: 'var(--color-primary)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '0.95rem', fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Nõustun
        </button>
        <button 
          onClick={onOpenPrivacy}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '0.95rem', fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Privaatsuspoliitika
        </button>
      </div>
    </div>
  );
}
