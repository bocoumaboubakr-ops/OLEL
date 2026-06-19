const CACHE_VERSION = 'olel-v4-operator-pro';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const MAP_CACHE = `${CACHE_VERSION}-tiles`;
const API_CACHE = `${CACHE_VERSION}-api`;

const SHELL_ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// ── Install : cache le shell ──────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      Promise.allSettled(SHELL_ASSETS.map((url) => c.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// ── Activate : purge les anciens caches ──────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { url, method } = e.request;

  // Ignore non-GET et requêtes chrome-extension
  if (method !== 'GET' || url.startsWith('chrome-extension')) return;

  // Tuiles OpenStreetMap — Stale-While-Revalidate (cache agressif 7j)
  if (url.includes('tile.openstreetmap.org') || url.includes('openstreetmap.org/tiles')) {
    e.respondWith(staleWhileRevalidate(e.request, MAP_CACHE, 7 * 24 * 3600));
    return;
  }

  // Appels API — Network-First avec fallback cache (60s)
  if (url.includes('/api/')) {
    e.respondWith(networkFirstWithCache(e.request, API_CACHE, 60));
    return;
  }

  // Shell/assets — Cache-First
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

async function networkFirstWithCache(req, cacheName, maxAgeSeconds) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      const clone = res.clone();
      // Ajoute un header d'expiration
      const headers = new Headers(clone.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const body = await clone.arrayBuffer();
      cache.put(req, new Response(body, { status: clone.status, headers }));
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0', 10);
      if (Date.now() - cachedAt < maxAgeSeconds * 1000) return cached;
    }
    return new Response(JSON.stringify({ offline: true, error: 'Hors ligne — données non disponibles' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(req, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const cachedAt = parseInt(cached?.headers?.get('sw-cached-at') || '0', 10);
  const fresh = cached && (Date.now() - cachedAt < maxAgeSeconds * 1000);

  const fetchPromise = fetch(req).then((res) => {
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set('sw-cached-at', Date.now().toString());
      res.arrayBuffer().then((body) =>
        cache.put(req, new Response(body, { status: res.status, headers }))
      );
    }
    return res;
  }).catch(() => null);

  return fresh ? cached : (fetchPromise || cached);
}

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  const data = e.data?.json() || {};
  const severity = data.severity || 1;
  const sevIcon = severity >= 3 ? '🚨' : severity === 2 ? '⚠️' : '📢';

  e.waitUntil(
    self.registration.showNotification(data.title || `${sevIcon} OLEL – Alerte`, {
      body: data.body || 'Nouvelle alerte dans votre zone.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.alertId || 'olel-alert',
      data: { url: data.url || '/' },
      vibrate: severity >= 3 ? [300, 100, 300, 100, 300] : [200, 100, 200],
      requireInteraction: severity >= 3,
      actions: [
        { action: 'view', title: 'Voir l\'alerte' },
        { action: 'dismiss', title: 'Ignorer' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const target = e.notification.data?.url || '/';
      const existing = cs.find((c) => c.url.includes(self.registration.scope));
      if (existing) return existing.focus().then(() => existing.navigate(target));
      return clients.openWindow(target);
    })
  );
});

// ── Background sync : signalements offline ───────────────────────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-signalements') {
    e.waitUntil(syncOfflineSignalements());
  }
});

async function syncOfflineSignalements() {
  // Les signalements offline sont stockés dans IndexedDB côté app.
  // Ici on notifie simplement les clients qu'il faut re-synchro.
  const cs = await clients.matchAll({ type: 'window' });
  cs.forEach((c) => c.postMessage({ type: 'SYNC_SIGNALEMENTS' }));
}
