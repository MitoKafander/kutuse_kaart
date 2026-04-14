import { X } from 'lucide-react';

export function TermsModal({ isOpen, onClose, onOpenPrivacy }: { isOpen: boolean, onClose: () => void, onOpenPrivacy?: () => void }) {
  if (!isOpen) return null;

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
          <h2 className="heading-1">Kasutustingimused</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ color: 'var(--color-text-muted)', lineHeight: '1.6', fontSize: '0.92rem' }}>
          <p style={{ marginBottom: '10px', fontSize: '0.8rem' }}>
            Kehtib alates: 15.04.2026
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>1. Teenuse osutaja</strong><br/>
            Kyts on kogukonnapõhine kütusehindade kaart, mida haldab eraisikuna Mikk Rosin (Eesti). Kontakt: <a href="mailto:info@kyts.ee" style={{ color: 'var(--color-primary)' }}>info@kyts.ee</a>.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>2. Teenuse kirjeldus</strong><br/>
            Kyts võimaldab kasutajatel jagada ja vaadata Eesti tanklate kütusehindu. Hinnad on kasutajate esitatud ja seetõttu võivad olla aegunud, ebatäpsed või valed. Teenus pakutakse põhimõttel "<em>nagu on</em>" (as-is), ilma igasuguste garantiideta täpsuse, kättesaadavuse ega sobivuse kohta.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>3. Konto ja kasutamine</strong><br/>
            Konto loomine (Google OAuth või e-post) on vabatahtlik, kuid vajalik hindade esitamiseks ja hääletamiseks. Ühel inimesel peab olema ainult üks konto. Vastutad oma konto turvalisuse eest.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>4. Keelatud tegevused</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li>Teadlikult valede hindade esitamine või manipuleerimine.</li>
            <li>Teiste kasutajate ahistamine, solvamine või spämm.</li>
            <li>Rakenduse automaatne skraapimine, reverse engineering või rünnakud (sh DDoS, SQL-injection, API kuritarvitamine).</li>
            <li>Rakenduse kasutamine ärilistel eesmärkidel ilma meie kirjaliku loata (nt andmete edasimüük, konkurentteenuse ehitamine meie andmete baasilt).</li>
            <li>Teiste isikuandmete kogumine rakenduse kaudu.</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>5. Sisu moderatsioon</strong><br/>
            Jätame endale õiguse <em>ilma etteteatamiseta</em> kustutada kahtlasi hindu, kustutada kontosid ning blokeerida IP-aadresse, kui rikutakse käesolevaid tingimusi või seadust.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>6. Kasutaja vastutus</strong><br/>
            Kasutaja vastutab ise oma panustatud sisu õigsuse eest. Esitades hinna kinnitad, et see vastab tegelikkusele sel hetkel. Kasutaja, kes teadlikult esitab valesid andmeid, võib kanda õiguslikku vastutust teiste kasutajate eksitamise eest.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>7. Vastutuse piirang</strong><br/>
            Kyts ega selle haldaja <strong>ei vastuta</strong> kahjude eest, mis tulenevad: (a) ebatäpsetest hindadest, (b) teenuse katkestustest, (c) kolmandate osapoolte teenuste (Supabase, Vercel, Google Gemini jt) tõrgetest, (d) kasutaja enda seadme tehnilistest probleemidest. Maksimaalne vastutus on piiratud nulliga, kuna teenus on kasutajatele tasuta.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>8. Intellektuaalomand</strong><br/>
            Rakenduse kood, disain ja brand "Kyts" kuuluvad haldajale. Kasutajate esitatud hinnad on avalikud faktid ja neid ei käsitleta autoriõiguse objektina. Kaardiandmed kuuluvad OpenStreetMap'ile vastava litsentsi alusel.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>9. Annetused</strong><br/>
            Vabatahtlikud annetused (nt Buy Me a Coffee kaudu) toetavad teenuse ülalpidamist ja arendamist. Annetused <strong>ei anna</strong> eriõigusi ega lisaetegevusi rakenduses ning ei ole tagasimakstavad.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>10. Isikuandmed</strong><br/>
            Isikuandmete töötlemist kirjeldab <strong>Privaatsuspoliitika</strong>{onOpenPrivacy ? <> (<button onClick={onOpenPrivacy} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>ava</button>)</> : null}, mis on käesolevate tingimuste lahutamatu osa.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>11. Muudatused tingimustes</strong><br/>
            Võime neid tingimusi uuendada. Olulistest muudatustest teavitame rakenduses. Teenuse edasine kasutamine pärast muudatusi tähendab uute tingimustega nõustumist.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>12. Teenuse lõpetamine</strong><br/>
            Võime teenuse igal ajal peatada või lõpetada. Kui lõpetame teenuse, anname võimalusel ette teada vähemalt 30 päeva.
          </p>

          <p style={{ marginBottom: '0' }}>
            <strong>13. Kohaldatav õigus</strong><br/>
            Käesolevatele tingimustele kohaldatakse Eesti Vabariigi õigust. Vaidlused lahendatakse Harju Maakohtus, kui seadus ei näe ette teisiti.
          </p>
        </div>

        <button onClick={onClose} style={{
          background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
          padding: '14px', fontSize: '1rem', fontWeight: 'bold', width: '100%', marginTop: '20px', cursor: 'pointer'
        }}>
          Sulge
        </button>
      </div>
    </div>
  );
}
