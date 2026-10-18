// Theme for every page: Auto follows the device's light / dark setting; the choice is remembered on this device.
// Loaded in <head> so the page is drawn in the right theme from the first frame.
// Buttons with data-theme-btn (or id themeBtn) cycle Auto -> Light -> Dark.
// data-update-btn appears when the published theme.js carries a newer APP_VER than the one running; click hard-reloads.
(() => {
  const KEY = 'pokemonduelweb.theme', sysLight = matchMedia('(prefers-color-scheme: light)'); let mode = 'auto';
  // The app's version, and the only place it is written. The Pages deploy replaces the last number with its run number on every push;
  // raise major.minor here by hand. Running copies compare theirs with the published one.
  window.APP_VER = '0.4.0';
  // Small line icons drawn here (no icon font or image files). icon() is shared with the pages for their own buttons.
  window.icon = body => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const mountVer = () => {
    if (document.getElementById('appVer')) return;
    const el = document.createElement('div');
    el.id = 'appVer'; el.className = 'appver'; el.setAttribute('aria-hidden', 'true');
    el.textContent = 'v' + window.APP_VER;
    (document.body || document.documentElement).appendChild(el);
  };
  if (document.body) mountVer(); else addEventListener('DOMContentLoaded', mountVer);
  if (navigator.standalone === true) document.documentElement.classList.add('ios-app');   // opened from an iOS home screen (only iOS sets navigator.standalone)
  const ICONS = { auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' };
  const UPDATE_ICON = '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/><path d="M12 8v4l2.5 1.5"/>';
  // The button shows the current selection (Auto / Light / Dark); click cycles to the next.
  const NEXT = { auto: 'light', light: 'dark', dark: 'auto' }, LOOK = { light: ['#fff', '#111', '#cfcfcf'], dark: ['#000', '#f2f2f2', '#333'] };
  const themeBtns = () => {
    const seen = new Set(), out = [];
    for (const b of document.querySelectorAll('[data-theme-btn], #themeBtn')) { if (seen.has(b)) continue; seen.add(b); out.push(b); }
    return out;
  };
  const label = () => {
    const look = mode === 'auto' ? (sysLight.matches ? 'light' : 'dark') : mode;
    const [bg, ink, line] = LOOK[look];
    const title = 'Theme: ' + mode + (mode === 'auto' ? ' (follows device)' : '') + ' — click for ' + NEXT[mode];
    for (const b of themeBtns()) {
      b.innerHTML = icon(ICONS[mode]); b.title = title; b.setAttribute('aria-label', title); b.classList.add('iconbtn');
      Object.assign(b.style, { background: bg, color: ink, borderColor: line });
      if (!b._themeBound) { b._themeBound = 1; b.onclick = () => setTheme(NEXT[mode]); }
    }
  };
  window.setTheme = m => { mode = ['auto', 'light', 'dark'].includes(m) ? m : 'auto'; document.documentElement.dataset.theme = mode === 'auto' ? (sysLight.matches ? 'light' : 'dark') : mode; label(); try { localStorage.setItem(KEY, mode); } catch (e) {} };
  window.themeMode = () => mode;
  let saved = 'auto'; try { saved = localStorage.getItem(KEY); if (saved == null) { const old = localStorage.getItem('figureduel.theme'); if (old != null) { saved = old; localStorage.setItem(KEY, old); localStorage.removeItem('figureduel.theme'); } } saved = saved || 'auto'; } catch (e) {} setTheme(saved);
  sysLight.addEventListener('change', () => { if (mode === 'auto') setTheme('auto'); else label(); });
  addEventListener('DOMContentLoaded', () => label());

  // --- Figure pictures: animated or still -----------------------------------
  // Buttons with data-motion-btn show the current choice and switch it. Pages read spriteMotion() ('anim' / 'still') and redraw on the
  // 'spritemotion' event. Remembered on this device; with no choice made, a device that asks for reduced motion gets still pictures.
  const MKEY = 'pokemonduelweb.motion', MICON = { anim: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>', still: '<rect x="3.5" y="5" width="17" height="14" rx="1"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8 8"/>' };
  let motion = null; try { motion = localStorage.getItem(MKEY); } catch (e) {}
  if (motion !== 'anim' && motion !== 'still') motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'anim';
  window.spriteMotion = () => motion;
  const motionLabel = () => {
    const title = 'Figure pictures: ' + (motion === 'anim' ? 'animated' : 'still') + ' — click for ' + (motion === 'anim' ? 'still' : 'animated');
    for (const b of document.querySelectorAll('[data-motion-btn]')) {
      b.innerHTML = icon(MICON[motion]); b.title = title; b.setAttribute('aria-label', title); b.classList.add('iconbtn');
      if (!b._motionBound) { b._motionBound = 1; b.onclick = () => window.setSpriteMotion(motion === 'anim' ? 'still' : 'anim'); }
    }
  };
  window.setSpriteMotion = m => { motion = m === 'still' ? 'still' : 'anim'; try { localStorage.setItem(MKEY, motion); } catch (e) {} motionLabel(); dispatchEvent(new Event('spritemotion')); };
  addEventListener('DOMContentLoaded', motionLabel);

  // --- Update check (the published APP_VER) -------------------------------
  const parts = v => String(v || '').replace(/^v/i, '').split(/[.+-]/).map(x => { const n = parseInt(x, 10); return Number.isFinite(n) ? n : 0; });
  const isNewer = (remote, local) => {
    const a = parts(remote), b = parts(local), n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d > 0; }
    return false;
  };
  // Two caches can hold an old build: the browser's HTTP cache (GitHub Pages lets it keep files for 10 minutes) and the asset gate's
  // Cache Storage, which the service worker serves first for ever (engine worker, tfg.js, emulator). Every same-origin page / script /
  // style / data file this page has loaded is fetched again with cache: 'reload', which also rewrites the HTTP cache entry, and code
  // the gate stored is replaced. Sound, music and the engine binary stay cached.
  const CODE = /\.(html?|js|mjs|css|json)$|\/$/i;
  async function refetchCode() {
    const base = document.baseURI || location.href, urls = new Set([location.href.split('#')[0], new URL('index.html', base).href]);
    for (const el of document.querySelectorAll('script[src], link[rel="stylesheet"][href]')) urls.add(el.src || el.href);
    for (const e of performance.getEntriesByType('resource')) urls.add(e.name);
    for (const f of ['engine-worker.js', 'tfg.js', 'vendor/unicorn_arm.js', 'sw.js']) urls.add(new URL(f, base).href);
    const cache = 'caches' in window ? await caches.open('pdw-assets-v1').catch(() => null) : null;
    await Promise.all([...urls].filter(u => { try { const x = new URL(u); return x.origin === location.origin && CODE.test(x.pathname); } catch (e) { return false; } }).map(async u => {
      const r = await fetch(u, { cache: 'reload' }).catch(() => null);
      if (r && r.ok && cache && await cache.match(u, { ignoreSearch: true })) await cache.put(u, r.clone()).catch(() => {});
    }));
  }
  async function hardReload() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) {}
    try { await refetchCode(); } catch (e) {}
    const u = new URL(location.href);
    u.searchParams.set('_', String(Date.now()));
    location.replace(u.href);
  }
  function paintUpdate(remote) {
    const title = 'Update to v' + remote + ' (you have v' + window.APP_VER + ') — tap to reload';
    for (const b of document.querySelectorAll('[data-update-btn], #updateBtn')) {
      b.hidden = false;
      b.classList.add('iconbtn', 'updatebtn');
      b.innerHTML = icon(UPDATE_ICON);
      b.title = title;
      b.setAttribute('aria-label', title);
      if (!b._updateBound) { b._updateBound = 1; b.onclick = () => { hardReload(); }; }
    }
  }
  async function checkRelease() {
    try {
      const r = await fetch(new URL('theme.js', document.baseURI || location.href), { cache: 'no-store' });
      if (!r.ok) return;
      const tag = ((await r.text()).match(/APP_VER = '([^']+)'/) || [])[1];
      if (tag && isNewer(tag, window.APP_VER)) paintUpdate(tag);
    } catch (e) {}
  }
  const boot = checkRelease;
  try { const u = new URL(location.href); if (u.searchParams.has('_')) { u.searchParams.delete('_'); history.replaceState(history.state, '', u.href); } } catch (e) {}   // the cache-busting mark has done its job once the page is here
  if (document.body) boot();
  else addEventListener('DOMContentLoaded', boot);
})();
