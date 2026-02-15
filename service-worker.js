
const cacheName = 'bazimn-cache-v1';
const resourcesToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/howitworks.html',
  '/become-seller.html',
  '/dashboard.html',
  '/privacy.html',
  '/terms.html',
  '/prohibited.html',
  '/disputes.html',
  '/forgot-password.html',
  '/reset-password.html',
  '/inbox.html',
  '/gig-details.html',
  '/dashboard.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(cacheName).then(cache => cache.addAll(resourcesToCache))
  );
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
