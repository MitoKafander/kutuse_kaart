import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './utils/analytics'
import { notifyUpdateAvailable } from './utils/swUpdate'

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Drop noise we can't fix and already handle in-app: stale chunk loads
    // auto-reload (App.tsx lazyWithReload), and Samsung Internet rejects
    // SW registration in private/incognito tabs with a bare "Rejected".
    ignoreErrors: [
      /Failed to fetch dynamically imported module/i,
      /Importing a module script failed/i,
      // Safari variant of the same stale-chunk symptom: Vercel serves index.html
      // for a 404'd hashed asset, Safari rejects the HTML at MIME-type parse.
      /is not a valid JavaScript MIME type/i,
    ],
    beforeSend(event, hint) {
      const err: any = hint?.originalException;
      const msg = typeof err === 'string' ? err : err?.message;
      if (msg === 'Rejected' || err === 'Rejected') {
        const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
        if (frames.some(f => (f.filename || '').includes('registerSW.js') || (f.function || '').includes('serviceWorker'))) {
          return null;
        }
      }
      return event;
    },
  });
}

initAnalytics();

// PWA update lifecycle. onNeedRefresh fires when a new service worker has
// been installed and is ready to take over — we surface that via the
// UpdateBanner component. onRegisteredSW adds a visibilitychange listener
// so a background PWA tab re-checks for updates the moment the user
// foregrounds it (default SW only updates on hard navigation + every 24h).
registerSW({
  onNeedRefresh() { notifyUpdateAvailable(); },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => { /* offline, ignore */ });
      }
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ padding: 24, color: '#fff', background: '#111', minHeight: '100vh' }}>Midagi läks valesti. Palun värskenda lehte.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
