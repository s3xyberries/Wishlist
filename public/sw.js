/* Pricekeep SW v4 — kill-switch for sticky local workers.
 * On activate: clear caches and unregister this worker so /api/* is never
 * intercepted. Deployed hosts that still want a shell can re-register a
 * future version; loopback never registers (see sw-register.tsx).
 */
const CACHE = "pricekeep-shell-v4";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith("pricekeep-shell"))
            .map((k) => caches.delete(k)),
        );
      } catch {
        // ignore
      }
      try {
        await self.registration.unregister();
      } catch {
        // ignore
      }
      await self.clients.claim();
    })(),
  );
});

// Never handle fetches — pass through to the network (and we unregister above).
self.addEventListener("fetch", () => {
  // Intentionally empty: do not call event.respondWith.
});
