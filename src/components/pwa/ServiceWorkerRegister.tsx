"use client";

import { useEffect } from "react";

/** registers the service worker that powers PWA offline support */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support unavailable — the app still works */
      });
    }
  }, []);
  return null;
}
