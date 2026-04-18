import { Trans, useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

export function TermsModal({ isOpen, onClose, onOpenPrivacy }: { isOpen: boolean, onClose: () => void, onOpenPrivacy?: () => void }) {
  const { t, i18n } = useTranslation();
  if (!isOpen) return null;

  const legalLng = i18n.language === 'et' || i18n.language === 'en' ? i18n.language : 'en';
  const tl = (key: string) => t(key, { lng: legalLng });
  const showLangNotice = legalLng !== i18n.language;

  const paragraphComponents = {
    strong: <strong />,
    em: <em />,
    br: <br />,
    a: <a href="mailto:info@kyts.ee" style={{ color: 'var(--color-primary)' }} />,
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 3000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '92%',
        maxWidth: '560px',
        maxHeight: '85vh',
        backgroundColor: 'var(--color-bg)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <h2 className="heading-1">{tl('terms.title')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ color: 'var(--color-text-muted)', lineHeight: '1.6', fontSize: '0.92rem' }}>
          {showLangNotice && (
            <p style={{ marginBottom: '10px', padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--color-text)' }}>
              {t('legal.notice.englishOnly')}
            </p>
          )}

          <p style={{ marginBottom: '10px', fontSize: '0.8rem' }}>
            {tl('legal.effectiveDate')}
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s1" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s2" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s3" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>{tl('terms.s4.title')}</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li>{tl('terms.s4.item1')}</li>
            <li>{tl('terms.s4.item2')}</li>
            <li>{tl('terms.s4.item3')}</li>
            <li>{tl('terms.s4.item4')}</li>
            <li>{tl('terms.s4.item5')}</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s5" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s6" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s7" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s8" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s9" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans
              i18nKey={onOpenPrivacy ? 'terms.s10.withLink' : 'terms.s10.plain'}
              lng={legalLng}
              components={{
                ...paragraphComponents,
                privacyBtn: <button onClick={onOpenPrivacy} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }} />,
              }}
            />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s11" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="terms.s12" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '0' }}>
            <Trans i18nKey="terms.s13" lng={legalLng} components={paragraphComponents} />
          </p>
        </div>

        <button onClick={onClose} style={{
          background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
          padding: '14px', fontSize: '1rem', fontWeight: 'bold', width: '100%', marginTop: '20px', cursor: 'pointer'
        }}>
          {tl('common.close')}
        </button>
      </div>
    </div>
  );
}
