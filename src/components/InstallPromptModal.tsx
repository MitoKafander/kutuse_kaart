import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Share, PlusSquare, Check, Smartphone, MoreVertical, Download } from 'lucide-react';
import { capture } from '../utils/analytics';
import {
  getDeferredPrompt,
  isIOSPhone,
  markInstallPromptDismissed,
  triggerNativeInstall,
} from '../utils/install';

export function InstallPromptModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  if (!isOpen) return null;

  const ios = isIOSPhone();
  const hasDeferredPrompt = !ios && getDeferredPrompt() !== null;

  const handleDismiss = () => {
    markInstallPromptDismissed();
    capture('install_prompt_dismissed', { platform: ios ? 'ios' : 'android' });
    onClose();
  };

  const handleAndroidInstall = async () => {
    setInstalling(true);
    const accepted = await triggerNativeInstall();
    setInstalling(false);
    capture('install_prompt_result', { platform: 'android', accepted });
    if (accepted) markInstallPromptDismissed();
    onClose();
  };

  return (
    <div
      onClick={handleDismiss}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
        zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        className="glass-panel animate-slide-up"
        style={{
          width: '92%', maxWidth: '480px',
          backgroundColor: 'var(--color-bg)',
          padding: '20px 24px',
          paddingBottom: `calc(20px + env(safe-area-inset-bottom, 0px))`,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="flex-between" style={{ marginBottom: '8px' }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('install.eyebrow')}
          </span>
          <button
            onClick={handleDismiss}
            aria-label={t('install.aria.close')}
            style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}
          >
            <X size={22} />
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <Smartphone size={44} color="var(--color-primary)" />
          </div>
          <h2 id="install-title" className="heading-1" style={{ marginBottom: '8px' }}>
            {t('install.title')}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', lineHeight: '1.5', fontSize: '0.95rem', margin: 0 }}>
            {t('install.why')}
          </p>
        </div>

        {ios ? <IosSteps /> : <AndroidSteps hasDeferredPrompt={hasDeferredPrompt} />}

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          <button
            onClick={handleDismiss}
            style={{
              flex: !ios && hasDeferredPrompt ? '0 0 auto' : '1 1 auto',
              padding: '12px 16px',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.95rem', fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            {t('install.dismiss')}
          </button>
          {!ios && hasDeferredPrompt && (
            <button
              autoFocus
              disabled={installing}
              onClick={handleAndroidInstall}
              style={{
                flex: '1 1 auto',
                padding: '12px 16px',
                background: 'var(--color-primary)',
                color: '#000',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.95rem', fontWeight: '600',
                cursor: installing ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                opacity: installing ? 0.7 : 1,
              }}
            >
              <Download size={18} />
              {installing ? t('install.android.installing') : t('install.android.cta')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-surface-border)',
    }}>
      <div style={{
        flex: '0 0 auto', width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-primary)',
      }}>
        {icon}
      </div>
      <span style={{ color: 'var(--color-text)', fontSize: '0.92rem', lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function IosSteps() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Step icon={<Share size={22} />} text={t('install.ios.step1')} />
      <Step icon={<PlusSquare size={22} />} text={t('install.ios.step2')} />
      <Step icon={<Check size={22} />} text={t('install.ios.step3')} />
    </div>
  );
}

function AndroidSteps({ hasDeferredPrompt }: { hasDeferredPrompt: boolean }) {
  const { t } = useTranslation();
  if (hasDeferredPrompt) {
    return (
      <p style={{
        color: 'var(--color-text-muted)', fontSize: '0.92rem', lineHeight: 1.5,
        textAlign: 'center', margin: 0,
      }}>
        {t('install.android.oneTap')}
      </p>
    );
  }
  // Fallback: some Chrome builds don't fire beforeinstallprompt until PWA
  // eligibility is met, and Samsung Internet / Firefox never fire it. Show
  // the menu route so the user can install manually.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Step icon={<MoreVertical size={22} />} text={t('install.android.fallback.step1')} />
      <Step icon={<Download size={22} />} text={t('install.android.fallback.step2')} />
    </div>
  );
}
