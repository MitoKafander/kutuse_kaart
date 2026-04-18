import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, MessageSquare, Check } from 'lucide-react';
import { supabase } from '../supabase';
import { capture } from '../utils/analytics';

const MIN_LEN = 3;
const MAX_LEN = 2000;

export function FeedbackModal({
  isOpen,
  onClose,
  session,
}: {
  isOpen: boolean;
  onClose: () => void;
  session: any;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Reset on close so the next open is a clean slate.
  useEffect(() => {
    if (!isOpen) {
      setMessage('');
      setError(null);
      setSent(false);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = message.trim();
  const tooShort = trimmed.length < MIN_LEN;
  const tooLong = trimmed.length > MAX_LEN;

  const submit = async () => {
    if (tooShort || tooLong || loading) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.from('feedback').insert({
      user_id: session?.user?.id ?? null,
      message: trimmed,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
    });
    setLoading(false);
    if (err) {
      setError(t('feedback.error.submit'));
      capture('feedback_submit_failed', { code: err.code });
      return;
    }
    setSent(true);
    capture('feedback_submitted', { authed: !!session?.user });
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '92%', maxWidth: '520px', backgroundColor: 'var(--color-bg)',
        padding: '24px', display: 'flex', flexDirection: 'column',
      }}>
        <div className="flex-between" style={{ marginBottom: '12px' }}>
          <h2 className="heading-1" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={22} /> {t('feedback.title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
            <div style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={22} /> <strong>{t('feedback.sent.thanks')}</strong>
            </div>
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '0.92rem', margin: 0 }}>
              {t('feedback.sent.body')}
            </p>
            <button onClick={onClose} style={{
              marginTop: '8px', padding: '10px 20px',
              background: 'var(--color-primary)', color: '#000', border: 'none',
              borderRadius: 'var(--radius-md)', fontWeight: '600', cursor: 'pointer'
            }}>
              {t('common.close')}
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', marginBottom: '12px' }}>
              {t('feedback.intro')} {session?.user
                ? t('feedback.introSignedIn')
                : t('feedback.introSignedOut')}
            </p>
            <textarea
              autoFocus
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('feedback.placeholder')}
              rows={6}
              maxLength={MAX_LEN + 50}
              style={{
                width: '100%', padding: '12px', fontSize: '1rem',
                background: 'var(--color-surface)', color: 'var(--color-text)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-md)', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              <span>{tooLong
                ? t('feedback.counter.tooLong', { count: trimmed.length, max: MAX_LEN })
                : t('feedback.counter.normal', { count: trimmed.length, max: MAX_LEN })}</span>
            </div>

            {error && (
              <div style={{ marginTop: '10px', padding: '10px', background: 'var(--color-stale-glow, rgba(255,120,120,0.1))', color: 'var(--color-stale, #f66)', borderRadius: 'var(--radius-md)', fontSize: '0.88rem' }}>
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading || tooShort || tooLong}
              style={{
                marginTop: '14px', padding: '14px', fontSize: '1rem', fontWeight: '600',
                background: (tooShort || tooLong) ? 'var(--color-surface)' : 'var(--color-primary)',
                color: (tooShort || tooLong) ? 'var(--color-text-muted)' : '#000',
                border: 'none', borderRadius: 'var(--radius-md)',
                cursor: (loading || tooShort || tooLong) ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? t('feedback.button.sending') : t('feedback.button.send')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
