import { useState } from 'react';
import { X, Mail, Key, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabase';
import { LANGUAGES, type SupportedLanguage } from '../i18n';

type Msg = { kind: 'success' | 'error'; text: string } | null;

export function AuthModal({
  isOpen,
  onClose,
  mapStyle,
  onMapStyleChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  mapStyle?: 'dark' | 'light';
  onMapStyleChange?: (s: 'dark' | 'light') => void;
}) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    let error;
    if (isLogin) {
      const res = await supabase.auth.signInWithPassword({ email, password });
      error = res.error;
    } else {
      const res = await supabase.auth.signUp({ email, password });
      error = res.error;
    }

    if (error) {
      setMsg({ kind: 'error', text: error.message });
    } else {
      if (!isLogin) setMsg({ kind: 'success', text: t('auth.signupSuccess') });
      else onClose();
    }
    setLoading(false);
  };

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) setMsg({ kind: 'error', text: error.message });
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '90%',
        maxWidth: '400px',
        backgroundColor: 'var(--color-bg)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <h2 className="heading-1">{isLogin ? t('auth.heading.signIn') : t('auth.heading.signUp')}</h2>
          <button onClick={onClose} aria-label={t('auth.aria.close')} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <button
          style={{
            background: 'white', color: '#333', border: 'none', borderRadius: 'var(--radius-md)',
            padding: '12px', fontSize: '1rem', fontWeight: '500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', marginBottom: '24px'
          }}
          onClick={() => handleOAuth('google')}
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" style={{width: 18, height: 18}}/>
          {t('auth.continueWithGoogle')}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-surface-border)' }} />
          <span>{t('auth.divider.or')}</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-surface-border)' }} />
        </div>

        <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: '8px', padding: '12px' }}>
            <Mail size={20} color="var(--color-text-muted)" style={{ marginRight: '12px' }} />
            <input
              type="email" placeholder={t('auth.email.placeholder')} value={email} onChange={e => setEmail(e.target.value)} required
              style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', flex: 1, outline: 'none', fontSize: '1rem' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: '8px', padding: '12px' }}>
            <Key size={20} color="var(--color-text-muted)" style={{ marginRight: '12px' }} />
            <input
              type="password" placeholder={t('auth.password.placeholder')} value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', flex: 1, outline: 'none', fontSize: '1rem' }}
            />
          </div>

          {msg && <p style={{ color: msg.kind === 'success' ? 'var(--color-fresh)' : 'var(--color-stale)', fontSize: '0.9rem' }}>{msg.text}</p>}

          <button type="submit" disabled={loading} style={{
            background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
            padding: '14px', fontSize: '1rem', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px'
          }}>
            {loading ? t('auth.button.loading') : (isLogin ? t('auth.button.signIn') : t('auth.button.signUp'))}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', color: 'var(--color-text-muted)' }}>
          {isLogin ? t('auth.toggle.noAccount') + ' ' : t('auth.toggle.haveAccount') + ' '}
          <button
            onClick={() => { setIsLogin(!isLogin); setMsg(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '500' }}
          >
            {isLogin ? t('auth.toggle.toSignUp') : t('auth.toggle.toSignIn')}
          </button>
        </p>

        <div style={{ height: '1px', background: 'var(--color-surface-border)', margin: '20px 0 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
            <Languages size={14} color="var(--color-text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <select
              value={i18n.resolvedLanguage}
              onChange={e => { void i18n.changeLanguage(e.target.value as SupportedLanguage); }}
              aria-label={t('seaded.language.label')}
              style={{
                width: '100%',
                padding: '8px 32px 8px 30px',
                border: '1px solid var(--color-surface-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                borderRadius: '8px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
              }}
            >
              {LANGUAGES.map(({ code, nativeName, flag }) => (
                <option key={code} value={code}>{flag} {nativeName}</option>
              ))}
            </select>
          </div>
          {onMapStyleChange && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['dark', 'light'] as const).map(s => {
                const active = mapStyle === s;
                return (
                  <button
                    key={s}
                    onClick={() => onMapStyleChange(s)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                      background: active ? 'rgba(59,130,246,0.15)' : 'var(--color-surface)',
                      color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      fontSize: '0.85rem', fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {s === 'dark' ? t('profile.settings.theme.dark') : t('profile.settings.theme.light')}
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
