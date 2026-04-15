import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './utils/analytics'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ padding: 24, color: '#fff', background: '#111', minHeight: '100vh' }}>Midagi läks valesti. Palun värskenda lehte.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
