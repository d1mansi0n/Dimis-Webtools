/**
 * The service worker: offline support for every tool on the site.
 *
 * Each tool is already entirely self-contained — no accounts, no servers, no
 * network calls of any kind once the page has loaded — so the only thing
 * standing between them and working offline was the fetch of the page itself.
 * The Recipes shopping list is the case that made this worth doing: a shop is
 * exactly where a phone has one bar and the list is needed most.
 *
 * ### Strategy
 *
 * **Pages are network-first.** A navigation goes to the network whenever there
 * is one, and falls back to the cache only when the fetch fails. Someone online
 * therefore always gets the current deploy, and never a version this worker
 * happens to be holding — which is the failure mode that makes service workers
 * infamous, and the reason a stale-first strategy was rejected here.
 *
 * **Hashed assets are cache-first.** Everything under `assets/` carries a
 * content hash in its name, so a given URL's bytes can never change. Those are
 * safe to serve from cache without asking, and that is what makes a repeat visit
 * cheap.
 *
 * ### Deliberately hand-written
 *
 * Workbox would generate this, but it would also put third-party code into
 * something every visitor executes — and note that it would arrive as a *dev*
 * dependency, so `build/dependencies.test.ts` would not have caught it. The
 * whole point of that test is that nothing third-party reaches a browser, and a
 * build-time generator emitting runtime code is the loophole in it. This is
 * about a hundred lines instead.
 */

/*
 * The build replaces both of these. `PRECACHE` becomes the real list of hashed
 * filenames, which is only known once Rollup has emitted them, and `CACHE_NAME`
 * becomes a hash of that list — so a deploy that changes anything lands in a new
 * cache and the previous one is deleted on activation.
 */
const PRECACHE = '__PRECACHE_MANIFEST__' as unknown as readonly string[];
const CACHE_NAME = '__CACHE_VERSION__';

/**
 * `self` is a `ServiceWorkerGlobalScope` here, but the project compiles with the
 * DOM lib as well, so the global is typed as a window. The cast is confined to
 * this one binding rather than repeated at every use.
 */
const worker = self as unknown as ServiceWorkerGlobalScope;

/** Assets whose URL already identifies their content, so they never go stale. */
function isImmutable(url: URL): boolean {
  return url.pathname.includes('/assets/');
}

/**
 * Match options used for every cache lookup here.
 *
 * `ignoreVary` is not a shortcut, it is the fix for a real bug. Servers commonly
 * answer with `Vary: Origin` — `vite preview` does, which is what the end-to-end
 * suite runs against — and the Cache API honours `Vary` by default. The requests
 * stored during install are `no-cors` and carry no `Origin` header, while the
 * module and stylesheet requests the browser makes for a page do, so every
 * lookup missed and the site was cached but unusable offline: the HTML came back
 * and every script alongside it failed.
 *
 * Ignoring it is safe here precisely because the whole site is one origin and
 * answers identically whatever the header says. There is no second variant of
 * any of these responses to confuse this with.
 */
const MATCH: CacheQueryOptions = { ignoreVary: true };

worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      /* `reload` so installing never picks up a stale copy from the HTTP cache,
         which would defeat the point of a fresh deploy. */
      await cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' })));

      /* Take over straight away. Pages are network-first and assets are
         content-hashed, so there is no version-skew hazard in doing so, and
         waiting would mean the first visit never gets offline support. */
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('fetch', (event) => {
  const { request } = event;

  /* Only same-origin GETs are ours. Anything else — and there should be nothing
     else, since the site talks to no one — goes straight to the network. */
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;

  event.respondWith(
    request.mode === 'navigate'
      ? networkFirst(request, url)
      : isImmutable(url)
        ? cacheFirst(request)
        : networkFirst(request, url),
  );
});

/**
 * Serve from cache, falling back to the network for anything not precached.
 *
 * Used only for content-hashed URLs, where a cache hit is by definition the
 * right bytes.
 */
async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request, MATCH);
  if (cached !== undefined) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Go to the network, and fall back to the cache only when that fails.
 *
 * A successful response refreshes the cached copy on the way past, so the
 * offline fallback keeps up with what the user has actually seen.
 */
async function networkFirst(request: Request, url: URL): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      /* Not awaited: the response should not wait on a cache write. */
      void cache.put(request, response.clone());
    }
    return response;
  } catch (cause) {
    const cached = await caches.match(request, MATCH);
    if (cached !== undefined) return cached;

    /* A navigation to a page that was never cached — a deep link followed
       offline. The directory URL is what the precache holds, so try that before
       giving up. */
    if (request.mode === 'navigate') {
      const directory = await caches.match(url.pathname.replace(/[^/]+$/, ''), MATCH);
      if (directory !== undefined) return directory;
    }

    throw cause;
  }
}
