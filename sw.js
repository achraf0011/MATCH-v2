'use strict';

/**
 * Service Worker — Network-First strategy
 *
 * Always tries the network first so users receive the latest deployed files
 * immediately. Falls back to cache only when completely offline.
 *
 * Bump CACHE_VERSION on every deploy to evict the previous cache bucket.
 */
var CACHE_VERSION = 'madarik-v2';

/* Install: activate immediately without waiting for old SW to stop */
self.addEventListener('install', function () {
  self.skipWaiting();
});

/* Activate: delete every old cache bucket, then take control of all clients */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE_VERSION) return caches.delete(k);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

/* Fetch: Network-First
   1. Try network → if ok, store a fresh copy in cache and return it.
   2. If network fails → return cached copy (offline fallback).
   Skip non-GET requests and third-party origins (Google Fonts, YouTube…).
*/
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  var url = e.request.url;
  var isThirdParty = url.includes('googleapis.com') ||
                     url.includes('gstatic.com')    ||
                     url.includes('youtube.com')    ||
                     url.includes('youtu.be');
  if (isThirdParty) return;

  if (!url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request).then(function (networkRes) {
      /* Cache a fresh copy for offline use */
      if (networkRes.status === 200) {
        var clone = networkRes.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(e.request, clone);
        });
      }
      return networkRes;
    }).catch(function () {
      /* Network failed — serve from cache if available */
      return caches.match(e.request);
    })
  );
});
