import { X } from 'lucide-react';

export function PrivacyModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 3000, // Above everything
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div className="glass-panel animate-slide-up" style={{
        width: '90%',
        maxWidth: '500px',
        maxHeight: '80vh',
        backgroundColor: 'var(--color-bg)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        <div className="flex-between" style={{ marginBottom: '16px' }}>
          <h2 className="heading-1">Privaatsuspoliitika</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ color: 'var(--color-text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
          <p style={{ marginBottom: '12px' }}>
            <strong>1. Sissejuhatus</strong><br/>
            KütuseKaart austab sinu privaatsust. See leht selgitab, milliseid andmeid me kogume ja miks (kooskõlas EL isikuandmete kaitse üldmäärusega ehk GDPR-iga).
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>2. Mida me kogume?</strong><br/>
            Kui lood konto (Google'i või e-posti kaudu), salvestame sinu e-posti aadressi ja unikaalse kasutaja ID. Midagi muud isiklikku me ei nõua ega töötle.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>3. Milleks andmeid kasutatakse?</strong><br/>
            Kogutud e-posti ja ID-d kasutatakse <strong>ainult</strong> süsteemi autentimiseks ning hääletuste ja hinnaaruannete sidumiseks, et vältida spämmimist (nt "üks hääl kasutaja kohta").
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>4. Asukohaandmed (GPS)</strong><br/>
            Meie rakendus "Asukoha" nupp kasutab sinu seadme GPS-i rangelt ja ainult sinu enda seadmes (kliendi poolel), et tsentreerida kaart sinu ümber. Me <strong>ei saada</strong> sinu asukohta oma serveritesse ega salvesta sinu füüsilist liikumist.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>5. Küpsised (Cookies)</strong><br/>
            Rakendus kasutab tehnoloogiaid (nt LocalStorage ja Supabase Auth küpsised), et hoida sind sisselogituna. Jälgimiseks ega reklaamide näitamiseks me küpsiseid ei kasuta.
          </p>

          <p style={{ marginBottom: '0' }}>
            <strong>6. Sinu õigused</strong><br/>
            Sul on õigus igal ajal nõuda oma konto ja sellega seotud andmete täielikku kustutamist. Oma andmete haldamiseks võta ühendust rakenduse arendajaga.
          </p>
        </div>
        
        <button onClick={onClose} style={{
          background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
          padding: '14px', fontSize: '1rem', fontWeight: 'bold', width: '100%', marginTop: '24px', cursor: 'pointer'
        }}>
          Sain aru
        </button>
      </div>
    </div>
  );
}
