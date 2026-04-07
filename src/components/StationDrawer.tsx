import { X, Clock, Edit3, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName } from '../utils';

export function StationDrawer({ 
  station, 
  prices,
  allVotes,
  session,
  isOpen, 
  onClose, 
  onOpenPriceForm,
  onVoteSubmitted,
  isFavorite,
  onToggleFavorite
}: { 
  station: any, 
  prices: any[],
  allVotes: any[],
  session: any,
  isOpen: boolean, 
  onClose: () => void,
  onOpenPriceForm: () => void,
  onVoteSubmitted: () => void,
  isFavorite: boolean,
  onToggleFavorite: () => void
}) {
  if (!isOpen || !station) return null;

  const getAgeColor = (reportedAt: string) => {
    const ageInHours = (new Date().getTime() - new Date(reportedAt).getTime()) / (1000 * 60 * 60);
    // Only flash green if it was truly updated just now (< 1 hour)
    if (ageInHours < 1) return 'var(--color-fresh)';
    // Yellow for anything else under 24 hours
    if (ageInHours < 24) return 'var(--color-warning)';
    // Gray for older data
    return 'var(--color-text-muted)';
  };

  const getAgeText = (reportedAt: string) => {
    const ageInHours = (new Date().getTime() - new Date(reportedAt).getTime()) / (1000 * 60 * 60);
    if (ageInHours < 1) return 'Just praegu';
    
    // Instead of vague "X hours ago", show exact clock time
    const d = new Date(reportedAt);
    const timeStr = d.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' });
    
    // Check if it's today
    if (ageInHours < 24 && new Date().getDate() === d.getDate()) {
       return `Täna ${timeStr}`;
    } else if (ageInHours < 48) {
       return `Eile ${timeStr}`;
    }
    
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  };

  const handleVote = async (priceId: string, voteType: 'up' | 'down') => {
    const userId = session?.user?.id || null;
    
    // For anonymous users, use localStorage to prevent double-voting
    if (!userId) {
      const votedKey = `voted_${priceId}`;
      if (localStorage.getItem(votedKey)) {
        return; // Silently ignore duplicate anonymous vote
      }
      const { error } = await supabase.from('votes').insert(
        { price_id: priceId, user_id: null, vote_type: voteType }
      );
      if (error) {
        alert("Hääletamine ebaõnnestus. " + error.message);
      } else {
        localStorage.setItem(votedKey, voteType);
        onVoteSubmitted();
      }
      return;
    }
    
    // Logged-in users get upsert (can change their vote)
    const { error } = await supabase.from('votes').upsert(
      { price_id: priceId, user_id: userId, vote_type: voteType },
      { onConflict: 'price_id,user_id' }
    );
    
    if (error) {
      console.error("Viga hääletamisel", error);
      alert("Hääletamine ebaõnnestus. " + error.message);
    } else {
      onVoteSubmitted();
    }
  };

  const calculateScore = (priceId: string) => {
    const priceVotes = allVotes.filter(v => v.price_id === priceId);
    let score = 0;
    priceVotes.forEach(v => {
      if (v.vote_type === 'up') score += 1;
      if (v.vote_type === 'down') score -= 1;
    });
    return score;
  };

  const getUserVote = (priceId: string) => {
    if (!session) return null;
    const vote = allVotes.find(v => v.price_id === priceId && v.user_id === session.user.id);
    return vote ? vote.vote_type : null;
  };

  const fuelTypes = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];

  return (
    <div className="glass-panel animate-slide-up" style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      backgroundColor: 'var(--color-bg)',
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      padding: '24px 24px calc(24px + env(safe-area-inset-bottom)) 24px',
      zIndex: 1000,
      boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
    }}>
      <div className="flex-between" style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <button onClick={onToggleFavorite} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            <Star size={22} fill={isFavorite ? '#f59e0b' : 'none'} color={isFavorite ? '#f59e0b' : 'var(--color-text-muted)'} />
          </button>
          <h2 className="heading-1" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getStationDisplayName(station)}</h2>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer', flexShrink: 0 }}>
          <X size={24} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '24px' }}>
        {fuelTypes.map(type => {
          const recentPrice = prices
            .filter(p => p.fuel_type === type)
            .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];

          const score = recentPrice ? calculateScore(recentPrice.id) : 0;
          const userVote = recentPrice ? getUserVote(recentPrice.id) : null;

          return (
            <div key={type} style={{
              background: 'var(--color-surface)',
              border: `1px solid ${recentPrice ? getAgeColor(recentPrice.reported_at) : 'var(--color-surface-border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              position: 'relative'
            }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>{type}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>
                {recentPrice ? `€${recentPrice.price.toFixed(3)}` : '---'}
              </div>
              
              {/* Timestamp */}
              {recentPrice && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: getAgeColor(recentPrice.reported_at), marginTop: '8px' }}>
                  <Clock size={12} />
                  <span>{getAgeText(recentPrice.reported_at)}</span>
                </div>
              )}

              {/* Voting Cluster */}
              {recentPrice && (
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <button 
                    onClick={() => handleVote(recentPrice.id, 'up')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: userVote === 'up' ? 'var(--color-fresh)' : 'var(--color-text-muted)' }}
                  ><ThumbsUp size={16} /></button>
                  
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: score > 0 ? 'var(--color-fresh)' : (score < 0 ? 'var(--color-stale)' : 'var(--color-text-muted)') }}>
                    {score > 0 ? `+${score}` : score}
                  </span>
                  
                  <button 
                    onClick={() => handleVote(recentPrice.id, 'down')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: userVote === 'down' ? 'var(--color-stale)' : 'var(--color-text-muted)' }}
                  ><ThumbsDown size={16} /></button>
                </div>
              )}

            </div>
          );
        })}
      </div>

      <button 
        style={{
          background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
          padding: '16px', fontSize: '1.1rem', fontWeight: '600', width: '100%', marginTop: '24px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
        }}
        onClick={onOpenPriceForm}
      >
        <Edit3 size={20} />
        Uuenda Hinnad
      </button>
    </div>
  );
}
