// Service worker minimal : rend le menu installable et consultable même sans réseau (dernière version vue).
const CACHE = 'lag-menu-v1';
const SHELL = ['/menu', '/assets/site.css', '/assets/menu.css', '/assets/site.js', '/assets/menu.js', '/img/logo-t-192.png', '/img/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => null)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  // pages : réseau d'abord (contenu du soir à jour), cache en secours
  if (req.mode === 'navigate') { e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(url.pathname === '/menu' || url.pathname.startsWith('/menu?') ? '/menu' : req, c)); return r; }).catch(() => caches.match('/menu'))); return; }
  // images et fichiers : cache d'abord, puis réseau
  if (/\.(?:css|js|png|jpg|webp|svg|woff2?)$/.test(url.pathname) || url.pathname.startsWith('/photos/')) { e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(req, c)); return r; }))); }
});
