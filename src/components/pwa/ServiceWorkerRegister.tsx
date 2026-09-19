"use client";

import { useEffect } from "react";

/** registers the service worker that powers PWA offline support.
 *
 * Dev must NOT register it: dev chunk URLs are not content-hashed, so the
 * worker's stale-while-revalidate cache serves the previous build after every
 * code change (the app always lags one edit behind). Unregister and clear
 * instead — production builds keep the offline support. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => {
          if (typeof caches === "undefined") return;
          return caches
            .keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
        })
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support unavailable — the app still works */
    });
  }, []);
  return null;
}
