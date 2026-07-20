/* ================================================================
   KOPPAL KIDS — Service Worker  v6.0
   Strategy:
     • First visit  : downloads ALL files → stores in cache
     • Offline       : serves everything from cache instantly
     • Online update : fetches new version in background;
                       shows "Update ready" banner to user
================================================================ */

const CACHE_NAME   = 'koppal-kids-v6';
const OFFLINE_PAGE = './index.html';

/* Every file the app needs — update this list when you add new
   JSON files or image files to the repo.                        */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  /* data files */
  './data/alphabet.json',
  './data/words.json',
  './data/sentences.json',
  './data/evs.json',
  './data/grammar.json',
  './data/maths.json',
  /* icons */
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  /* optional images — won't break if missing */
  './images/kid1.png',
  './images/kid2.png',
  /* Google Fonts — cache as much as possible */
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Baloo+2:wght@600;700;800;900&display=swap',
];

/* ── INSTALL: cache everything ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      /* cache required files; skip optional ones gracefully */
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(() => {
            console.warn('[SW] Could not cache:', url);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: remove old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: Cache-first for app files, Network-first for JSON ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Skip non-GET requests & browser-extension requests */
  if (event.request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  /* JSON data files: Network-first with cache fallback.
     This means updates to JSON are picked up automatically
     when internet is available.                            */
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }

  /* Everything else: Cache-first (instant load, works offline) */
  event.respondWith(cacheFirstStrategy(event.request));
});

/* Cache-first: try cache → fallback to network → store in cache */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* Fully offline and not in cache: return offline page */
    const fallback = await caches.match(OFFLINE_PAGE);
    return fallback || new Response('Offline', { status: 503 });
  }
}

/* Network-first: try network → update cache → fallback to cache */
async function networkFirstStrategy(request) {
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

/* ── MESSAGE: tell the page when an update is ready ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
