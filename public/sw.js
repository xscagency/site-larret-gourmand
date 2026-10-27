// Service worker : rend le site installable et consultable même sans réseau (dernière version vue),
// et reçoit les alertes envoyées sur le téléphone (notifications).
const CACHE = 'lag-site-v5';
const SHELL = ['/', '/assets/site.css', '/assets/site.js', '/img/logo-t-192.png', '/img/icon-192-v2.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => null)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
  // pages : réseau d'abord (contenu du soir à jour), cache en secours
  if (req.mode === 'navigate') { e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(url.pathname === '/' ? '/' : req, c)); return r; }).catch(() => caches.match(url.pathname === '/' ? '/' : req).then((hit) => hit || caches.match('/')))); return; }
  // images et fichiers : cache d'abord, puis réseau
  if (/\.(?:css|js|png|jpg|webp|svg|woff2?)$/.test(url.pathname) || url.pathname.startsWith('/photos/')) { e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(req, c)); return r; }))); }
});

// ---- Alertes : affichage de la notification reçue
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "L'Arrêt Gourmand", body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: d.body || '',
    icon: '/img/icon-192-v2.png',
    badge: '/img/icon-192-v2.png',
    tag: d.tag || 'lag',
    renotify: !!d.tag,
    data: { url: d.url || '/?source=push', id: d.id || 0 },
  };
  if (d.image) opts.image = d.image;
  e.waitUntil(Promise.all([self.registration.showNotification(d.title || "L'Arrêt Gourmand", opts), suivi(d.id, 'recu')]));
});
// un appui sur la notification ouvre la page visée (ou ramène l'onglet déjà ouvert)
// le téléphone confirme au site qu'une alerte est bien arrivée / a été ouverte (statistiques de l'admin)
function suivi(id, type) {
  if (!id) return Promise.resolve();
  return self.registration.pushManager.getSubscription().then((sub) => sub && fetch('/api/alertes/suivi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, id, type, ua: navigator.userAgent }) })).catch(() => null);
}
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => c.url.split('?')[0] === url.split('?')[0]);
    if (same) return same.focus().then(() => ('navigate' in same ? same.navigate(url) : null));
    return self.clients.openWindow(url);
  }));
});
// le navigateur a renouvelé l'abonnement : on le transmet au site en gardant les préférences
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const old = e.oldSubscription;
    let sub = e.newSubscription;
    if (!sub) {
      const key = old && old.options && old.options.applicationServerKey;
      if (!key) return;
      sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }
    let prefs = {};
    if (old) { try { const r = await fetch('/api/alertes/etat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: old.endpoint }) }); prefs = (await r.json()).abonne || {}; } catch (err) {} }
    await fetch('/api/alertes/abonner', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), villes: prefs.villes || [], sujets: prefs.sujets || ['service', 'annulation', 'burger', 'offres'], silencieux: true }) });
  })());
});
