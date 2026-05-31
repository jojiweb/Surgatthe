"use client";

import { useEffect } from "react";

/**
 * Registra o service worker em /sw.js. Apenas em producao para nao
 * atrapalhar o dev (HMR). Se quiser testar local em prod, rode
 * `npm run build && npm start`.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // silencioso - SW eh progressive enhancement
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
