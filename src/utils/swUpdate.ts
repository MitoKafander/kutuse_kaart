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
  // With skipWaiting: true in the Workbox config, the new SW activates
  // immediately on install and fires controllerchange before the user
  // taps the banner — so Workbox's updateSW(true) finds no waiting SW,
  // no-ops, and the button hangs forever. Since the new SW is already
  // the controller by the time we get here, a plain page reload is
  // enough to pick up the fresh JS/HTML bundle it's now serving.
  window.location.reload();
}
