// PostHog is ~54 kB (30 kB gzip) with a third of that unused at first paint,
// so we don't want it on the critical path. This module lazy-imports it via
// a dynamic import() — Vite emits a separate chunk — and schedules the load
// with requestIdleCallback so it runs after the map+initial data land.
// Capture() calls made before the module resolves are queued and flushed on
// ready, so early events (tutorial_start, gdpr_accept) aren't lost.

const OPT_OUT_KEY = 'kyts:analytics-opt-out';
const CONSENT_KEY = 'gdpr_consent';
const LEGACY_CONSENT_KEY = 'gdpr_accepted';
// Events captured via `captureReloadSafe` are persisted here across page
// reloads. Memory-persistence PostHog drops any capture whose fetch is in
// flight during `window.location.reload()`, so pre-reload signals (like
// ai_scan_failure immediately before the auto-reload-retry) were invisible
// in our telemetry — confirmed by a 1:0 ratio of `ai_scan_reload_restored`
// to `ai_scan_reload_retry` events in PostHog despite the code capturing
// both in the same call site.
const PENDING_CAPTURE_KEY = 'kyts:pending-capture';
const PENDING_CAPTURE_MAX_AGE_MS = 5 * 60 * 1000;

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

function flushPendingReloadSafeCaptures(posthog: PH) {
  try {
    const raw = localStorage.getItem(PENDING_CAPTURE_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_CAPTURE_KEY);
    const pending = JSON.parse(raw);
    if (!Array.isArray(pending)) return;
    const now = Date.now();
    for (const entry of pending) {
      if (!entry || typeof entry.event !== 'string') continue;
      if (typeof entry.timestamp === 'number' && now - entry.timestamp > PENDING_CAPTURE_MAX_AGE_MS) continue;
      // Tag the replayed event so downstream queries can tell the difference
      // between a normal capture and one recovered from a pre-reload stash.
      const props = {
        ...(entry.props ?? {}),
        _reload_safe: true,
        _captured_at: entry.timestamp,
      };
      try { posthog.capture(entry.event, props); } catch { /* ignore */ }
    }
  } catch { /* storage blocked or parse error — drop silently */ }
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
    flushPendingReloadSafeCaptures(posthog);
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

// Persist a capture across a `window.location.reload()` — the fetch that a
// normal capture() kicks off gets cancelled when the tab reloads, so events
// fired immediately before the auto-reload-retry escape hatch were silently
// lost. This variant stashes the event in localStorage; the next page load
// flushes everything <5 min old during `loadPosthog()` init.
export function captureReloadSafe(event: string, props?: Record<string, unknown>) {
  if (!hasConsent() || isAnalyticsOptedOut()) return;
  try {
    const raw = localStorage.getItem(PENDING_CAPTURE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const pending = Array.isArray(existing) ? existing : [];
    pending.push({ event, props, timestamp: Date.now() });
    // Hard cap on stash size so a broken reload loop can't balloon storage.
    // 50 entries is well above any plausible legitimate burst.
    const trimmed = pending.slice(-50);
    localStorage.setItem(PENDING_CAPTURE_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded or storage blocked — drop silently */ }
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
