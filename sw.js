/* My Laundry — app shell service worker */
const CACHE = 'my-laundry-v5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const wantsHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isWorker = url.pathname.endsWith('/sw.js');

  /* the page itself: always ask the network first, so a new deploy shows up at once.
     the cache is only the offline fallback. */
  if (wantsHTML || isWorker) {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  /* icons, manifest, fonts: cache first, refreshed in the background */
  if (url.origin !== location.origin) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && res.status === 200) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
