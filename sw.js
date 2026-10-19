/* Fabdia Media service worker
   - keeps the app shell so Fabdia opens even with no connection
   - always asks the network first, so updates reach people straight away
   - never touches the backend (a different address)
   - also handles web push notifications (self-hosted, same origin) */

const CACHE = "fabdia-shell-v6";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "favicon.ico", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    // on a slow connection, fall back to the saved copy after 4 seconds
    const response = await withTimeout(fetch(request), 4000);
    if (response && response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    const saved = (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
    if (saved) return saved;
    return new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  const fresh = fetch(request).then((response) => { cache.put(request, response.clone()); return response; }).catch(() => saved);
  return saved || fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, request.mode === "navigate" ? "index.html" : undefined));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // everything else (the backend, uploaded photos and videos) goes straight to the network
});

/* ---------- Web Push ---------- */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Fabdia", body: event.data.text() };
  }

  const title = payload.title || "Fabdia";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "./", ...(payload.data || {}) },
    renotify: !!payload.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url, self.location.origin).href;
      for (const client of allClients) {
        if (client.url === target && "focus" in client) {
          return client.focus();
        }
      }
      // fall back to any open window, navigate it, then focus
      for (const client of allClients) {
        if ("navigate" in client && "focus" in client) {
          await client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
