import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Fuel, Euro, Camera, Trophy, Compass, UserPlus, Navigation, TrendingUp, MapPin, Globe, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18n, { LANGUAGES, type SupportedLanguage } from '../i18n';
import { capture } from '../utils/analytics';
import { isPhone, isStandalone } from '../utils/install';

type Outcome = 'completed' | 'skipped';

type Step = {
  icon: ReactNode;
  title: string;
  body: ReactNode;
};

const COLOR_BLUE = '#3b82f6';
const COLOR_ORANGE = '#fb923c';
const COLOR_YELLOW = 'var(--color-fab-cheapest)';
const COLOR_GREEN = '#22c55e';
const COLOR_PURPLE = '#a855f7';
const COLOR_CYAN = '#06b6d4';

// Multilingual title rendered before any language has been picked, so it has to
// read right in every supported tongue at the same time. Native names of the
// six supported languages, separated by middle dots.
const LANGUAGE_STEP_TITLE = 'Keel · Language · Kieli · Язык · Valoda · Kalba';

function LanguagePickerBody({ currentLng, onPick }: { currentLng: string; onPick: (code: SupportedLanguage) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '320px', margin: '0 auto' }}>
      {LANGUAGES.map(({ code, nativeName, flag }) => {
        const active = currentLng === code;
        return (
          <button
            key={code}
            onClick={() => onPick(code)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
              background: active ? 'var(--color-primary-glow)' : 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: '0.95rem',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{flag}</span>
            <span>{nativeName}</span>
            {active && <Check size={16} style={{ marginLeft: 'auto', color: 'var(--color-primary)' }} />}
          </button>
        );
      })}
    </div>
  );
}

function buildSteps(t: TFunction, currentLng: string, onPickLanguage: (code: SupportedLanguage) => void): Step[] {
  const colorSpan = (color: string, text: string) => (
    <span style={{ color, fontWeight: 600 }}>{text}</span>
  );
  // Install-to-home-screen step only lands on phones that aren't already
  // running as a PWA — desktop users and anyone who already installed would
  // just see noise. The follow-up install modal respects the same gate.
  const showInstallStep = isPhone() && !isStandalone();
  return [
    {
      icon: <Globe size={44} color={COLOR_BLUE} />,
      title: LANGUAGE_STEP_TITLE,
      body: <LanguagePickerBody currentLng={currentLng} onPick={onPickLanguage} />,
    },
    {
      icon: <Fuel size={44} color={COLOR_BLUE} />,
      title: t('tutorial.step1.title'),
      body: t('tutorial.step1.body'),
    },
    {
      icon: (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', maxWidth: '340px' }}>
          <Camera size={32} color={COLOR_BLUE} />
          <Fuel size={32} color={COLOR_ORANGE} />
          <Euro size={32} color={COLOR_YELLOW} />
          <Navigation size={32} color={COLOR_GREEN} />
          <TrendingUp size={32} color={COLOR_PURPLE} />
          <Compass size={32} color={COLOR_CYAN} />
        </div>
      ),
      title: t('tutorial.step2.title'),
      body: (
        <span style={{ display: 'block', textAlign: 'left' }}>
          {colorSpan(COLOR_BLUE, t('tutorial.step2.color.blue'))} – {t('tutorial.step2.desc.blue')}{' '}
          {colorSpan(COLOR_ORANGE, t('tutorial.step2.color.orange'))} – {t('tutorial.step2.desc.orange')}{' '}
          {colorSpan(COLOR_YELLOW, t('tutorial.step2.color.yellow'))} – {t('tutorial.step2.desc.yellow')}{' '}
          {colorSpan(COLOR_GREEN, t('tutorial.step2.color.green'))} – {t('tutorial.step2.desc.green')}{' '}
          {colorSpan(COLOR_PURPLE, t('tutorial.step2.color.purple'))} – {t('tutorial.step2.desc.purple')}{' '}
          {colorSpan(COLOR_CYAN, t('tutorial.step2.color.cyan'))} – {t('tutorial.step2.desc.cyan')}
        </span>
      ),
    },
    {
      icon: <MapPin size={44} color={COLOR_ORANGE} />,
      title: t('tutorial.step3.title'),
      body: t('tutorial.step3.body'),
    },
    {
      icon: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Trophy size={40} color={COLOR_PURPLE} />
          <Compass size={40} color="var(--color-primary)" />
        </div>
      ),
      title: t('tutorial.step4.title'),
      body: t('tutorial.step4.body'),
    },
    {
      icon: <UserPlus size={44} color="var(--color-primary)" />,
      title: t('tutorial.step5.title'),
      body: t('tutorial.step5.body'),
    },
    ...(showInstallStep ? [{
      icon: <Smartphone size={44} color="var(--color-primary)" />,
      title: t('tutorial.step6.title'),
      body: t('tutorial.step6.body'),
    }] : []),
  ];
}

