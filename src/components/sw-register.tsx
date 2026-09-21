"use client";

import { useEffect } from "react";
import { isLoopbackHost, nukeServiceWorkers } from "@/lib/loopback-sw";

/**
 * Local/dev (loopback): NEVER register a service worker — only nuke existing ones.
 * Non-loopback production: register the v4 kill-switch sw.js once so sticky
 * older workers self-unregister, then do not keep a controlling SW.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void (async () => {
      try {
        if (!("serviceWorker" in navigator)) return;

        // Always clear first.
        await nukeServiceWorkers();

        if (isLoopbackHost(window.location.hostname)) {
          // Local run.bat / npm start — leave SW disabled permanently.
          return;
        }

        if (process.env.NODE_ENV !== "production") return;

        // One-shot: install kill-switch SW so any sticky v1–v3 dies, then nuke again.
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await reg.update();
        // Give activate a tick, then unregister again so we do not stay controlled.
        window.setTimeout(() => {
          void nukeServiceWorkers();
        }, 1500);
      } catch {
        // Ignore
      }
    })();
  }, []);

  return null;
}
