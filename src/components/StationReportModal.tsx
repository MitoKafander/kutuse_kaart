import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Flag, Check } from 'lucide-react';
import { supabase } from '../supabase';
import { capture } from '../utils/analytics';

const MAX_NOTE = 1000;

export type StationReportKind = 'abandoned' | 'inaccessible' | 'wrong_location' | 'wrong_info';
const KINDS: StationReportKind[] = ['abandoned', 'inaccessible', 'wrong_location', 'wrong_info'];

export function StationReportModal({
  isOpen,
  onClose,
  stationId,
  stationName,
  session,
}: {
  isOpen: boolean;
  onClose: () => void;
  stationId: string | null;
  stationName: string | null;
  session: any;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<StationReportKind | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setKind(null);
      setNote('');
      setError(null);
      setSent(false);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmedNote = note.trim();
  const tooLong = trimmedNote.length > MAX_NOTE;
  const userId = session?.user?.id ?? null;
  const canSubmit = !!userId && !!kind && !!stationId && !tooLong && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.from('station_reports').insert({
      user_id: userId,
      station_id: stationId,
      kind,
      note: trimmedNote.length ? trimmedNote : null,
    });
    setLoading(false);
    if (err) {
      // Duplicate (same user, station, kind) → unique-constraint violation
      // is "23505" — surface as friendly already-reported message instead of
      // a generic error so users don't think it didn't go through.
      if (err.code === '23505') {
        setSent(true);
        capture('station_report_duplicate', { kind });
        return;
      }
      setError(t('stationReport.error.submit'));
      capture('station_report_submit_failed', { code: err.code, kind });
      return;
    }
    setSent(true);
    capture('station_report_submitted', { kind, has_note: trimmedNote.length > 0 });
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
            <Flag size={22} /> {t('stationReport.title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
            <div style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={22} /> <strong>{t('stationReport.sent.thanks')}</strong>
            </div>
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '0.92rem', margin: 0 }}>
              {t('stationReport.sent.body')}
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
            {stationName && (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', marginBottom: '12px' }}>
                {t('stationReport.intro', { station: stationName })}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {KINDS.map(k => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                      background: active ? 'rgba(59,130,246,0.18)' : 'var(--color-surface)',
                      color: active ? 'var(--color-primary)' : 'var(--color-text)',
                      fontSize: '0.95rem',
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <span style={{
                      flexShrink: 0,
                      width: 16, height: 16, borderRadius: '50%',
                      border: active ? '5px solid var(--color-primary)' : '2px solid var(--color-text-muted)',
                      marginTop: 2,
                      transition: 'border-width 80ms ease',
                    }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{t(`stationReport.kind.${k}.label`)}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                        {t(`stationReport.kind.${k}.hint`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('stationReport.notePlaceholder')}
              rows={3}
              maxLength={MAX_NOTE + 50}
              style={{
                width: '100%', padding: '12px', fontSize: '0.95rem',
                background: 'var(--color-surface)', color: 'var(--color-text)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-md)', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              <span>{tooLong
                ? t('stationReport.counter.tooLong', { count: trimmedNote.length, max: MAX_NOTE })
                : t('stationReport.counter.normal', { count: trimmedNote.length, max: MAX_NOTE })}</span>
            </div>

            {error && (
              <div style={{ marginTop: '10px', padding: '10px', background: 'var(--color-stale-glow, rgba(255,120,120,0.1))', color: 'var(--color-stale, #f66)', borderRadius: 'var(--radius-md)', fontSize: '0.88rem' }}>
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                marginTop: '14px', padding: '14px', fontSize: '1rem', fontWeight: '600',
                background: canSubmit ? 'var(--color-primary)' : 'var(--color-surface)',
                color: canSubmit ? '#000' : 'var(--color-text-muted)',
                border: 'none', borderRadius: 'var(--radius-md)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? t('stationReport.button.sending') : t('stationReport.button.send')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
