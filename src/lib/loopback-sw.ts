/** Loopback-only service worker cleanup (run.bat / local npm start). */

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

async function unregisterPricekeepWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("pricekeep-shell"))
        .map((k) => caches.delete(k)),
    );
  }
}

let loopbackClear: Promise<void> | null = null;

/** Await before /api fetch on loopback so a stale SW cannot NetworkError the request. */
export function ensureLoopbackServiceWorkersCleared(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!isLoopbackHost(window.location.hostname)) return Promise.resolve();
  if (!loopbackClear) {
    loopbackClear = unregisterPricekeepWorkers().catch(() => {
      // ignore
    });
  }
  return loopbackClear;
}

export { isLoopbackHost };
