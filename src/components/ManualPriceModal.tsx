import { useState, useRef } from 'react';
import { X, Check, Camera, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName } from '../utils';

export function ManualPriceModal({ 
  station,
  isOpen, 
  onClose,
  onPricesSubmitted
}: { 
  station: any,
  isOpen: boolean, 
  onClose: () => void,
  onPricesSubmitted: () => void
}) {
  const [prices, setPrices] = useState<{ [key: string]: string }>({
    "Bensiin 95": "",
    "Bensiin 98": "",
    "Diisel": "",
    "LPG": ""
  });
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !station) return null;

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    
    // Compress and parse image
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
         const canvas = document.createElement('canvas');
         const MAX_SIZE = 1200;
         let w = img.width, h = img.height;
         if (w > h && w > MAX_SIZE) { h = h * (MAX_SIZE / w); w = MAX_SIZE; }
         else if (h > MAX_SIZE) { w = w * (MAX_SIZE / h); h = MAX_SIZE; }
         canvas.width = w; canvas.height = h;
         const ctx = canvas.getContext('2d');
         ctx?.drawImage(img, 0, 0, w, h);
         
         const base64 = canvas.toDataURL('image/jpeg', 0.8);

         try {
           const res = await fetch('/api/parse-prices', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ 
                imageBase64: base64, 
                stationName: station.name 
             })
           });
           
           if (!res.ok) {
             const err = await res.json();
             throw new Error(err.error || 'Server error');
           }
           
           const parsedJson = await res.json();
           
           if (parsedJson.isBrandMatch === false) {
             const proceed = window.confirm(`Hoiatus! Tundub, et sa pildistasid ${parsedJson.detectedBrand || 'teise keti'} tanklat, aga uuendad hetkel ${station.name} hindu!\n\nKas soovid siiski jätkata numbrite sisestamisega?`);
             if (!proceed) {
               setIsAnalyzing(false);
               return;
             }
           }
           
           // Hydrate form logic
           setPrices(prev => {
             const copy = { ...prev };
             if (parsedJson["Bensiin 95"]) copy["Bensiin 95"] = parsedJson["Bensiin 95"].toString().replace(',', '.');
             if (parsedJson["Bensiin 98"]) copy["Bensiin 98"] = parsedJson["Bensiin 98"].toString().replace(',', '.');
             if (parsedJson["Diisel"]) copy["Diisel"] = parsedJson["Diisel"].toString().replace(',', '.');
             if (parsedJson["LPG"]) copy["LPG"] = parsedJson["LPG"].toString().replace(',', '.');
             return copy;
           });
           
         } catch (error: any) {
           console.error("AI Analysis failed:", error);
           alert("AI lugemine ebaõnnestus: " + error.message);
         } finally {
           setIsAnalyzing(false);
         }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    const inserts = Object.entries(prices)
      .filter(([_, price]) => price.trim() !== '')
      .map(([type, price]) => ({
        station_id: station.id,
        fuel_type: type,
        price: parseFloat(price.replace(',', '.')),
        user_id: user?.id || null
      }));

    if (inserts.length > 0) {
      const { error } = await supabase.from('prices').insert(inserts);
      if (error) {
        alert("Viga hinna salvestamisel!");
      } else {
        onPricesSubmitted();
        onClose();
        setPrices({ "Bensiin 95": "", "Bensiin 98": "", "Diisel": "", "LPG": "" });
      }
    } else {
      onClose();
    }
    
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div className="glass-panel animate-slide-up" style={{
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: '24px 24px calc(24px + env(safe-area-inset-bottom)) 24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <h2 className="heading-1">Uued Hinnad: {getStationDisplayName(station)}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <button 
          type="button" 
          disabled={isAnalyzing}
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)', border: '1px solid rgba(59, 130, 246, 0.3)', 
            borderRadius: 'var(--radius-md)', padding: '16px', fontSize: '1rem', fontWeight: 'bold', 
            width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginBottom: '16px'
          }}
        >
          {isAnalyzing ? <Loader2 size={20} className="spin" /> : <Camera size={20} />}
          {isAnalyzing ? 'Tehisintellekt loeb pilti...' : 'Skaneeri hinnad kaameraga'}
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleCameraCapture}
        />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Object.keys(prices).map(type => (
            <div key={type} className="glass-panel flex-between" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontWeight: '500' }}>{type}</span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>€</span>
                <input 
                  type="number" 
                  step="0.001"
                  placeholder="0.000"
                  value={prices[type]}
                  onChange={e => setPrices({...prices, [type]: e.target.value})}
                  style={{ 
                    background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', 
                    color: 'white', padding: '8px 12px 8px 32px', borderRadius: '8px', outline: 'none',
                    width: '120px', fontSize: '1.2rem', fontWeight: 'bold'
                  }}
                />
              </div>
            </div>
          ))}

          <button type="submit" disabled={loading} style={{
            background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
            padding: '16px', fontSize: '1.1rem', fontWeight: '600', width: '100%', marginTop: '8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}>
            <Check size={20} />
            {loading ? 'Salvestan...' : 'Salvesta'}
          </button>
        </form>
      </div>
    </div>
  );
}
