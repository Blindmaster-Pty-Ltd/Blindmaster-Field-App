// Caches the app shell so it opens quickly and works with a weak signal.
// Schedule data is cached by the app itself (last loaded day per date).
var CACHE = 'bm-field-v20';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'manifest.webmanifest', 'wordmark-white.svg', 'signin-hero.jpg', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API, maps, fonts go straight to the network
  // network first, fall back to cache: testers always get the latest build when online
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (res) { // always check GitHub for a newer copy (Pages caches files for 10 min)
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('index.html'); }); }));
});
