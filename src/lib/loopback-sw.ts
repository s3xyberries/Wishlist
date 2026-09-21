/** Aggressive service-worker cleanup for local Pricekeep (Firefox NetworkError). */

export function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

/** Always unregister every SW + wipe pricekeep caches. Safe to call every search. */
export async function nukeServiceWorkers(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (r) => {
        try {
          await r.unregister();
        } catch {
          // ignore
        }
      }),
    );
  } catch {
    // ignore
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(async (k) => {
          try {
            await caches.delete(k);
          } catch {
            // ignore
          }
        }),
      );
    }
  } catch {
    // ignore
  }

  // If a controller is still attached, reload once after unregister is sticky.
  try {
    if (navigator.serviceWorker.controller) {
      // Controller may linger until next navigation; fetches should still bypass
      // once registration is gone, but we force a soft hint via console.
      console.info(
        "[Pricekeep] Cleared service workers. If search still NetworkErrors, hard-refresh once.",
      );
    }
  } catch {
    // ignore
  }
}

/** @deprecated use nukeServiceWorkers — kept name for call sites */
export function ensureLoopbackServiceWorkersCleared(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // Always nuke on every call (including non-loopback if somehow registered).
  // Loopback: mandatory. Non-loopback: only if we previously registered kill-switch.
  if (isLoopbackHost(window.location.hostname)) {
    return nukeServiceWorkers();
  }
  return Promise.resolve();
}
