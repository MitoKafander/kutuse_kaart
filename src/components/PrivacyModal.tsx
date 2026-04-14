import { X } from 'lucide-react';

export function PrivacyModal({ isOpen, onClose, onOpenTerms }: { isOpen: boolean, onClose: () => void, onOpenTerms?: () => void }) {
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
          <h2 className="heading-1">Privaatsuspoliitika</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ color: 'var(--color-text-muted)', lineHeight: '1.6', fontSize: '0.92rem' }}>
          <p style={{ marginBottom: '10px', fontSize: '0.8rem' }}>
            Kehtib alates: 15.04.2026
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>1. Vastutav töötleja</strong><br/>
            Kyts on kogukonnaprojekt, mida haldab eraisikuna Mikk Rosin (Eesti). Kontakt: <a href="mailto:info@kyts.ee" style={{ color: 'var(--color-primary)' }}>info@kyts.ee</a>. Koduleht: www.kyts.ee.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>2. Milliseid andmeid me kogume</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li><strong>Konto andmed:</strong> e-posti aadress ja Supabase poolt genereeritud kasutaja ID (kui logid sisse Google OAuth'iga või e-postiga).</li>
            <li><strong>Kasutajanimi:</strong> valikuline avalik kuvanimi, mille sa ise määrad.</li>
            <li><strong>Panused:</strong> sinu esitatud kütusehinnad ja hääletused (avalikud, seotud sinu kasutaja ID-ga).</li>
            <li><strong>Eelistused:</strong> lemmikjaamad, eelistatud kütusetüüp, lemmikbrändid, boonuskaardi soodustused — salvestatud sinu kontole.</li>
            <li><strong>Tehnilised logid:</strong> IP-aadress (ajutiselt, rate limit'i jaoks), vea-stack'id (Sentry), aggregeeritud sündmused (PostHog).</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>3. Milleks me andmeid kasutame</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li>Teenuse toimimiseks (autentimine, sinu eelistuste meelespidamine).</li>
            <li>Kuritarvituste tõrjeks (hinnaskännide rate limit per-IP).</li>
            <li>Vigade tuvastamiseks (Sentry — automaatselt kogutud stack trace'id).</li>
            <li>Kasutuse mõõtmiseks (PostHog — anonüümsed agregaadid, ei salvesta brauserisse midagi).</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>4. Õiguslikud alused (GDPR art 6)</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li><strong>Leping (art 6(1)(b)):</strong> konto haldamine ja teenuse pakkumine.</li>
            <li><strong>Õigustatud huvi (art 6(1)(f)):</strong> turvalisus, pettuse tõrje, teenuse parendamine anonüümse statistika kaudu.</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>5. Alltöötlejad (sub-processors)</strong><br/>
            Andmete töötlemisel kasutame järgmisi teenuseid:
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li><strong>Supabase</strong> (EL) — andmebaas ja autentimine.</li>
            <li><strong>Vercel</strong> (EL edge) — veebimajutus ja API funktsioonid.</li>
            <li><strong>Google</strong> — OAuth autentimine ning Gemini AI (kütusetotemi pildituvastus).</li>
            <li><strong>Upstash Redis</strong> (EL) — rate limit counter'id.</li>
            <li><strong>Sentry</strong> — vigade agregaator.</li>
            <li><strong>PostHog</strong> (EU Cloud) — anonüümne produktianalüütika.</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>6. Pilditöötlus (AI)</strong><br/>
            Kaamera-skaneerimisel saadetakse pilt turvaliselt Google Gemini AI-le hinnatuvastuseks. Pilti <strong>ei salvestata</strong> meie serverites ega andmebaasis — see töödeldakse koheselt ja kustutatakse pärast JSON-vastuse tagastamist.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>7. Asukohaandmed</strong><br/>
            Kaardi "Asukoha" ja "Odavaim lähedal" funktsioonid kasutavad brauseri GPS-i ainult sinu seadmes. Sinu koordinaate <strong>ei saadeta</strong> meie serveritesse.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>8. Küpsised ja kohalik salvestus</strong><br/>
            Kasutame ainult <em>hädavajalikke</em> küpsiseid: Supabase Auth sessioonitokenid (hoiab sind sisselogituna) ning localStorage kirjed sinu eelistuste salvestamiseks (nt boonuskaardid, kaardi stiil). Analüütikaks <strong>küpsiseid ei salvestata</strong> — PostHog töötab mälu-režiimis. Seetõttu ei nõua me nõusolekubanner'it.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>9. Säilitusajad</strong>
          </p>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
            <li>Konto + eelistused: kuni kustutad konto.</li>
            <li>Hinnapostitused: avalik ajalugu säilib, et võrdlused töötaksid.</li>
            <li>Vealogid (Sentry): 30 päeva.</li>
            <li>Analüütika (PostHog): 1 aasta, agregeeritud.</li>
            <li>Rate limit counter'id (Upstash): 1 päev.</li>
          </ul>

          <p style={{ marginBottom: '12px' }}>
            <strong>10. Sinu õigused (GDPR)</strong><br/>
            Sul on õigus: oma andmeid vaadata, parandada, kustutada ning eksportida. Samuti esitada vastuväide töötlemisele ja kaebus Andmekaitse Inspektsioonile (aki.ee). Taotluse jaoks kirjuta: <a href="mailto:info@kyts.ee" style={{ color: 'var(--color-primary)' }}>info@kyts.ee</a>. Vastame 30 päeva jooksul.
          </p>

          <p style={{ marginBottom: '12px' }}>
            <strong>11. Muudatused</strong><br/>
            Olulistest muudatustest teavitame rakenduses. Kehtiv versioon on alati käesolev dokument.
          </p>

          {onOpenTerms && (
            <p style={{ marginBottom: '0', fontSize: '0.85rem' }}>
              Vaata ka: <button onClick={onOpenTerms} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>Kasutustingimused</button>.
            </p>
          )}
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
