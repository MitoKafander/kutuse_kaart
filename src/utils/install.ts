// Home-screen install helpers.
//
// Chrome/Edge fire `beforeinstallprompt` once per session when the PWA becomes
// installable, and the event has to be stashed synchronously — calling
// `prompt()` on a fresh event later is fine, but we can't fabricate one. So
// this module registers the listener on first import (which happens when App
// boots), and exposes the captured event via getDeferredPrompt(). If a user
// goes through the whole tutorial before we need the event, it's already
// waiting for us.
//
// iOS has no programmatic install — we surface visual Share → Add-to-Home-
// Screen steps instead.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    try { localStorage.setItem('kyts:install-prompt-dismissed', '1'); } catch { /* private mode */ }
  });
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

// Returns true if the user accepted, false if they dismissed or the prompt
// wasn't available. Clears the captured event either way — Chrome won't fire
// a second beforeinstallprompt in the same session.
export async function triggerNativeInstall(): Promise<boolean> {
  const p = deferredPrompt;
  if (!p) return false;
  deferredPrompt = null;
  await p.prompt();
  const choice = await p.userChoice;
  return choice.outcome === 'accepted';
}

export function isIOSPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPhone/iPod only. iPads report as desktop on iPadOS 13+ and the "for
  // phones" scope explicitly excludes tablets.
  return /iPhone|iPod/.test(ua);
}

export function isAndroidPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Android + "Mobile" token = phone; Android tablets omit "Mobile".
  return /Android/.test(ua) && /Mobile/.test(ua);
}

export function isPhone(): boolean {
  return isIOSPhone() || isAndroidPhone();
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)');
  if (mm?.matches) return true;
  // iOS Safari uses the legacy navigator.standalone flag, not display-mode.
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

const DISMISS_KEY = 'kyts:install-prompt-dismissed';

export function isInstallPromptDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export function markInstallPromptDismissed(): void {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
}

// Gate for auto-appear after tutorial: phone, not already installed, user
// hasn't explicitly dismissed before. iOS is always eligible (no deferred
// prompt needed — instructions-only). Android is eligible regardless of
// whether beforeinstallprompt already fired; the modal shows the fallback
// menu instructions if no deferred prompt is captured.
export function shouldAutoShowInstallPrompt(): boolean {
  return isPhone() && !isStandalone() && !isInstallPromptDismissed();
}
