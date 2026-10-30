// ParsBuilding Service Worker - Offline PWA Support
const CACHE_NAME = 'pars-building-v1.0';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/fonts/vazirmatn.css',
  './css/fonts/Vazirmatn-Light.woff2',
  './css/fonts/Vazirmatn-Regular.woff2',
  './css/fonts/Vazirmatn-Medium.woff2',
  './css/fonts/Vazirmatn-Bold.woff2',
  './css/fonts/Vazirmatn-ExtraBold.woff2',
  './css/fonts/Vazirmatn-Black.woff2',
  './js/vendor/tailwind.js',
  './js/utils.js',
  './js/idb.js',
  './js/state.js',
  './js/logic.js',
  './js/ui.js',
  './js/reports.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached and update in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => {
      if (event.request.headers.get('accept')?.includes('text/html')) {
        return caches.match('./index.html');
      }
    })
  );
});
