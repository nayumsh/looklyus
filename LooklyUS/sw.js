/* LooklyUS service worker
   Bump CACHE_VERSION whenever you change any cached file so visitors get the update. */

const CACHE_VERSION = "v1";
const STATIC_CACHE = "lookly-static-" + CACHE_VERSION;
const RUNTIME_CACHE = "lookly-runtime-" + CACHE_VERSION;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./about.html",
  "./privacy-policy.html",
  "./terms.html",
  "./affiliate-disclosure.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

const MAX_RUNTIME_ENTRIES = 80;

/* Install: precache core pages. A missing file will not break installation. */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn("Precache skipped:", url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* Activate: remove old caches. */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await cache.delete(keys[0]);
    await trimCache(cacheName, maxEntries);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle same-origin GET requests. Amazon links and other sites are left alone.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first, then cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || caches.match("./offline.html")
          )
        )
    );
    return;
  }

  // Images: cache first, fill the cache as they load.
  if (request.destination === "image") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, copy);
              trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (manifest, icons, scripts): stale while revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
