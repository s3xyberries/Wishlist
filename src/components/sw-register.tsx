"use client";

import { useEffect } from "react";
import {
  ensureLoopbackServiceWorkersCleared,
  isLoopbackHost,
} from "@/lib/loopback-sw";

/**
 * PWA shell SW is for deployed hosts only.
 * On loopback (run.bat / local npm start), unregister any SW — Firefox often
 * surfaces SW fetch failures as "NetworkError when attempting to fetch resource"
 * for /api/search.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void (async () => {
      try {
        if (isLoopbackHost(window.location.hostname)) {
          await ensureLoopbackServiceWorkersCleared();
          return;
        }

        if (process.env.NODE_ENV !== "production") return;
        if (!("serviceWorker" in navigator)) return;

        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await reg.update();
      } catch {
        // Ignore registration failures in local/dev edge cases
      }
    })();
  }, []);

  return null;
}
