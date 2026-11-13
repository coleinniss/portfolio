// Minimal offline shell: network-first so edits show immediately; the cache is the offline fallback.
const CACHE = "close-v3";
const FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "app.js", "ui.js", "store.js", "time.js", "recorder.js", "setup.js", "loop.js",
  "assets/icon.svg", "assets/two-circles.svg", "assets/ellipse-sand.svg",
  "assets/ellipse-blush.svg", "assets/ellipse-dashed.png", "assets/heart-white.svg",
  "assets/hub-ring.svg", "assets/hub-core.svg", "assets/hub-heart.svg",
  "assets/sent-ring-outer.svg", "assets/sent-ring-inner.svg", "assets/sent-core.svg",
  "assets/offline-ring.svg", "assets/offline-core.png", "assets/offline-heart.svg",
  "assets/icon-arrival-doodle.svg", "assets/icon-voice.svg", "assets/icon-doodle.svg",
  "assets/rec-track.svg", "assets/grid-dot.svg", "assets/check.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
