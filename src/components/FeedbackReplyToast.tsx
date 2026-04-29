import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, X } from 'lucide-react';
import { supabase } from '../supabase';

type Reply = {
  reply_id: string;
  feedback_id: string;
  reply_message: string;
  reply_created_at: string;
  original_message: string;
  original_created_at: string;
};

// Local backstop for the server-side read_at flag. The dismiss flow writes
// to both: read_at via mark_feedback_reply_read RPC (cross-device truth)
// and this localStorage set (this-device suppression in case the RPC ever
// fails, the network drops, or the user is offline). Either alone would
// be enough — we keep both because the cost is ~50 bytes per dismissed
// reply and the UX cost of a phantom re-popup is annoyingly high.
const DISMISSED_KEY = 'kyts:dismissed-feedback-replies';

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function writeDismissed(ids: Set<string>) {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids))); }
  catch { /* quota — non-fatal, server-side read_at is the durable truth */ }
}

// Banner shown when the user has unread admin replies on their feedback.
// Sits at z 2500 (same tier as UpdateBanner) — above map FABs/overlays but
// below modals/drawers (3000+) so it doesn't ambush a price-submit flow.
// Tapping the body expands to show the original feedback for context.
// Dismiss writes read_at server-side via mark_feedback_reply_read so
// admins can see in the SQL editor whether the user actually saw it.
export function FeedbackReplyToast({
  isAuthed,
  loadDataTrigger,
}: {
  isAuthed: boolean;
  // Increments whenever loadData runs in App.tsx — hooks the toast into the
  // same SWR cycle as the rest of the post-login data fetch without making
  // FeedbackReplyToast import App-level state.
  loadDataTrigger: number;
}) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<Reply[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!isAuthed) { setQueue([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('v_my_unread_feedback_replies')
        .select('*')
        .order('reply_created_at', { ascending: true });
      if (cancelled) return;
      if (error || !data) { setQueue([]); return; }
      // Filter through the local dismissed-set so a server write that
      // failed (offline, transient RPC error) doesn't resurface the same
      // banner on the next loadData tick. Server read_at remains the
      // cross-device truth — this just patches the same-device case.
      const dismissed = readDismissed();
      const filtered = (data as Reply[]).filter(r => !dismissed.has(r.reply_id));
      setQueue(filtered);
    })();
    return () => { cancelled = true; };
  }, [isAuthed, loadDataTrigger]);

  const current = queue[0];
  if (!current) return null;

  const dismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    // Local-first: stamp the dismissed set BEFORE the network call so even
    // if the RPC hangs or the user closes the tab mid-dismiss, the banner
    // won't resurface on this device. The RPC then propagates the read
    // state to the server for cross-device suppression.
    const dismissed = readDismissed();
    dismissed.add(current.reply_id);
    writeDismissed(dismissed);
    await supabase.rpc('mark_feedback_reply_read', { reply_id: current.reply_id });
    setQueue(q => q.slice(1));
    setExpanded(false);
    setDismissing(false);
  };

  return (
    <div
      className="glass-panel animate-slide-up"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(20px + env(safe-area-inset-bottom))',
        left: '20px',
        right: '20px',
        zIndex: 2500,
        padding: '14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        border: '1px solid rgba(34,197,94,0.55)',
        background: 'rgba(34,197,94,0.18)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: 'var(--color-text)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <MessageSquare size={18} color="var(--color-fresh)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>
            {t('feedbackReply.title')}
          </div>
          <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {current.reply_message}
          </div>
          {expanded && (
            <div style={{
              marginTop: 10,
              padding: 10,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: 8,
              fontSize: '0.78rem',
              color: 'var(--color-text-muted)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('feedbackReply.originalLabel')}</div>
              {current.original_message}
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label={t('common.close')}
          disabled={dismissing}
          style={{
            background: 'none', border: 'none', color: 'var(--color-text)',
            cursor: dismissing ? 'default' : 'pointer', flexShrink: 0, padding: 4,
            opacity: dismissing ? 0.5 : 1,
          }}
        >
          <X size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'transparent',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: '0.78rem',
            cursor: 'pointer',
          }}
        >
          {expanded ? t('feedbackReply.hideOriginal') : t('feedbackReply.showOriginal')}
        </button>
        <button
          onClick={dismiss}
          disabled={dismissing}
          style={{
            background: 'var(--color-fresh)',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: dismissing ? 'default' : 'pointer',
            opacity: dismissing ? 0.6 : 1,
          }}
        >
          {t('feedbackReply.button.dismiss')}
        </button>
      </div>
    </div>
  );
}
