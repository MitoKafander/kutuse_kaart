import { Compass, Eye, X } from 'lucide-react';

// Thin pill that sits above the FAB stack whenever Avastuskaart is on.
// Its job is twofold: make it obvious that the map is in a special mode
// (so nobody wonders "where are my prices?") and give a one-tap escape
// hatch. When a maakond is focused, the banner names it and offers a
// second button to clear just the focus without leaving discovery mode.
export function DiscoveryBanner({
  focusedMaakondName,
  focusedMaakondEmoji,
  onClearFocus,
  onTurnOff,
  viewedUserName,
}: {
  focusedMaakondName: string | null;
  focusedMaakondEmoji: string | null;
  onClearFocus: () => void;
  onTurnOff: () => void;
  viewedUserName?: string | null;
}) {
  const hasFocus = !!focusedMaakondName;
  const isViewing = !!viewedUserName;
  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        top: 'calc(140px + env(safe-area-inset-top))',
        left: '20px',
        right: '20px',
        zIndex: 1000,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: isViewing ? '1px solid rgba(168,85,247,0.55)' : '1px solid rgba(59,130,246,0.45)',
        background: isViewing ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.18)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: 'var(--color-text)',
        fontSize: '0.82rem',
      }}
    >
      {isViewing
        ? <Eye size={16} color="#c084fc" style={{ flexShrink: 0 }} />
        : <Compass size={16} color="var(--color-primary)" style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isViewing
            ? <>Vaatad: {viewedUserName}</>
            : hasFocus
              ? <>{focusedMaakondEmoji ? `${focusedMaakondEmoji} ` : ''}{focusedMaakondName}</>
              : 'Avastusrežiim'}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
          {isViewing
            ? 'Teise kasutaja avastuskaart'
            : hasFocus ? 'Puuduta X, et näha kõiki maakondi' : 'Hinnad on peidetud'}
        </span>
      </div>
      {hasFocus && !isViewing && (
        <button
          onClick={onClearFocus}
          title="Eemalda maakonna fookus"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-muted)',
            borderRadius: 8,
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      )}
      <button
        onClick={onTurnOff}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
          color: 'var(--color-text)',
          borderRadius: 8,
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: '0.78rem',
          whiteSpace: 'nowrap',
        }}
      >
        {isViewing ? 'Sulge' : 'Lülita välja'}
      </button>
    </div>
  );
}
