import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, Edit3, ThumbsUp, ThumbsDown, Star, TrendingUp, Navigation } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../supabase';
import i18n from '../i18n';
import { getStationDisplayName, getEffectiveTimestamp, isPriceExpired, FRESH_HOURS, fuelLabel, getReporter, type ReporterMap } from '../utils';

export function StationDrawer({
  station,
  prices,
  allVotes,
  reporterMap,
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
  reporterMap?: ReporterMap,
  session: any,
  isOpen: boolean,
  onClose: () => void,
  onOpenPriceForm: () => void,
  onVoteSubmitted: () => void,
  isFavorite: boolean,
  onToggleFavorite: () => void
}) {
  const { t } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);
  const [historyFuelType, setHistoryFuelType] = useState('Bensiin 95');
  const [voteConfirm, setVoteConfirm] = useState<string | null>(null);

  // Escape-key dismiss — matches the modal pattern used elsewhere in the app.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Clear the vote-confirm toast after 2s with proper cleanup so the callback
  // doesn't fire on an unmounted drawer (prev: raw setTimeout in the handler).
  useEffect(() => {
    if (!voteConfirm) return;
    const t = setTimeout(() => setVoteConfirm(null), 2000);
    return () => clearTimeout(t);
  }, [voteConfirm]);

  if (!isOpen || !station) return null;

  const getAgeColor = (price: any) => {
    const effectiveDate = getEffectiveTimestamp(price, allVotes);
    const ageInHours = (Date.now() - effectiveDate.getTime()) / (1000 * 60 * 60);
    if (ageInHours < 1) return 'var(--color-fresh)';
    if (ageInHours < FRESH_HOURS) return 'var(--color-fresh)';
    if (ageInHours < 24) return 'var(--color-warning)';
    return 'var(--color-text-muted)';
  };

  const getAgeText = (price: any) => {
    const effectiveDate = getEffectiveTimestamp(price, allVotes);
    const ageInHours = (Date.now() - effectiveDate.getTime()) / (1000 * 60 * 60);

    if (ageInHours > 24) return t('time.expired');
    if (ageInHours < 1) return t('time.justNow');

    const d = effectiveDate;
    const timeStr = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

    if (ageInHours < 24 && new Date().getDate() === d.getDate()) {
       return t('time.today', { time: timeStr });
    } else if (ageInHours < 48) {
       return t('time.yesterday', { time: timeStr });
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
        alert(t('stationDrawer.voteFailed') + ' ' + error.message);
      } else {
        localStorage.setItem(votedKey, voteType);
        onVoteSubmitted();
      }
      return;
    }
    
    // Logged-in users: check if they already voted, then update or insert
    const { data: existing } = await supabase
      .from('votes')
      .select('id')
      .eq('price_id', priceId)
      .eq('user_id', userId)
      .maybeSingle();
    
    let error;
    if (existing) {
      // Update existing vote
      ({ error } = await supabase.from('votes')
        .update({ vote_type: voteType })
        .eq('id', existing.id));
    } else {
      // Insert new vote
      ({ error } = await supabase.from('votes')
        .insert({ price_id: priceId, user_id: userId, vote_type: voteType }));
    }
    
    if (error) {
      console.error("Vote failed", error);
      alert(t('stationDrawer.voteFailed') + ' ' + error.message);
    } else {
      onVoteSubmitted();
      if (voteType === 'up') setVoteConfirm(priceId);
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

  const DOWNVOTE_THRESHOLD = -3; // Hide price if net score is this or worse
  const fuelTypes = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];

  return (
    <>
    <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" role="dialog" aria-modal="true" style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      zIndex: 1000,
      backgroundColor: 'var(--color-bg)',
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      padding: '24px 24px calc(24px + env(safe-area-inset-bottom)) 24px',
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
          const isDisputed = score <= DOWNVOTE_THRESHOLD;
          const isExpired = recentPrice ? isPriceExpired(recentPrice, allVotes) : false;

          return (
            <div key={type} style={{
              background: 'var(--color-surface)',
              border: `1px solid ${isDisputed || isExpired ? 'var(--color-surface-border)' : (recentPrice ? getAgeColor(recentPrice) : 'var(--color-surface-border)')}`,
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              position: 'relative',
              opacity: isDisputed || isExpired ? 0.5 : 1,
            }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>{fuelLabel(type, t)}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>
                {!recentPrice || isDisputed ? '---' : `€${recentPrice.price.toFixed(3)}`}
              </div>

              {/* Disputed label */}
              {recentPrice && isDisputed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--color-stale)', marginTop: '8px' }}>
                  <span>⚠ {t('stationDrawer.disputed')}</span>
                </div>
              )}

              {/* Expired label */}
              {recentPrice && !isDisputed && isExpired && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  <Clock size={12} />
                  <span>{t('time.expired')}</span>
                </div>
              )}

              {/* Timestamp — only show if not disputed and not expired */}
              {recentPrice && !isDisputed && !isExpired && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: getAgeColor(recentPrice), marginTop: '8px' }}>
                  <Clock size={12} />
                  <span>{getAgeText(recentPrice)}</span>
                </div>
              )}

              {/* Reporter credit — attribution for who submitted this price. */}
              {recentPrice && !isDisputed && (
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('price.reportedBy', { name: getReporter(recentPrice.user_id, reporterMap, t) })}
                </div>
              )}

              {/* Vote confirmation toast */}
              {voteConfirm === recentPrice?.id && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  background: 'rgba(16, 185, 129, 0.9)', color: '#fff', padding: '6px 12px',
                  borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap',
                  zIndex: 10, pointerEvents: 'none'
                }}>
                  {t('stationDrawer.priceConfirmed')}
                </div>
              )}

              {/* Voting Cluster */}
              {recentPrice && (
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => handleVote(recentPrice.id, 'up')}
                    aria-label={t('stationDrawer.aria.confirm')}
                    aria-pressed={userVote === 'up'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: userVote === 'up' ? 'var(--color-fresh)' : 'var(--color-text-muted)' }}
                  ><ThumbsUp size={16} /></button>

                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: score > 0 ? 'var(--color-fresh)' : (score < 0 ? 'var(--color-stale)' : 'var(--color-text-muted)') }}>
                    {score > 0 ? `+${score}` : score}
                  </span>

                  <button
                    onClick={() => handleVote(recentPrice.id, 'down')}
                    aria-label={t('stationDrawer.aria.dispute')}
                    aria-pressed={userVote === 'down'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: userVote === 'down' ? 'var(--color-stale)' : 'var(--color-text-muted)' }}
                  ><ThumbsDown size={16} /></button>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {showHistory && (
        <div style={{ marginTop: '24px', background: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {fuelTypes.map(type => (
              <button
                key={type}
                onClick={() => setHistoryFuelType(type)}
                style={{
                  padding: '6px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                  background: historyFuelType === type ? 'var(--color-primary-glow)' : 'transparent',
                  border: `1px solid ${historyFuelType === type ? 'var(--color-primary)' : 'var(--color-surface-border)'}`,
                  color: historyFuelType === type ? 'var(--color-primary)' : 'var(--color-text-muted)'
                }}
              >
                {fuelLabel(type, t)}
              </button>
            ))}
          </div>
          
          <div style={{ height: '200px', width: '100%', position: 'relative' }}>
            {(() => {
              const historyData = prices
                .filter(p => p.fuel_type === historyFuelType && p.station_id === station.id)
                .sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime());

              if (historyData.length < 2) {
                return (
                  <div className="flex-center" style={{ height: '100%', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                    {t('stationDrawer.notEnoughHistory')}
                  </div>
                );
              }

              return (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="reported_at" 
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getDate()}.${d.getMonth() + 1}`;
                      }}
                      stroke="var(--color-text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      domain={['auto', 'auto']}
                      tickFormatter={(val) => `€${val.toFixed(2)}`}
                      stroke="var(--color-text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip 
                      contentStyle={{ background: 'var(--color-bg)', border: '1px solid var(--color-surface-border)', borderRadius: '8px' }}
                      itemStyle={{ color: 'var(--color-primary)', fontWeight: 'bold' }}
                      formatter={(value: any) => [`€${Number(value).toFixed(3)}`, t('stationDrawer.priceLabel')]}
                      labelFormatter={(label) => new Date(label).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="var(--color-primary)" 
                      strokeWidth={3} 
                      dot={{ fill: 'var(--color-primary)', r: 3, strokeWidth: 0 }} 
                      activeDot={{ r: 6, fill: '#fff', stroke: 'var(--color-primary)', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          style={{
            background: showHistory ? 'var(--color-surface)' : 'transparent',
            color: showHistory ? 'var(--color-primary)' : 'var(--color-text)',
            border: '1px solid',
            borderColor: showHistory ? 'var(--color-primary)' : 'var(--color-surface-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px', fontSize: '1rem', fontWeight: '500', flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '48px'
          }}
          onClick={() => setShowHistory(!showHistory)}
          title={t('stationDrawer.titles.history')}
        >
          <TrendingUp size={20} />
        </button>

        <button
          style={{
            background: 'transparent',
            color: 'var(--color-text)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px', fontSize: '1rem', fontWeight: '500', flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '48px'
          }}
          onClick={() => window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`,
            '_blank'
          )}
          title={t('stationDrawer.titles.navigate')}
        >
          <Navigation size={20} />
        </button>

        <button
          style={{
            background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
            padding: '16px', fontSize: '1.1rem', fontWeight: '600', flex: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}
          onClick={onOpenPriceForm}
        >
          <Edit3 size={20} />
          {t('stationDrawer.updatePrices')}
        </button>
      </div>
    </div>
    </>
  );
}
