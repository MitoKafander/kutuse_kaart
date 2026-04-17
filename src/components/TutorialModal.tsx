import { useState, useEffect, useRef, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Fuel, Euro, Camera, Trophy, Compass, UserPlus } from 'lucide-react';
import { FuelPencilIcon } from './icons/FuelPencilIcon';
import { capture } from '../utils/analytics';

type Outcome = 'completed' | 'skipped';

type Step = {
  icon: ReactNode;
  title: string;
  body: ReactNode;
};

// Colors mirror the actual FAB backgrounds so the icon in the tutorial matches
// what the user will see on the map — that's the whole "visual cue" budget.
const COLOR_BLUE = '#3b82f6';
const COLOR_ORANGE = '#fb923c';
const COLOR_YELLOW = '#facc15';
const COLOR_PURPLE = '#a855f7';

const STEPS: Step[] = [
  {
    icon: <Fuel size={44} color={COLOR_BLUE} />,
    title: 'Tere tulemast Kytsi!',
    body: 'Kogukonna-põhine kaart, kus näed Eesti tanklate hindu reaalajas. Leia soodsaim, panusta ise.',
  },
  {
    icon: <Euro size={44} color={COLOR_YELLOW} />,
    title: 'Leia soodsaim kütus',
    body: 'Kollane nupp paremal näitab lähedal asuvaid odavaimaid jaamu – kõigi kütusetüüpide (95 / 98 / D / LPG) jaoks korraga. Brändide filter ja marsruudi-otsing on ülemises menüüs.',
  },
  {
    icon: (
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <Camera size={40} color={COLOR_BLUE} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem' }}>või</span>
        <FuelPencilIcon size={40} style={{ color: COLOR_ORANGE }} />
      </div>
    ),
    title: 'Raporteeri hinda',
    body: 'Sinine nupp pildistab totemi ja AI loeb hinnad ise. Oranž nupp on käsitsi sisestamiseks. Pead olema kuni 1 km jaamast, et hinda salvestada.',
  },
  {
    icon: <Trophy size={44} color={COLOR_PURPLE} />,
    title: 'Edetabel ja märgid',
    body: 'Iga hinnapanus ja hääletus teenib sulle tiitli (🌱 Turist → ♾️ Kyts Kõiksus). Ava Profiil → Edetabel, et näha oma kohta teiste seas.',
  },
  {
    icon: <Compass size={44} color="var(--color-primary)" />,
    title: 'Avastuskaart',
    body: 'Lülita Seaded-menüüst sisse ja täida kõik 15 Eesti maakonda panusega. Kogu märke ja vaata, kuidas teised Eestit katavad.',
  },
  {
    icon: <UserPlus size={44} color="var(--color-primary)" />,
    title: 'Loo konto',
    body: 'Sisselogimine avab hindade raporteerimise, hääletamise, lemmikjaamad, edetabeli ja kliendikaardi-soodustused. Su eelistused sünkitakse seadmete vahel. Vajuta profiili ikoonile üleval paremal.',
  },
];

export function TutorialModal({
  isOpen,
  onComplete,
}: {
  isOpen: boolean;
  onComplete: (outcome: Outcome, lastStep: number) => void;
}) {
  const [step, setStep] = useState(0);
  const startedRef = useRef(false);

  // Reset on close so next open starts at step 0; arm startedRef for next run.
  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      startedRef.current = false;
    }
  }, [isOpen]);

  // Fire tutorial_started once per open.
  useEffect(() => {
    if (isOpen && !startedRef.current) {
      startedRef.current = true;
      capture('tutorial_started');
    }
  }, [isOpen]);

  // Keyboard nav: Esc = skip, Arrows = prev/next. Only attach when open.
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
  }, [isOpen, step, onComplete]);

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
        {/* Header */}
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
            Jäta vahele
          </button>
          <button
            onClick={() => onComplete('skipped', step)}
            aria-label="Sulge tutvustus"
            style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Card body */}
        <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px', minHeight: '48px', alignItems: 'center' }}>
            {current.icon}
          </div>
          <h2 id="tutorial-title" className="heading-1" style={{ marginBottom: '10px' }}>
            {current.title}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', lineHeight: '1.5', fontSize: '0.95rem', margin: 0 }}>
            {current.body}
          </p>
          {isLast && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem', marginTop: '18px', fontStyle: 'italic' }}>
              Tutvustuse leiad hiljem Seaded → Tutvustus.
            </p>
          )}
        </div>

        {/* Step dots — tappable to jump directly to a step */}
        <div
          role="tablist"
          aria-label="Tutvustuse sammud"
          style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}
        >
          {STEPS.map((_, i) => {
            const active = i === step;
            return (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Samm ${i + 1} / ${STEPS.length}`}
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

        {/* Footer buttons */}
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
              <ChevronLeft size={18} /> Tagasi
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
            {isLast ? (<><Check size={18} /> Valmis</>) : (<>Järgmine <ChevronRight size={18} /></>)}
          </button>
        </div>
      </div>
    </div>
  );
}
