// Cache-first for assets the gate has stored and for figure sprites (kept on first use); everything else goes to the network.
const CACHE = 'pdw-assets-v1';
const SPRITES = 'pdw-sprites-f5ecfc673a';   // stamped by tools/build_sprites.py from the sprite files: a rebuild changes it, this worker updates and drops the old sprites

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => (k !== CACHE && k.startsWith('pdw-assets-')) || (k !== SPRITES && k.startsWith('pdw-sprites-'))).map(k => caches.delete(k)));
    const old = await caches.open(CACHE); await Promise.all((await old.keys()).filter(r => r.url.includes('/sprites/')).map(r => old.delete(r)));   // sprites an earlier worker kept with the assets
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(url.pathname.includes('/sprites/') ? SPRITES : CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && url.pathname.includes('/sprites/')) cache.put(req, res.clone());   // figure sprites: fetched once, then kept
    return res;
  })());
});
