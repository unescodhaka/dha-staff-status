/*
 * Service worker for the Staff Status Board.
 *
 * What it does: keeps a copy of the app's own files so the app opens instantly and can
 * show its screen when the phone is offline, and keeps copies of fonts and the Firebase
 * code libraries.
 *
 * What it never does: it does not touch sign-in or database traffic (Firebase Auth and
 * Firestore), and it never stores staff data. Everything you see after signing in is
 * always loaded live from the server.
 */
const CACHE = 'ssb-shell-v7';
const SHELL = ['./', 'index.html', 'firebase-config.js', 'manifest.webmanifest',
  'logo.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // add one by one so a single missing file cannot block the whole install
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await cache.match('index.html');
      if (page) return page;
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if ((url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) ||
             url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
  }
  // everything else (Firebase Auth, Firestore, other sites) goes straight to the network
});
