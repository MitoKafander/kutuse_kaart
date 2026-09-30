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
 *
 * The message IS the button (Mikk, 2026-09-30): the whole pill starts the
 * share, so there is no small "Jaga" target to hunt for next to the text —
 * people tap the words they are reading. Only the ✕ is separate.
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
    // 'cancelled' (the sheet was closed) keeps the pill up, so a second tap works.
  };

  return (
    // Centred by a full-width flex row, NOT left:50% + translateX(-50%):
    // `animate-slide-up` animates `transform` itself, which overrode the
    // centring and pushed the pill half off the right edge of a phone.
    <div style={{
      position: 'fixed', left: 0, right: 0,
      // Above the bottom row of map controls (locate button, zoom), which it
      // would otherwise cover on a phone for the seconds it is up.
      bottom: 'calc(96px + env(safe-area-inset-bottom))',
      zIndex: 4100,
      display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
    <div
      role="status"
      className="animate-slide-up"
      style={{
        pointerEvents: 'auto',
        display: 'flex', alignItems: 'stretch',
        borderRadius: 16,
        background: copied ? 'var(--color-bg)' : 'var(--color-primary)',
        border: copied ? '1px solid var(--color-surface-border)' : 'none',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        width: 'min(92vw, 420px)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={handleShare}
        disabled={copied}
        style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 4px 12px 14px',
          background: 'transparent', border: 'none', textAlign: 'left',
          color: copied ? 'var(--color-text)' : '#fff',
          fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.3,
          cursor: copied ? 'default' : 'pointer',
        }}
      >
        <Check size={18} style={{ color: copied ? '#22c55e' : '#fff', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{copied ? t('share.copied') : t('share.nudge')}</span>
        {!copied && <Share2 size={18} style={{ flexShrink: 0 }} />}
      </button>
      <button
        onClick={onClose}
        aria-label={t('common.close')}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
          padding: '0 12px',
          color: copied ? 'var(--color-text-muted)' : 'rgba(255,255,255,0.85)',
          // A hairline between the share target and the close target, so the
          // two read as separate on a thumb-sized pill.
          borderLeft: copied ? 'none' : '1px solid rgba(255,255,255,0.25)',
        }}
      >
        <X size={18} />
      </button>
    </div>
    </div>
  );
}
