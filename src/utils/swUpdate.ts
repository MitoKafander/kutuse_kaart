// Tiny pub-sub bridging the service-worker update lifecycle (lives in
// main.tsx, fires at boot) to the UpdateBanner React component (mounts
// inside the App tree). A plain module-scoped signal + listener list
// avoids pulling in a state-management library for one bool.

let available = false;
let applyFn: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<(v: boolean) => void>();

export function registerApply(fn: (reload?: boolean) => Promise<void>) {
  applyFn = fn;
}

export function notifyUpdateAvailable() {
  if (available) return;
  available = true;
  listeners.forEach(l => l(true));
}

export function subscribeToUpdate(cb: (v: boolean) => void): () => void {
  listeners.add(cb);
  if (available) cb(true);
  return () => { listeners.delete(cb); };
}

export async function applyUpdate() {
  // Workbox's updateSW(true) messages SKIP_WAITING to the new SW and reloads
  // the page once it takes control. Fall back to a plain reload if the SW
  // registration failed (e.g. private-mode Samsung Internet) so the user
  // still gets the fresh HTML from the server.
  if (applyFn) {
    try { await applyFn(true); return; } catch { /* fall through */ }
  }
  window.location.reload();
}
