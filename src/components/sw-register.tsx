"use client";

import { useEffect } from "react";

/** Register the offline shell SW in production; bump + claim so API routes stay uncached. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
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
