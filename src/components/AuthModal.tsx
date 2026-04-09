import { useState } from 'react';
import { X, Mail, Key } from 'lucide-react';
import { supabase } from '../supabase';

export function AuthModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    let error;
    if (isLogin) {
      const res = await supabase.auth.signInWithPassword({ email, password });
      error = res.error;
    } else {
      const res = await supabase.auth.signUp({ email, password });
      error = res.error;
    }

    if (error) {
      setMsg(error.message);
    } else {
      if (!isLogin) setMsg('Konto loodud! Kontrolli emaili.');
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
    if (error) setMsg(error.message);
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
          <h2 className="heading-1">{isLogin ? 'Logi sisse' : 'Loo konto'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
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
          Jätka Google'iga
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-surface-border)' }} />
          <span>või</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-surface-border)' }} />
        </div>

        <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: '8px', padding: '12px' }}>
            <Mail size={20} color="var(--color-text-muted)" style={{ marginRight: '12px' }} />
            <input 
              type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '1rem' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: '8px', padding: '12px' }}>
            <Key size={20} color="var(--color-text-muted)" style={{ marginRight: '12px' }} />
            <input 
              type="password" placeholder="Parool" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '1rem' }}
            />
          </div>

          {msg && <p style={{ color: msg.includes('loodud') ? 'var(--color-fresh)' : 'var(--color-stale)', fontSize: '0.9rem' }}>{msg}</p>}

          <button type="submit" disabled={loading} style={{
            background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
            padding: '14px', fontSize: '1rem', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px'
          }}>
            {loading ? 'Laadimine...' : (isLogin ? 'Logi sisse' : 'Loo konto')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', color: 'var(--color-text-muted)' }}>
          {isLogin ? 'Pole kontot? ' : 'Juba kasutaja? '}
          <button 
            onClick={() => { setIsLogin(!isLogin); setMsg(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '500' }}
          >
            {isLogin ? 'Lood konto siin' : 'Logi sisse'}
          </button>
        </p>

      </div>
    </div>
  );
}
