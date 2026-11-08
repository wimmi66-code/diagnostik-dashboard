/* Service Worker: App-Hülle offline verfügbar; Daten kommen immer frisch aus der Datenbank. */
const CACHE = 'diagnostik-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/store.js', 'js/parser.js', 'js/config.js', 'js/demo-data.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // Supabase/CDN nicht cachen
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
