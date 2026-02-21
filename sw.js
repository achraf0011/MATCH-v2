'use strict';
var CACHE = 'madarik-v1';
var ASSETS = [
  'index.html',
  'css/main.css',
  'js/config.js',
  'js/utils.js',
  'js/storage.js',
  'js/auth.js',
  'js/modals.js',
  'js/app.js',
  'js/navbar.js',
  'js/chat.js',
  'js/pages.js',
  'js/bootstrap.js'
];
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  if (e.request.url.startsWith('http') && !e.request.url.includes('youtube') && !e.request.url.includes('googleapis')) {
    e.respondWith(
      caches.match(e.request).then(function (r) {
        return r || fetch(e.request).then(function (res) {
          var clone = res.clone();
          if (res.status === 200 && (e.request.url.endsWith('.html') || e.request.url.endsWith('.css') || e.request.url.endsWith('.js'))) {
            caches.open(CACHE).then(function (cache) { cache.put(e.request, clone); });
          }
          return res;
        });
      })
    );
  }
});
