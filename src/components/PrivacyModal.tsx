import { Trans, useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

export function PrivacyModal({ isOpen, onClose, onOpenTerms }: { isOpen: boolean, onClose: () => void, onOpenTerms?: () => void }) {
  const { t, i18n } = useTranslation();
  if (!isOpen) return null;

  // Legal text is maintained in ET + EN only. Users on RU/FI/LV/LT see the EN
  // copy with a notice at the top explaining the language availability. Machine
  // translation of legal docs under GDPR is real liability we won't ship without
  // human legal review per language.
  const legalLng = i18n.language === 'et' || i18n.language === 'en' ? i18n.language : 'en';
  const tl = (key: string) => t(key, { lng: legalLng });
  const showLangNotice = legalLng !== i18n.language;

  const paragraphComponents = {
    strong: <strong />,
    em: <em />,
    br: <br />,
    a: <a href="mailto:info@mikkrosin.ee" style={{ color: 'var(--color-primary)' }} />,
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
          <h2 className="heading-1">{tl('privacy.title')}</h2>
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
            <Trans i18nKey="privacy.s1" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>{tl('privacy.s2.title')}</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li><Trans i18nKey="privacy.s2.item1" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s2.item2" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s2.item3" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s2.item4" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s2.item5" lng={legalLng} components={paragraphComponents} /></li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>{tl('privacy.s3.title')}</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li>{tl('privacy.s3.item1')}</li>
            <li>{tl('privacy.s3.item2')}</li>
            <li>{tl('privacy.s3.item3')}</li>
            <li>{tl('privacy.s3.item4')}</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>{tl('privacy.s4.title')}</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li><Trans i18nKey="privacy.s4.item1" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s4.item2" lng={legalLng} components={paragraphComponents} /></li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="privacy.s5.intro" lng={legalLng} components={paragraphComponents} />
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li><Trans i18nKey="privacy.s5.item1" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s5.item2" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s5.item3" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s5.item4" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s5.item5" lng={legalLng} components={paragraphComponents} /></li>
            <li><Trans i18nKey="privacy.s5.item6" lng={legalLng} components={paragraphComponents} /></li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="privacy.s6" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="privacy.s7" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="privacy.s8" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>{tl('privacy.s9.title')}</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li>{tl('privacy.s9.item1')}</li>
            <li>{tl('privacy.s9.item2')}</li>
            <li>{tl('privacy.s9.item3')}</li>
            <li>{tl('privacy.s9.item4')}</li>
            <li>{tl('privacy.s9.item5')}</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="privacy.s10" lng={legalLng} components={paragraphComponents} />
          </p>

          <p style={{ marginBottom: '12px' }}>
            <Trans i18nKey="privacy.s11" lng={legalLng} components={paragraphComponents} />
          </p>

          {onOpenTerms && (
            <p style={{ marginBottom: '0', fontSize: '0.85rem' }}>
              <Trans
                i18nKey="privacy.seeAlsoTerms"
                lng={legalLng}
                components={{
                  termsBtn: <button onClick={onOpenTerms} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }} />,
                }}
              />
            </p>
          )}
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
