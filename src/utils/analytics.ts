// PostHog is ~54 kB (30 kB gzip) with a third of that unused at first paint,
// so we don't want it on the critical path. This module lazy-imports it via
// a dynamic import() — Vite emits a separate chunk — and schedules the load
// with requestIdleCallback so it runs after the map+initial data land.
// Capture() calls made before the module resolves are queued and flushed on
// ready, so early events (tutorial_start, gdpr_accept) aren't lost.

const OPT_OUT_KEY = 'kyts:analytics-opt-out';
const CONSENT_KEY = 'gdpr_consent';
const LEGACY_CONSENT_KEY = 'gdpr_accepted';

type PH = typeof import('posthog-js').default;
let phPromise: Promise<PH | null> | null = null;
const queue: Array<{ event: string; props?: Record<string, unknown> }> = [];

function hasConsent(): boolean {
  try {
    if (localStorage.getItem(CONSENT_KEY) === 'accepted') return true;
    if (localStorage.getItem(LEGACY_CONSENT_KEY) === 'true') return true;
  } catch { /* storage blocked */ }
  return false;
}

function loadPosthog(): Promise<PH | null> {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return Promise.resolve(null);
  return import('posthog-js').then(m => {
    const posthog = m.default;
    posthog.init(key, {
      api_host: 'https://eu.i.posthog.com',
      persistence: 'memory',
      disable_session_recording: true,
      disable_surveys: true,
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      opt_out_capturing_by_default: false,
    });
    if (localStorage.getItem(OPT_OUT_KEY) === '1') {
      posthog.opt_out_capturing();
    }
    // Flush anything captured while we were loading.
    for (const { event, props } of queue) {
      try { posthog.capture(event, props); } catch { /* ignore */ }
    }
    queue.length = 0;
    return posthog;
  }).catch(() => null);
}

export function initAnalytics() {
  if (phPromise) return;
  const schedule: (cb: () => void) => void =
    typeof requestIdleCallback !== 'undefined'
      ? cb => { requestIdleCallback(cb, { timeout: 2000 }); }
      : cb => { setTimeout(cb, 0); };
  schedule(() => { phPromise = loadPosthog(); });
}

export function capture(event: string, props?: Record<string, unknown>) {
  // Drop events entirely when the user hasn't consented or has opted out.
  // Without this, calls from modals/tutorials would queue in memory and
  // flush retroactively the moment someone toggles analytics back on —
  // exactly the "retroactive tracking" behavior we want to avoid.
  if (!hasConsent() || isAnalyticsOptedOut()) return;
  if (!phPromise) {
    queue.push({ event, props });
    return;
  }
  phPromise.then(posthog => {
    if (!posthog) return;
    try { posthog.capture(event, props); } catch { /* ignore */ }
  });
}

export function isAnalyticsOptedOut(): boolean {
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === '1') return true;
    if (localStorage.getItem(CONSENT_KEY) === 'declined') return true;
  } catch { /* storage blocked */ }
  return false;
}

export function setAnalyticsOptOut(optOut: boolean) {
  if (optOut) {
    localStorage.setItem(OPT_OUT_KEY, '1');
    phPromise?.then(p => { try { p?.opt_out_capturing(); } catch { /* ignore */ } });
  } else {
    localStorage.removeItem(OPT_OUT_KEY);
    phPromise?.then(p => { try { p?.opt_in_capturing(); } catch { /* ignore */ } });
  }
}
