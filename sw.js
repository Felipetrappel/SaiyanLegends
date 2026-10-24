/* Service worker: o jogo abre mesmo sem rede depois do primeiro acesso (menu e partida contra bots).
 * Rede primeiro (pega sempre a versão nova); se falhar, usa o cache. O multiplayer (WebSocket /ws) e /healthz nunca passam por aqui. */
const CACHE = 'sl-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname === '/healthz' || u.pathname === '/ws' || r.headers.has('range')) return;
  e.respondWith(fetch(r).then(res => { if (res.ok && res.status === 200) { const c = res.clone(); caches.open(CACHE).then(ch => ch.put(r, c)); } return res; })
    .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