export function TutorialModal({
  isOpen,
  onComplete,
}: {
  isOpen: boolean;
  onComplete: (outcome: Outcome, lastStep: number) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const startedRef = useRef(false);
  const currentLng = i18n.resolvedLanguage ?? i18n.language ?? 'et';

  const handlePickLanguage = (code: SupportedLanguage) => {
    if (i18n.language !== code) {
      i18n.changeLanguage(code);
    }
  };

  const STEPS = useMemo(
    () => buildSteps(t, currentLng, handlePickLanguage),
    // Rebuild when the active language flips (for live-localised labels) so
    // the translated titles/bodies in the already-mounted modal update in
    // place instead of waiting for a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, currentLng],
  );

  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      startedRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !startedRef.current) {
      startedRef.current = true;
      capture('tutorial_started');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onComplete('skipped', step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (step < STEPS.length - 1) setStep(step + 1);
        else onComplete('completed', step);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (step > 0) setStep(step - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, step, onComplete, STEPS.length]);

  if (!isOpen) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleNext = () => {
    if (isLast) onComplete('completed', step);
    else setStep(step + 1);
  };

  return (
    <div
      onClick={() => onComplete('skipped', step)}
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
        aria-labelledby="tutorial-title"
        className="glass-panel animate-slide-up"
        style={{
          width: '92%', maxWidth: '520px',
          backgroundColor: 'var(--color-bg)',
          padding: '20px 24px',
          paddingBottom: `calc(20px + env(safe-area-inset-bottom, 0px))`,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <button
            onClick={() => onComplete('skipped', step)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer', padding: 0, font: 'inherit',
              textDecoration: 'underline', fontSize: '0.88rem',
            }}
          >
            {t('tutorial.buttons.skip')}
          </button>
          <button
            onClick={() => onComplete('skipped', step)}
            aria-label={t('tutorial.buttons.close')}
            style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}
          >
            <X size={22} />
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px', minHeight: '48px', alignItems: 'center' }}>
            {current.icon}
          </div>
          <h2 id="tutorial-title" className="heading-1" style={{ marginBottom: '10px' }}>
            {current.title}
          </h2>
          <div style={{ color: 'var(--color-text-muted)', lineHeight: '1.5', fontSize: '0.95rem', margin: 0 }}>
            {current.body}
          </div>
          {isLast && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem', marginTop: '18px', fontStyle: 'italic' }}>
              {t('tutorial.hint.findAgain')}
            </p>
          )}
        </div>

        <div
          role="tablist"
          aria-label={t('tutorial.aria.steps')}
          style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}
        >
          {STEPS.map((_, i) => {
            const active = i === step;
            return (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={t('tutorial.aria.stepN', { current: i + 1, total: STEPS.length })}
                aria-current={active ? 'step' : undefined}
                style={{
                  width: active ? '22px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: active ? 'var(--color-primary)' : 'var(--color-surface-border)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'width 0.2s ease, background 0.2s ease',
                  padding: 0,
                }}
              />
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                flex: '0 0 auto',
                padding: '12px 16px',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.95rem', fontWeight: '500',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <ChevronLeft size={18} /> {t('tutorial.buttons.back')}
            </button>
          )}
          <button
            autoFocus
            onClick={handleNext}
            style={{
              flex: '1 1 auto',
              padding: '12px 16px',
              background: 'var(--color-primary)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.95rem', fontWeight: '600',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            {isLast ? (<><Check size={18} /> {t('tutorial.buttons.done')}</>) : (<>{t('tutorial.buttons.next')} <ChevronRight size={18} /></>)}
          </button>
        </div>
      </div>
    </div>
  );
}
