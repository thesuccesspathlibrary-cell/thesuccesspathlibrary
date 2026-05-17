const CACHE_NAME = "success-path-library-shell-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./Library.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./flexible-admission-core.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(match => match || caches.match("./Library.html") || caches.match("./index.html")))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(match => {
        if (match) return match;
        return fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        });
      })
    );
    return;
  }

  if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/i.test(url.hostname)) {
    event.respondWith(
      caches.match(request).then(match => {
        if (match) return match;
        return fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        });
      })
    );
  }
});
