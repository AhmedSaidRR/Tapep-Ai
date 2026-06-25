// ── Tabeeb AI PWA Service Worker ──────────────────────────────────────────────
const CACHE_NAME = "tabeeb-ai-v1";

// Static assets to cache on install (shell caching)
const SHELL_ASSETS = [
  "/",
  "/static/styles.css",
  "/static/manifest.json",
  "/static/icon-192x192.png",
  "/static/icon-512x512.png",
];

// ── Install: cache the app shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Tabeeb AI SW] Caching app shell…");
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[Tabeeb AI SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network-first for API, Cache-first for static assets ───────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go network for API calls (chat, health checks, streaming)
  if (
    url.pathname.startsWith("/chat") ||
    url.pathname.startsWith("/health") ||
    url.pathname.startsWith("/conversation") ||
    url.pathname.startsWith("/sessions")
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({
            type: "error",
            content: "⚠️ لا يوجد اتصال بالإنترنت. يرجى المحاولة لاحقاً.",
          }),
          { headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // Cache-first for static assets (CSS, icons, fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Only cache successful GET responses for static assets
          if (
            event.request.method === "GET" &&
            response.status === 200 &&
            (url.pathname.startsWith("/static/") || url.pathname === "/")
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});

// ── Push Notifications (future use) ──────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Tabeeb AI 💊";
  const body = data.body || "تذكير: موعد دوائك الآن";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/static/icon-192x192.png",
      badge: "/static/icon-72x72.png",
      vibrate: [200, 100, 200],
      tag: "tabeeb-ai-reminder",
      data: { url: data.url || "/" },
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windows) => {
      for (const w of windows) {
        if (w.url === targetUrl && "focus" in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
