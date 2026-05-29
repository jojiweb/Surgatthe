/* Obras FG - Service Worker enxuto (app shell). */

const VERSION = "v1";
const STATIC_CACHE = `obras-fg-static-${VERSION}`;
const RUNTIME_CACHE = `obras-fg-runtime-${VERSION}`;

const APP_SHELL = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 1. Navegacao (HTML): network-first; em offline cai para shell cacheado.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return (
          (await cache.match(req)) ||
          (await cache.match("/")) ||
          new Response("Offline", { status: 503 })
        );
      })
    );
    return;
  }

  // 2. Assets estaticos do Next: stale-while-revalidate.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networked = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networked;
      })
    );
    return;
  }

  // 3. Tudo o mais (API, auth, dados, storage): direto na rede sem cache.
});
