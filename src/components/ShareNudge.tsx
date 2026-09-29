import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Share2, X } from 'lucide-react';
import { shareStation } from '../utils/share';

const SHOW_MS = 8000;

/**
 * "Thanks! Share this price with a friend" — shown once, right after a price
 * submission, when the one-time install prompt is not due. At most once a day
 * (App.tsx), so a heavy contributor is not nagged after every forecourt.
 * Auto-hides; never blocks the map.
 */
export function ShareNudge({ station, prices, votes, onClose }: {
  station: any;
  prices: any[];
  votes: any[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tm = setTimeout(onClose, copied ? 1600 : SHOW_MS);
    return () => clearTimeout(tm);
  }, [onClose, copied]);

  const handleShare = async () => {
    const outcome = await shareStation({ station, prices, votes, t, context: 'post_submit' });
    if (outcome === 'copied') setCopied(true);
    else if (outcome === 'native') onClose();
  };

  return (
    <div
      role="status"
      className="glass-panel animate-slide-up"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        // Above the bottom row of map controls (locate button, zoom), which it
        // would otherwise cover on a phone for the seconds it is up.
        bottom: 'calc(96px + env(safe-area-inset-bottom))',
        zIndex: 4100,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 10px 10px 14px',
        borderRadius: 16,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        width: 'min(92vw, 420px)',
      }}
    >
      <Check size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--color-text)', lineHeight: 1.3 }}>
        {copied ? t('share.copied') : t('share.nudge')}
      </span>
      {!copied && (
        <button
          onClick={handleShare}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: 'var(--color-primary)', color: '#fff', border: 'none',
            borderRadius: 10, padding: '8px 12px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
          }}
        >
          <Share2 size={15} />
          {t('share.button')}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label={t('common.close')}
        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
