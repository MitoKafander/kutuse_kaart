import posthog from 'posthog-js';

const OPT_OUT_KEY = 'kyts:analytics-opt-out';

export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
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
}

export function capture(event: string, props?: Record<string, unknown>) {
  try { posthog.capture(event, props); } catch {}
}

export function isAnalyticsOptedOut(): boolean {
  return localStorage.getItem(OPT_OUT_KEY) === '1';
}

export function setAnalyticsOptOut(optOut: boolean) {
  if (optOut) {
    localStorage.setItem(OPT_OUT_KEY, '1');
    try { posthog.opt_out_capturing(); } catch {}
  } else {
    localStorage.removeItem(OPT_OUT_KEY);
    try { posthog.opt_in_capturing(); } catch {}
  }
}
