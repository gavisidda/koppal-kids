/* ================================================================
   KOPPAL KIDS — Service Worker  v7.0
   ── AUTO-UPDATE STRATEGY ──────────────────────────────────────
   • First visit      : Downloads ALL files → stores in cache
   • Offline          : Serves everything from cache instantly
   • Background sync  : Every 6 hours, silently checks for updates
   • Auto-update      : New SW activates automatically without
                        the user having to tap anything
   • JSON data        : Always fetched fresh (network-first)
                        so content updates reach users instantly
================================================================ */

const CACHE_VERSION = 'v7.0';
const CACHE_NAME    = `koppal-kids-${CACHE_VERSION}`;
const OFFLINE_PAGE  = './index.html';

/* ── ALL FILES TO CACHE ON FIRST INSTALL ──
   Add new JSON files here when you create them              */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  /* ── data files ── */
  './data/alphabet.json',
  './data/words.json',
  './data/sentences.json',
  './data/evs.json',
  './data/grammar.json',
  './data/maths.json',
  './data/stories.json',
  './data/rhymes.json',
  /* ── icons ── */
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  /* ── mascot images (optional, won't break if missing) ── */
  './images/kid1.png',
  './images/kid2.png',
  /* ── Google Fonts ── */
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Baloo+2:wght@600;700;800;900&display=swap',
];

/* ════════════════════════════════════════════════════════════════
   INSTALL — cache everything on first load
════════════════════════════════════════════════════════════════ */
self.addEventListener('install', event => {
  console.log(`[SW ${CACHE_VERSION}] Installing…`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Could not pre-cache: ${url}`, err)
          )
        )
      ))
      /* ── KEY: skipWaiting makes the new SW take over IMMEDIATELY
         without waiting for all tabs to close.
         This is what enables true auto-update for PWA users.   */
      .then(() => {
        console.log(`[SW ${CACHE_VERSION}] Installed. Taking control immediately.`);
        return self.skipWaiting();
      })
  );
});

/* ════════════════════════════════════════════════════════════════
   ACTIVATE — delete all old caches, claim all tabs immediately
════════════════════════════════════════════════════════════════ */
self.addEventListener('activate', event => {
  console.log(`[SW ${CACHE_VERSION}] Activating…`);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log(`[SW] Deleting old cache: ${k}`);
            return caches.delete(k);
          })
      ))
      /* ── KEY: clients.claim() makes this SW control ALL open tabs
         right now — not just newly opened ones.
         Combined with skipWaiting above, this means:
         1. User opens app while online
         2. New SW installs & activates in background
         3. All tabs are now controlled by new SW
         4. Next navigation/reload serves new content
         = Completely transparent auto-update, no banner needed  */
      .then(() => {
        console.log(`[SW ${CACHE_VERSION}] Active. Controlling all clients.`);
        return self.clients.claim();
      })
      .then(() => {
        /* Notify all open tabs that update is complete */
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
        );
      })
  );
});

/* ════════════════════════════════════════════════════════════════
   FETCH — smart caching strategy per resource type
════════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Skip non-GET and browser-extension requests */
  if (event.request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  /* ── JSON data files → Network-first
     Ensures fresh content reaches users whenever online.
     Falls back to cached version when offline.              */
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  /* ── Google Fonts → Stale-while-revalidate
     Serve cached font instantly, update in background       */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  /* ── Everything else (HTML, icons, images) → Cache-first
     Instant load from cache, works 100% offline             */
  event.respondWith(cacheFirst(event.request));
});

/* ── Cache-first strategy ── */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const fallback = await caches.match(OFFLINE_PAGE);
    return fallback || new Response('Offline — Koppal Kids', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/* ── Network-first strategy ── */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* ── Stale-while-revalidate strategy ── */
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

/* ════════════════════════════════════════════════════════════════
   BACKGROUND SYNC — check for updates every 6 hours
   Works even when app is not open (on supported browsers)
════════════════════════════════════════════════════════════════ */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'koppal-kids-update-check') {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  try {
    /* Fetch index.html with no-cache to detect changes */
    const response = await fetch('./index.html', {
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('./index.html', response);
      console.log('[SW] Background update check complete');
    }
  } catch (err) {
    console.log('[SW] Background update check failed (offline):', err.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   MESSAGE HANDLER — receive messages from the page
════════════════════════════════════════════════════════════════ */
self.addEventListener('message', event => {
  const { type } = event.data || {};

  /* Manual skip-waiting request (kept for compatibility) */
  if (type === 'SKIP_WAITING') {
    console.log('[SW] Manual SKIP_WAITING received');
    self.skipWaiting();
  }

  /* Page requesting version info */
  if (type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'VERSION_INFO',
      version: CACHE_VERSION,
      cacheName: CACHE_NAME
    });
  }

  /* Page requesting cache refresh of specific URL */
  if (type === 'REFRESH_URL' && event.data.url) {
    fetch(event.data.url, { cache: 'no-cache' })
      .then(r => caches.open(CACHE_NAME).then(c => c.put(event.data.url, r)))
      .catch(() => {});
  }
});

/* ════════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS (future use — placeholder)
   Uncomment and configure when you set up a push server
════════════════════════════════════════════════════════════════ */
/*
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Koppal Kids', {
      body: data.body || 'New activity available!',
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
*/
