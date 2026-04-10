import { useState } from 'react';
import { Camera, X, UploadCloud, CheckCircle } from 'lucide-react';

export function CameraModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState<{ type: string, price: number }[] | null>(null);

  if (!isOpen) return null;

  const simulateScan = () => {
    setIsScanning(true);
    // Simulate AI Vision API delay
    setTimeout(() => {
      setIsScanning(false);
      setScannedData([
        { type: "Bensiin 95", price: 1.649 },
        { type: "Bensiin 98", price: 1.699 },
        { type: "Diisel", price: 1.599 }
      ]);
    }, 2500);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end', // Pop up from bottom
    }}>
      <div className="glass-panel animate-slide-up" style={{
        width: '100%',
        height: '80vh',
        backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <h2 className="heading-1">Lisa Uus Hind</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {!scannedData ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
            {isScanning ? (
              <div style={{ textAlign: 'center', color: 'var(--color-primary)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', border: '4px solid var(--color-surface)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p>AI loeb hindu targa nägemisega...</p>
                <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '8px' }}>(Gemini API simulatsioon)</p>
              </div>
            ) : (
              <>
                <div style={{ 
                  width: '120px', height: '120px', borderRadius: '60px', 
                  backgroundColor: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer'
                }} onClick={simulateScan}>
                  <Camera size={48} color="var(--color-text-muted)" />
                </div>
                <p className="text-muted" style={{ textAlign: 'center', maxWidth: '80%' }}>
                  Pildista hinnaposti. AI loeb kõik hinnad automaatselt.
                </p>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', cursor: 'pointer' }}>
                  <UploadCloud size={20} />
                  <span>Või vali pilt galeriist</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px', color: 'var(--color-fresh)' }}>
              <CheckCircle size={48} style={{ margin: '0 auto 12px' }} />
              <h3>Kas need hinnad on õiged?</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              {scannedData.map((item, i) => (
                <div key={i} className="glass-panel flex-between" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontWeight: '500' }}>{item.type}</span>
                  <input 
                    type="number" 
                    defaultValue={item.price}
                    step="0.001"
                    style={{ 
                      background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', 
                      color: 'var(--color-text)', padding: '8px 12px', borderRadius: '8px', outline: 'none',
                      width: '100px', fontSize: '1rem', textAlign: 'right'
                    }}
                  />
                </div>
              ))}
            </div>

            <button style={{
              background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
              padding: '16px', fontSize: '1.1rem', fontWeight: '600', width: '100%', marginTop: 'auto', cursor: 'pointer'
            }} onClick={() => {
              alert("Hinnad salvestatud! (Demo)");
              onClose();
              setScannedData(null);
            }}>
              Kinnita ja Salvesta
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
