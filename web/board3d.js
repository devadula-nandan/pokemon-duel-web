// The 3D table (the default view). It only draws: the page hands it the same model the flat board is drawn from (points, slots, figures, in board units)
// and gets clicks back through window.boardPick, so the rules, engine and HUD are exactly the ones the flat client uses.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BLUE = 0x1565c0, RED = 0xb71c1c, GOLD = 0xffd23f, host = document.getElementById('board3d');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x20264a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-4, 12, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);

const tex = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
// The table is one slate surface that runs past the edge of the view in every direction: a small tile (grain and a faint weave) repeated
// across a very large plane, fading into the distance. It carries no team colour: the goals, rings and bases do that.
const tileCanvas = document.createElement('canvas'); tileCanvas.width = tileCanvas.height = 256;
const tile = new THREE.CanvasTexture(tileCanvas); tile.colorSpace = THREE.SRGBColorSpace; tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(100, 100); tile.anisotropy = 8;
function paintTable() {
  const bd = css('--bd', '#0c0d10'), bd2 = css('--bd2', '#17191e'), line = css('--bd-line', '#c9ced8'), light = new THREE.Color(bd).getHSL({}).l > .5;
  let g = tileCanvas.getContext('2d'); g.globalAlpha = 1; g.fillStyle = new THREE.Color(bd).lerp(new THREE.Color(bd2), .5).getStyle(); g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .06; g.beginPath(); for (let k = -256; k < 512; k += 32) { g.moveTo(k, 0); g.lineTo(k + 256, 256); g.moveTo(k, 0); g.lineTo(k - 256, 256); } g.stroke();   // 32 px steps so the weave meets itself at the tile edges
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // fixed seed: the grain is the same every time
  for (let k = 0; k < 7000; k++) { g.globalAlpha = rnd() * .1; g.fillStyle = rnd() < .5 ? '#000' : '#fff'; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
  g.globalAlpha = 1; tile.needsUpdate = true;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: tile, roughness: .6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
scene.fog = new THREE.Fog(0x0c0d10, 28, 120);   // the far floor melts into the table colour instead of ending at a line

const mat = (color, emissive = 0, o = {}) => new THREE.MeshStandardMaterial({ color, emissive, roughness: .45, ...o });
const M = { line: mat(0xdfe6ff, 0x30385c), pt: mat(0x0c1230), rim: mat(0xdfe6ff, 0x30385c), blue: mat(BLUE, 0x0a2a66), red: mat(RED, 0x4a0a12), mv: mat(GOLD, 0xa07800), slot: mat(0xdfe6ff, 0, { transparent: true, opacity: .5, side: THREE.DoubleSide }), unseen: new THREE.MeshBasicMaterial({ visible: false }), cap: mat(0x101216, 0, { roughness: .35 }), card: mat(0x2a2e36), edge: mat(0xd8dce4, 0, { roughness: .8 }) };   // opaque cap so the bevel catches light instead of looking like a flat disc
const band = (r, w, h) => {   // a ring of radius r, w wide and h tall, lying in the XY plane and centred on it (the meshes turn it flat)
  const outer = new THREE.Shape(); outer.absarc(0, 0, r + w / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, r - w / 2, 0, Math.PI * 2, true); outer.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: false, curveSegments: 40 }); g.translate(0, 0, -h / 2); return g;
};
const BASE_R = .4, BASE_H = .16, CAP_H = .04, CAP_IN = .05;   // stand: perfect cylinder; white lid shares the rim then chamfers in
const capGeo = (() => {
  const rim = BASE_R + .003;   // hair wider than the cylinder so the lid covers the top face at every camera angle
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(rim, 0), new THREE.Vector2(rim, .003)];
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * (Math.PI / 2); pts.push(new THREE.Vector2(rim - CAP_IN + CAP_IN * Math.cos(a), .003 + (CAP_H - .003) * Math.sin(a))); }
  pts.push(new THREE.Vector2(0, CAP_H));
  return new THREE.LatheGeometry(pts, 64);
})();
const ROUTE_W = .06, ROUTE_H = .05;   // route joining bars: BoxGeometry(ROUTE_W, ROUTE_H, length)
const AURA_W = .22, AURA_H = ROUTE_H, AURA_MID = BASE_R + AURA_W / 2;   // status ring: wider band under the condition text; text sits on its top at the midline radius
const WORDS_PLANE = AURA_MID * 2 * (256 / 200);   // around() draws at R=200 on a 512 canvas → world radius = AURA_MID
const TAG_R = .14, TAG_H = .055;   // MP marker: short 3D puck; digit is a sprite so it stays screen-upright
const tagBodyGeo = (() => { const g = new THREE.CylinderGeometry(TAG_R, TAG_R, TAG_H, 32); g.rotateX(Math.PI / 2); return g; })();   // axis along Z, caps face the camera
const G = { pt: new THREE.CylinderGeometry(.33, .33, .05, 36), rim: new THREE.CylinderGeometry(.4, .4, .03, 36), goal: new THREE.CylinderGeometry(.5, .5, .04, 40), slot: new THREE.RingGeometry(.38, .46, 36), dot: new THREE.CylinderGeometry(.135, .135, .05, 28), entry: band(.3, ROUTE_W, ROUTE_H), arrow: new THREE.CylinderGeometry(.16, .16, .05, 3), ring2: band(.43, ROUTE_W, ROUTE_H), goalDisc: new THREE.CircleGeometry(.38, 36), goalRim: new THREE.RingGeometry(.38, .46, 36), aura: band(AURA_MID, AURA_W, AURA_H), words: new THREE.PlaneGeometry(WORDS_PLANE, WORDS_PLANE),
  base: new THREE.CylinderGeometry(BASE_R, BASE_R, BASE_H, 48), cap: capGeo, ring: band(.5, .07, .05), tagBody: tagBodyGeo };
function applyTheme() {
  const bd = css('--bd', '#0c0d10'), line = css('--bd-line', '#c9ced8'), pt = css('--bd-pt', '#101216'), light = new THREE.Color(bd).getHSL({}).l > .5;
  paintTable(); scene.fog.color.set(bd).lerp(new THREE.Color(css('--bd2', '#17191e')), .5); scene.background = scene.fog.color;   // the sky is the table colour too, so there is no line where the far floor ends
  M.line.color.set(line); M.rim.color.set(line); M.slot.color.set(line); M.pt.color.set(pt); M.cap.color.set(pt);
  M.line.emissive.set(line).multiplyScalar(light ? 0 : .22); M.rim.emissive.copy(M.line.emissive);
  M.edge.color.set(pt).lerp(new THREE.Color(line), .7);   // the plates' cut edge
}
applyTheme();
const statics = new THREE.Group(), points = new Map(), tokens = new Map(), pickable = []; scene.add(statics);
let built = '', last = null;
new MutationObserver(() => {
  applyTheme(); extrasKey = '';
  const prevEvo = evoMap; evoMap = paintEvoMap(); if (prevEvo) prevEvo.dispose();   // Evolve pill follows --ink / --bg
  for (const g of tokens.values()) {
    const u = g.userData; u.key = null; u.badge = null;
    if (u.evo) { u.evo.material.map = evoMap; u.evo.material.needsUpdate = true; }
  }
  if (last) draw(last);
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
// status conditions get an aura in their own colour; anything else with a marker gets a white one
const TINT = new THREE.Color();
const AURA = { poison: 0xa855f7, bad_poison: 0x6b21a8, burn: 0xff7a1a, paralyze: 0xfde047, sleep: 0x94a3b8, freeze: 0x67e8f9, melt: 0x67e8f9, panic: 0xf472b6, curse: 0x7c3aed };

function build(m) {   // routes, spots and slots never move during a duel (the far side is the near side turned around)
  statics.clear(); for (const g of points.values()) { const i = pickable.indexOf(g.userData.mark); if (i >= 0) pickable.splice(i, 1); } points.clear();
  // a route stops at the rim of an entry point's ring, and of a goal's, instead of running through it. (Lifting the goal disc over the
  // routes is not enough: from the duel's camera distance the two are too close in depth and the line shows through.)
  const rims = m.pts.filter(p => p.goal != null || [0, 6, 21, 27].includes(p.k)).map(p => [p.x, p.z, p.goal != null ? .46 : .33]);
  const cut = (q, to) => { const rim = rims.find(r => Math.hypot(r[0] - q[0], r[1] - q[1]) < .01); if (!rim) return q; const l = Math.hypot(to[0] - q[0], to[1] - q[1]); return [q[0] + (to[0] - q[0]) * rim[2] / l, q[1] + (to[1] - q[1]) * rim[2] / l]; };
  for (const [a0, b0] of m.edges) { const a = cut(a0, b0), b = cut(b0, a0), d = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), e = new THREE.Mesh(new THREE.BoxGeometry(ROUTE_W, ROUTE_H, d.length()), M.line);
    e.position.set((a[0] + b[0]) / 2, .025, (a[1] + b[1]) / 2); e.rotation.y = Math.atan2(d.x, d.z); statics.add(e); }
  for (const s of m.slots) { const r = new THREE.Mesh(G.ring2, M.line); r.rotation.x = Math.PI / 2; r.position.set(s[0], .025, s[1]); r.castShadow = true; statics.add(r); }
  // Slots 12-15 are the P.C. spots (inner, outer for each side). A blunt raised arrow sits on each one's ring, pointing where its figure goes
  // next: the outer spot to the inner one, the inner one to the bench spot diagonally below it (slots 5 and 11, the back row's inner end).
  for (const [from, to, stem] of [[13, 12, .27], [12, 5, 0], [15, 14, .27], [14, 11, 0]]) {   // stem: length of the bar between ring and arrowhead (the outer spot's arrow has one)
    const s = m.slots[from], t = m.slots[to]; if (!s || !t) continue;
    const dx = t[0] - s[0], dz = t[1] - s[1], len = Math.hypot(dx, dz) || 1, a = new THREE.Mesh(G.arrow, M.line);
    a.scale.set(1, 1, .6); a.rotation.y = Math.atan2(dx, dz); a.position.set(s[0] + dx / len * (.475 + stem), .025, s[1] + dz / len * (.475 + stem)); a.castShadow = true; statics.add(a);   // base on the ring's centre line, or on the end of the stem
    if (stem) { const bar = new THREE.Mesh(new THREE.BoxGeometry(ROUTE_W, ROUTE_H, stem), M.line); bar.rotation.y = a.rotation.y; bar.position.set(s[0] + dx / len * (.43 + stem / 2), .025, s[1] + dz / len * (.43 + stem / 2)); bar.castShadow = true; statics.add(bar); }
  }
  for (const p of m.pts) {   // `mark` is the dot or the goal disc, and it is the thing a tap hits
    const g = new THREE.Group(); let mark;
    if (p.goal == null) { mark = new THREE.Mesh(G.dot, M.line); mark.position.y = .025; mark.castShadow = true; g.add(mark);
      if ([0, 6, 21, 27].includes(p.k)) { const ring = new THREE.Mesh(G.entry, M.line); ring.rotation.x = Math.PI / 2; ring.position.y = .025; ring.castShadow = true; g.add(ring); } }
    else { mark = new THREE.Mesh(G.goalDisc, p.goal === 0 ? M.blue : M.red); mark.rotation.x = -Math.PI / 2; mark.position.y = .054; const rim = new THREE.Mesh(G.ring2, M.line); rim.rotation.x = Math.PI / 2; rim.position.y = .025; rim.castShadow = true; g.add(mark, rim); }
    g.position.set(p.x, 0, p.z); g.userData = { mark, plain: mark.material, goal: p.goal != null, side: p.goal }; mark.userData.pick = g.userData; statics.add(g); points.set(p.k, g); pickable.push(mark);
  }
  built = m.pts.length + ':' + m.slots.length + ':' + m.edges.length;
}

const images = new Map(), loader = new THREE.TextureLoader().setCrossOrigin('anonymous');
const still = url => loader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.userData.px = [t.image.width, t.image.height]; });   // px: drawn at its own size (FRAME px = one figure height)
const picture = url => images.get(url) || images.set(url, /\/anim\/.*\.webp$/.test(url) ? animated(url) : still(url)).get(url);
// An animated sprite (.webp): WebGL only ever uploads an animated image's first frame, and Safari has no ImageDecoder to get the rest.
// So the file is unpacked here: each ANMF frame (ALPH + VP8 at an offset) is rewrapped as a still WebP, which every browser decodes,
// and composed in order like a player would. Up to MAXF frames go on one atlas canvas that is uploaded once; playing it only moves the
// texture's window (offset): no drawing and no upload per frame. A longer sprite keeps only its small compressed frames and decodes each
// one just before it is due onto its own canvas (one small upload per frame), so every frame plays in little memory.
// If anything fails it shows the still first frame.
const FRAME = 160, GAP = 8, MAXF = 64, playing = [];   // FRAME: the px of a picture drawn as one figure height (tools/build_sprites.py SIZE); the clear gap keeps a frame's neighbours out of its mipmaps; MAXF: an 8x8 atlas, ~1344px, ~7 MB
const u24 = (d, i) => d[i] | d[i + 1] << 8 | d[i + 2] << 16;
function chunks(d, i, end) {   // RIFF chunks between i and end: { t: fourcc, i: start, n: payload size }
  const out = [];
  for (; i + 8 <= end; ) { const n = (u24(d, i + 4) | d[i + 7] << 24) >>> 0; out.push({ t: String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]), i, n }); i += 8 + n + (n & 1); }
  return out;
}
function stillWebp(d, parts, w, h) {   // RIFF WEBP [+ VP8X with the alpha flag when there is an ALPH chunk] + the frame's own chunks
  const body = parts.map(c => d.subarray(c.i, c.i + 8 + c.n + (c.n & 1)));
  if (parts.some(c => c.t === 'ALPH')) { const x = new Uint8Array(18); x.set([86, 80, 56, 88, 10, 0, 0, 0, 16]); x.set([w - 1, w - 1 >> 8, w - 1 >> 16, h - 1, h - 1 >> 8, h - 1 >> 16], 12); body.unshift(x); }
  const size = body.reduce((s, b) => s + b.length, 4), head = new Uint8Array(12); head.set([82, 73, 70, 70, size, size >> 8, size >> 16, size >> 24, 87, 69, 66, 80]);
  return new Blob([head, ...body], { type: 'image/webp' });
}
function frameOf(d, f) {   // an ANMF chunk: where it goes, how it is laid over the last one, how long it shows, and its still picture
  const p = f.i + 8, w = u24(d, p + 6) + 1, h = u24(d, p + 9) + 1;
  return { x: u24(d, p) * 2, y: u24(d, p + 3) * 2, w, h, flags: d[p + 15], ms: Math.max(20, u24(d, p + 12) || 50), webp: stillWebp(d, chunks(d, p + 16, p + f.n), w, h) };
}
function compose(a, k, bmp) {   // lay frame k over the picture so far, as the WebP rules say
  const f = a.frames[k], g = a.g;
  if (k === 0) g.clearRect(0, 0, a.work.width, a.work.height); else if (a.prev) g.clearRect(...a.prev);   // a new loop / the previous frame asked to be disposed
  if (f.flags & 2) g.clearRect(f.x, f.y, f.w, f.h);   // no blending: the frame replaces what is under it
  g.drawImage(bmp, f.x, f.y); bmp.close?.(); a.prev = f.flags & 1 ? [f.x, f.y, f.w, f.h] : null;
}
function animated(url) {
  const t = new THREE.CanvasTexture(document.createElement('canvas')); t.colorSpace = THREE.SRGBColorSpace;   // clear until the frames are ready
  (async () => {
    const d = new Uint8Array(await (await fetch(url)).arrayBuffer()), top = chunks(d, 12, d.length), x = top.find(c => c.t === 'VP8X');
    const work = document.createElement('canvas'); work.width = u24(d, x.i + 12) + 1; work.height = u24(d, x.i + 15) + 1;
    const a = { t, work, g: work.getContext('2d'), frames: top.filter(c => c.t === 'ANMF').map(f => frameOf(d, f)), prev: null, k: -1, due: 0 }, n = a.frames.length;
    if (n > MAXF) {   // too long for an atlas: the texture is the composed picture itself, and the next frame decodes while this one shows
      a.next = await createImageBitmap(a.frames[0].webp); t.image = work;
    } else {
      const fw = work.width, fh = work.height, cols = Math.ceil(Math.sqrt(n)), cw = fw + GAP, ch = fh + GAP, atlas = document.createElement('canvas'); atlas.width = cols * cw; atlas.height = Math.ceil(n / cols) * ch;
      const ag = atlas.getContext('2d');
      for (let k = 0; k < n; k++) {
        compose(a, k, await createImageBitmap(a.frames[k].webp));
        const cx = k % cols * cw, cy = (k / cols | 0) * ch; ag.drawImage(work, cx, cy);
        Object.assign(a.frames[k], { u: cx / atlas.width, v: 1 - (cy + fh) / atlas.height, webp: null });
      }
      a.g = null; t.image = atlas; t.repeat.set(fw / atlas.width, fh / atlas.height);
    }
    t.userData.ink = null; t.userData.px = [work.width, work.height]; t.dispose(); t.needsUpdate = true;   // dispose: a GL texture cannot change size
    playing.push(a); step(a, performance.now());
  })().catch(() => new THREE.ImageLoader().setCrossOrigin('anonymous').load(url, img => { t.image = img; t.userData.px = [img.width, img.height]; t.dispose(); t.needsUpdate = true; }));
  return t;
}
function step(a, now) {   // the next frame, once the current one has had its time
  if (a.k >= 0 && now < a.due) return;
  if (a.g) {   // streamed: show the decoded frame and start decoding the one after (if it is not ready yet, this frame simply stays)
    if (!a.next) return;
    a.k = (a.k + 1) % a.frames.length; compose(a, a.k, a.next); a.next = null; a.t.needsUpdate = true;
    createImageBitmap(a.frames[(a.k + 1) % a.frames.length].webp).then(b => { a.next = b; });
  } else { a.k = (a.k + 1) % a.frames.length; a.t.offset.set(a.frames[a.k].u, a.frames[a.k].v); }
  a.due = now + a.frames[a.k].ms;
}
const TAG_S = 1;
function mpColors(mpd) {
  const light = new THREE.Color(css('--bd', '#0c0d10')).getHSL({}).l > .5;
  const face = css('--bd-pt', light ? '#fbfaf6' : '#101216'), ink = mpd < 0 ? '#ff6b7a' : mpd > 0 ? '#39d98a' : css('--bd-line', light ? '#3c4048' : '#c9ced8');
  return { face, ink };
}
function label(text, mpd) {   // MP puck top: face colour, ring/digit in route colour (or red/green when MP changed)
  return tex(96, 96, (g) => {
    if (text === '') return;
    const { face, ink } = mpColors(mpd);
    g.fillStyle = face; g.beginPath(); g.arc(48, 48, 47, 0, 7); g.fill();
    g.lineWidth = 8; g.strokeStyle = g.fillStyle = ink; g.beginPath(); g.arc(48, 48, 40, 0, 7); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 52px Segoe UI, sans-serif'; g.fillText(text, 48, 52);
  });
}
const MEGA_OFF = TAG_R * .85 * Math.SQRT2, MEGA_AT = 70 * Math.PI / 180;   // the Mega counter on the MP marker’s rim: this far out, 70° round from screen-right
const CAM_R = new THREE.Vector3(), CAM_U = new THREE.Vector3(), CAM_F = new THREE.Vector3(), TAG_AT = new THREE.Vector3();
function megaLabel(n) {   // the Mega counter's face: blue, a white ring and the turns left in white
  return tex(96, 96, g => { g.fillStyle = '#1d5fd6'; g.beginPath(); g.arc(48, 48, 47, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.beginPath(); g.arc(48, 48, 40, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 52px Segoe UI, sans-serif'; g.fillText(String(n), 48, 52); });
}
function paintTag(u, text, mpd) {   // swap the digit sprite; dispose the previous map so a count-up does not leak
  const empty = text === '' || text == null; u.hasMp = !empty; if (empty) { u.tag.visible = false; return; }
  const { face } = mpColors(mpd); u.tagSide.color.set(face);
  const old = u.tagFace.material.map; u.tagFace.material.map = label(text, mpd); u.tagFace.material.needsUpdate = true; if (old) old.dispose();
}
function faceTag(u) { u.tagBody.quaternion.copy(camera.quaternion); }   // tip only the 3D body; the sprite face is not under that rotation so it stays screen-upright
function around(text, ink) {   // the state names, written on top of the status ring (R=200 matches WORDS_PLANE → world radius AURA_MID)
  return tex(512, 512, (g) => { g.translate(256, 256); g.font = '700 40px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
    const R = 200, unit = text.toUpperCase() + '  •  ', n = Math.max(1, Math.floor(2 * Math.PI * R / g.measureText(unit).width));
    for (let k = 0; k < n; k++) { let a = k * 2 * Math.PI / n; for (const ch of unit) { const w = g.measureText(ch).width / R; a += w / 2; g.save(); g.rotate(a); g.translate(0, -R); g.fillText(ch, 0, 0); g.restore(); a += w / 2; } } });
}
const shadeTex = tex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
function paintEvoMap() {   // same inverted primary look as the app's ink buttons, so it follows light/dark
  return tex(256, 80, (g, w, h) => {
    const face = css('--ink', '#111'), edge = css('--line', face), ink = css('--bg', '#fff');
    g.fillStyle = face; g.beginPath(); g.rect(6, 10, w - 12, h - 20); g.fill();
    g.lineWidth = 6; g.strokeStyle = edge; g.stroke();
    g.fillStyle = ink; g.font = '800 42px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EVOLVE', w / 2, h / 2 + 1);
  });
}
let evoMap = paintEvoMap();
const shadeGeo = new THREE.PlaneGeometry(.62, .62);
function token(t) {
  const base = new THREE.Mesh(G.base, mat(BLUE, 0)), cap = new THREE.Mesh(G.cap, M.cap), ring = new THREE.Mesh(G.ring, mat(GOLD, 0xa07800)), aura = new THREE.Mesh(G.aura, mat(0xcbd5e1, 0, { transparent: true, opacity: .85 }));
  const art = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: .05, depthTest: false })), words = new THREE.Mesh(G.words, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  const tagSide = mat(0x101216, 0, { roughness: .4 });
  const tagBody = new THREE.Mesh(G.tagBody, tagSide); tagBody.castShadow = true;   // 3D puck thickness (tipped to face the camera)
  const tagFace = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, alphaTest: .05 }));   // digit: sprite, not rotated with the body
  tagFace.scale.set(TAG_R * 2.05, TAG_R * 2.05, 1);
  const tag = new THREE.Group(); tag.add(tagBody, tagFace); tag.position.set(Math.SQRT1_2 * (BASE_R + TAG_R), TAG_R, Math.SQRT1_2 * (BASE_R + TAG_R));   // group only moves/scales — never rolls. Re-placed every frame at the base's bottom-right as seen by the camera (TAG_AT)
  base.position.y = BASE_H / 2; base.castShadow = true; cap.position.y = BASE_H - .002; cap.castShadow = true;   // lid sinks a hair into the cylinder top so the shared rim is seamless
  ring.rotation.x = Math.PI / 2; ring.position.y = .05; aura.rotation.x = Math.PI / 2; aura.position.y = AURA_H / 2; aura.castShadow = true;
  art.center.set(.5, 0); art.position.y = .04; art.scale.set(1.05, 1.05, 1); art.renderOrder = 1;
  tagBody.renderOrder = 2; tagFace.renderOrder = 3;
  words.rotation.x = -Math.PI / 2; words.position.y = AURA_H + .002; words.renderOrder = 3;   // status text lies on the top face of the aura ring
  const shade = new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.y = BASE_H + CAP_H - .002;
  // the Mega counter (FigureMEGA, mega_guide_blue): the turns until a Mega turns back, on a small blue puck attached to the MP marker's
  // top-right edge (placed each frame along the camera's right and up); blue on both sides, the number white
  const megaBody = new THREE.Mesh(G.tagBody, mat(0x1d5fd6, 0, { roughness: .4 })), megaFace = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, alphaTest: .05 }));
  megaFace.scale.set(TAG_R * 2.05, TAG_R * 2.05, 1); const mega = new THREE.Group(); mega.add(megaBody, megaFace); mega.scale.setScalar(.6); mega.visible = false;
  const g = new THREE.Group(); g.add(base, cap, shade, ring, aura, words, art, tag, mega); g.position.set(t.x, 0, t.z); g.userData = { base, cap, shade, ring, art, tag, tagBody, tagFace, tagSide, mega, megaBody, megaFace, aura, words, fig: t.i };
  for (const m of [base, art, tagBody, tagFace]) { m.userData.pick = g.userData; pickable.push(m); }   // the stand, the picture and the MP puck: what a tap hits
  scene.add(g); tokens.set(t.i, g);
  return g;
}

// The original's table objects: each player's fanned stack of plates (cards 0.96 x 1.404, PlateObject 160 x 234 at scale 0.006) with the two
// corner markers of its table button, and the AI / End Turn / Z-Move button (collider 3 x 0.3 x 1; body and rim are its two meshes' sizes).
const extras = new THREE.Group(); scene.add(extras); let extrasKey = '';
const words = (text, w, h, ink, px) => tex(w, h, g => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.font = `900 ${px}px Segoe UI, sans-serif`; let s = 1; const tw = g.measureText(text).width; if (tw > w * .94) s = w * .94 / tw; g.translate(w / 2, h / 2); g.scale(s, s); g.fillText(text, 0, 0); });
// A plate card: a rounded slab 0.96 x 1.404 and 0.02 thick (the fan's own step, so the stack reads as a deck). Its face is painted here:
// a rarity band down the edge that shows in the fan, and on the top card a frame, the rarity, the name and the cost.
const cardGeo = (() => { const w = .48, h = .702, r = .0001, s = new THREE.Shape(); s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false); s.lineTo(w, h - r); s.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w + r, h); s.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false); s.lineTo(-w, -h + r); s.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false); return new THREE.ExtrudeGeometry(s, { depth: .02, bevelEnabled: false, curveSegments: 6 }); })();
const RARE = ['#8a8f98', '#8a8f98', '#2e9e5b', '#2f7fe0', '#d9a514', '#c0392b'], RARE_NAME = ['', 'C', 'UC', 'R', 'EX', 'UX'], faces = new Map();
function face(c, top) {
  const pt = css('--bd-pt', '#101216'), line = css('--bd-line', '#c9ced8'), key = [c.n, c.r, c.c, c.used, top, pt, line].join('|'); if (faces.has(key)) return faces.get(key);
  const t = tex(320, 468, (g, w, h) => {
    g.fillStyle = pt; g.fillRect(0, 0, w, h); const sheen = g.createLinearGradient(0, 0, w, h); sheen.addColorStop(0, 'rgba(255,255,255,.14)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = sheen; g.fillRect(0, 0, w, h);
    g.fillStyle = RARE[c.r] || RARE[1]; g.fillRect(0, 0, 30, h);
    if (top) { g.strokeStyle = line; g.globalAlpha = .55; g.lineWidth = 3; g.beginPath(); g.rect(48, 20, w - 68, h - 40); g.stroke(); g.globalAlpha = 1;
      g.font = '800 26px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; const rn = RARE_NAME[c.r] || ''; if (rn) { g.fillStyle = RARE[c.r]; g.beginPath(); g.rect(w - 96, 38, 60, 36); g.fill(); g.fillStyle = '#fff'; g.fillText(rn, w - 66, 57); }
      g.fillStyle = line; g.font = '800 36px Segoe UI, sans-serif'; const words = c.n.split(' '), lines = []; for (const x of words) { const l = lines[lines.length - 1]; if (l && g.measureText(l + ' ' + x).width < w - 96) lines[lines.length - 1] = l + ' ' + x; else lines.push(x); }
      lines.slice(0, 4).forEach((l, n) => g.fillText(l, (w + 30) / 2, h * .46 + (n - (Math.min(lines.length, 4) - 1) / 2) * 44, w - 90));
      g.fillStyle = css('--gold', '#ffd23f'); for (let n = 0; n < c.c; n++) { g.beginPath(); g.arc(78 + n * 36, h - 58, 13, 0, 7); g.fill(); } }
    if (c.used) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, w, h); }
  });
  t.repeat.set(1 / .96, 1 / 1.404); t.offset.set(.5, .5); faces.set(key, t); return t;   // the slab's face coordinates are its own x and y, centred
}
function drawTable(t) {
  const key = JSON.stringify(t); if (key === extrasKey) return; extrasKey = key;
  const shared = new Set(Object.values(M));
  for (const o of extras.children) {   // free what was built for the last table (cardGeo and the M materials are shared); without this the GPU fills up turn by turn
    const i = pickable.indexOf(o); if (i >= 0) pickable.splice(i, 1);
    if (o.geometry !== cardGeo) o.geometry.dispose();
    for (const m of [].concat(o.material)) if (!shared.has(m)) { if (m.map) m.map.dispose(); m.dispose(); }
  }
  extras.clear();
  const flat = (w, d, y, material) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material); p.rotation.x = -Math.PI / 2; p.position.y = y; return p; }, hit = (w, h, d, x, z, act) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.unseen); b.position.set(x, h / 2, z); b.userData.pick = { act }; extras.add(b); pickable.push(b); };
  for (const k of t.stacks) {
    k.cards.forEach((c, i) => { const card = new THREE.Mesh(cardGeo, [new THREE.MeshStandardMaterial({ map: face(c, !i), roughness: .55 }), M.edge]);   // a real card: rounded, with thickness, a printed face and a pale cut edge
      card.rotation.x = -Math.PI / 2; if (k.s < 0) card.rotation.z = Math.PI; card.position.set(c.x, c.y - .02, k.z); card.castShadow = card.receiveShadow = true; extras.add(card); });
    if (k.mark) k.mark.forEach(([x, z]) => { const dx = Math.sign(k.x - x) * .3, dz = Math.sign(k.z - z) * .3; for (const [w, dd, ox, oz] of [[.3, .05, dx / 2, 0], [.05, .3, 0, dz / 2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, .03, dd), M.mv); b.position.set(x + ox, .12, z + oz); extras.add(b); } });
    hit(1.8, .4, 1.5, k.x, k.z, k.act);
  }
  if (!t.btn.label) return;   // a same-screen game has no AI face, and nothing to press until End Turn or a Z-Move
  // the button, drawn like the board: a small rounded slab outlined in the route colour, filled with it when it can be pressed (sizes are its frame and body meshes)
  const slab = (w, d, r, h, material) => { const x = w / 2, y = d / 2, sh = new THREE.Shape(); sh.moveTo(-x + r, -y); sh.lineTo(x - r, -y); sh.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false); sh.lineTo(x, y - r); sh.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
    sh.lineTo(-x + r, y); sh.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false); sh.lineTo(-x, -y + r); sh.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 8 }), material); m.rotation.x = -Math.PI / 2; m.position.set(t.btn.x, 0, t.btn.z); return m; };
  const rim = slab(2, .6, .0001, .06, M.line), well = slab(1.9, .5, .0001, .07, M.pt), body = slab(1.76, .4, .0001, t.btn.on ? .12 : .075, t.btn.on ? M.line : M.pt); rim.castShadow = body.castShadow = true;
  const name = flat(1.6, .28, t.btn.on ? .125 : .08, new THREE.MeshBasicMaterial({ map: words(t.btn.label.toUpperCase(), 400, 70, css(t.btn.on ? '--bd' : '--bd-line', '#888'), 46), transparent: true, opacity: t.btn.on ? 1 : .45 })); name.position.x = t.btn.x; name.position.z = t.btn.z;
  extras.add(rim, well, body, name); hit(2, .3, .6, t.btn.x, t.btn.z, 'main');
}
// The opening (MatchMain.StartFigureAnim + FigureAction): every figure comes onto its bench from (-7.5, 0, 16) less its bench point (the
// opponent's mirrored; x is mirrored on this board), two at a time 0.2 s apart in figure order, along the original's Bezier for that path
// (FigureAction.GetMoveType: a box cast of 0.1 against the 0.5 spheres of points that hold a figure; one near the bench makes it rise over
// the bench and drop on, else a low arc) in 0.3 s + distance / 50, landing with Se011. Hidden until its turn, as the original keeps it inactive.
const segDist = (q, a, b) => { const ab = b.clone().sub(a), k = Math.max(0, Math.min(1, q.clone().sub(a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, k).distanceTo(q); };
function bezier(pts, k, out) {   // MyMath.BezierCurve: Bernstein form over every control point
  const n = pts.length - 1; out.set(0, 0, 0); let c = 1;
  for (let i = 0; i <= n; i++) { out.addScaledVector(pts[i], c * Math.pow(1 - k, n - i) * Math.pow(k, i)); c = c * (n - i) / (i + 1); }
  return out;
}
function dropIn(toks) {
  for (const g of points.values()) if (g.userData.goal) g.userData.plain = g.userData.side === 0 ? M.blue : M.red;   // a new duel: both goals their own colour again (goal() may have swapped one)
  const V = (x, z, y = 0) => new THREE.Vector3(x, y, z), at = toks.map(t => V(t.x, t.z));
  [...toks].sort((a, b) => a.i - b.i).forEach((t, n) => {
    const g = tokens.get(t.i), B = V(t.x, t.z), S = t.team ? V(-7.5 - t.x, -16 - t.z) : V(7.5 - t.x, 16 - t.z), mid = S.clone().lerp(B, .5);
    let any = false, nearS = false, nearB = false;
    for (const q of at) { const d1 = q.distanceTo(S), d2 = q.distanceTo(B); if (d1 < .2 || d2 < .2 || segDist(q, S, B) > .6) continue; any = true; nearS ||= d1 < 1.7; nearB ||= d2 < 1.7; }
    const pts = nearS === nearB ? (nearS || any ? [S, V(S.x, S.z, 2), V(mid.x, mid.z, 4), V(B.x, B.z, 2), B] : [S, V(mid.x, mid.z, 1), B])   // FromUpToUp / Liner
      : nearS ? [S, V(S.x, S.z, 3), B] : [S, V(B.x, B.z, 3), B];   // FromUp / ToUp
    g.visible = false; g.position.copy(S); g.userData.hop = null; g.userData.drop = { pts, t: -(.5 + .2 * (n >> 1)), dur: .3 + S.distanceTo(B) / 50 };
  });
}
// A goal (MatchMain.GameSet / GoalProduction, Stage.GoalCalc, MatchCamera.GoolCamera). Once the figure has landed: Se212 and the goal that
// fell bursts (homepoint_red_dead / _blue_dead at (0, 0, -3) / (0, 0, 3)) and its disc turns the winner's colour. When the near side scored,
// the camera has already cut (as the figure came within 0.5 of the goal, so it slides on in the shot; an instant cut, no pan) for 3 s to the goal shot (rig dolly (0, 0, -.4), rotY 165, rotX 52, zoom (.7, 4.5, 1.3), camera (89.21, 0, 180),
// fov 60; x mirrored on this board) and then back. Resolves when it is over, so the result can follow.
// ponytail: the burst is drawn here (the original's textures are not copied): its two flashes, two dust rings and spark spray on the original's
// lifetimes, counts, size curves and colour keys, with sizes picked for this table; read the prefab's mesh scales if they need matching.
const BURST = { red: { flash: [0xff6f00, 0xffffff, 0xeaaa00, 0x474203], ring: [0xffb900, 0xffffff, 0x943a00], spark: [0xff8400, 0xffffff, 0xffe300], life: 3 },
  blue: { flash: [0x5d00ff, 0xffffff, 0x0089ea, 0x031247], ring: [0x00b5ff, 0xffffff, 0x0089ea], spark: [0x00b5ff, 0xffffff, 0x00f4ff], life: 2 } };
const glowTex = tex(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
const bursts = [], CC = new THREE.Color();
const keys = (list, k) => { const f = Math.min(.999, Math.max(0, k)) * (list.length - 1), i = Math.floor(f); return CC.setHex(list[i]).lerp(new THREE.Color(list[i + 1]), f - i); };   // a colour key list, evenly spread
const curve = (pts, k) => { for (let i = 1; i < pts.length; i++) if (k <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * (k - a) / (b - a); } return pts[pts.length - 1][1]; };
function burst(at, pal) {
  const grp = new THREE.Group(), parts = []; grp.position.copy(at); scene.add(grp);
  const glow = () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); s.renderOrder = 60; grp.add(s); return s; };
  for (const [life, from, size] of [[.85, .47, 3.4], [.35, .3, 5]]) {   // main_flash01 / 02: one glow each, growing from `from` to full
    const s = glow(); parts.push({ o: s, life, at: 0, fn: k => { s.scale.setScalar(size * (from + (1 - from) * k)); s.material.color.copy(keys(pal.flash, k)); s.material.opacity = 1 - k; } });
  }
  for (const life of [1.25, 1]) {   // flash_ring_dust1 / 2: a ring on the table, size 1.3 by its curve, turning 45° between 0.45 and 0.56 of its life
    const r = new THREE.Mesh(new THREE.RingGeometry(.4, .5, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.renderOrder = 59; grp.add(r);
    parts.push({ o: r, life, at: 0, fn: k => { r.scale.setScalar(1.3 * 2 * curve([[0, .43], [.1, .7], [.55, .7], [.58, 1], [.6, .85], [1, .85]], k)); r.rotation.z = .785 * Math.min(1, Math.max(0, (k - .45) / .11)); r.material.color.copy(keys(pal.ring, k)); r.material.opacity = 1 - k * k; } });
  }
  for (let i = 0; i < 40; i++) {   // sud_flash01: 40 sparks thrown up and out in an 80° cone from a 0.3 circle, at up to 0.5 / s, growing as they fade
    const s = glow(), a = Math.random() * Math.PI * 2, tilt = Math.random() * 80 * Math.PI / 180, sp = Math.random() * .5, size = Math.random() * .35, life = Math.random() * pal.life, delay = .03;
    const v = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).multiplyScalar(sp), o = new THREE.Vector3(Math.cos(a) * .3, 0, Math.sin(a) * .3);
    parts.push({ o: s, life, at: delay, fn: (k, t) => { s.position.copy(o).addScaledVector(v, t).y += .1; s.scale.setScalar(size * 2 * curve([[0, .13], [.09, .72], [1, 1]], k)); s.material.color.copy(keys(pal.spark, k)); s.material.opacity = 1 - k; } });
  }
  for (const p of parts) p.o.visible = false;
  bursts.push({ grp, parts, t: 0 });
}
function stepBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt; let live = false;
    for (const p of b.parts) { const t = b.t - p.at, k = t / p.life; p.o.visible = k >= 0 && k < 1; if (p.o.visible) { p.fn(k, t); live = true; } else if (k < 0) live = true; }
    if (!live) { scene.remove(b.grp); b.grp.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); bursts.splice(i, 1); }
  }
}
let goalShown = false;   // GoalCloseMpView: once a goal is under way no MP marker shows (until the next duel)
function goal(near) {   // near: the near side (blue) scored on the far goal
  goalShown = false;
  const far = [...points.values()].find(g => g.userData.goal && g.userData.side === 1), moving = () => [...tokens.values()].filter(g => g.userData.hop || g.userData.drop);
  const cut = () => {   // GoolCamera: the shot, and back after 3 s
    const keep = { pos: camera.position.clone(), at: controls.target.clone(), up: camera.up.clone(), fov: camera.fov, on: controls.enabled };
    controls.enabled = false; camera.fov = 60; camera.up.set(.162, .779, .605); camera.position.set(-.449, 1.746, -4.779); camera.lookAt(.113, 0, -2.681); camera.updateProjectionMatrix();
    return new Promise(back => setTimeout(() => { camera.fov = keep.fov; camera.up.copy(keep.up); camera.position.copy(keep.pos); controls.target.copy(keep.at); controls.enabled = keep.on; camera.updateProjectionMatrix(); controls.update(); back(); }, 3000));
  };
  const landed = () => new Promise(go => { const w = () => moving().length ? setTimeout(w, 30) : go(); w(); });   // GameSet waits for the figure to land
  const fall = () => {   // GameSet / GoalProduction: Se212, the burst, and GoalCalc (the fallen goal takes the winner's colour; the other its own)
    for (const g of points.values()) if (g.userData.goal) { const u = g.userData; u.plain = u.side === (near ? 1 : 0) ? (near ? M.blue : M.red) : u.side === 0 ? M.blue : M.red; u.mark.material = u.plain; }
    goalShown = true; window.sfx?.('goal'); burst(new THREE.Vector3(0, .06, near ? -3 : 3), BURST[near ? 'red' : 'blue']);
  };
  if (!near) { goalShown = true; return landed().then(fall); }   // their goal: the duel is over, no marker comes back as the figure lands
  // FigureAction: GoolAction fires as the scoring figure comes within 0.5 of the goal, so the shot opens with it still sliding on
  const close = () => new Promise(go => { const w = () => { const g = moving(); if (!g.length || !far || g.some(x => x.position.distanceTo(far.position) < .5)) go(); else setTimeout(w, 16); }; w(); });
  return close().then(() => { goalShown = true; const back = cut(); return landed().then(fall).then(() => back); });
}
function newDuel() {   // a new duel is starting: the last one's figures leave the table (the opening drops the new ones), goals their own colours
  goalShown = false;
  for (const g of tokens.values()) { g.visible = false; g.userData.hop = null; }
  for (const g of points.values()) if (g.userData.goal) { const u = g.userData; u.plain = u.side === 0 ? M.blue : M.red; u.mark.material = u.plain; }
  for (const b of bursts.splice(0)) scene.remove(b.grp);
}
function draw(m) {
  if (m.table) drawTable(m.table);
  const cam = JSON.stringify(m.cam) !== JSON.stringify(last && last.cam); last = m; if (built !== m.pts.length + ':' + m.slots.length + ':' + m.edges.length) build(m); if (cam && !fight) home();   // the battle stage keeps its own camera
  for (const p of m.pts) { const u = points.get(p.k).userData; u.pt = p.p; u.mv = !!p.mv; u.mark.material = p.mv ? M.mv : u.plain; u.mark.scale.setScalar(p.mv && !u.goal ? 1.6 : 1); }
  const seen = new Set();
  for (const t of m.toks) {
    const g = tokens.get(t.i) || token(t), u = g.userData; seen.add(t.i);
    u.to = new THREE.Vector3(t.x, 0, t.z);
    if (t.moveId != null && t.path && u.moveId !== t.moveId) {   // hop / long-jump along landings (segs.leap = path went through an occupied point)
      u.moveId = t.moveId;
      const pts = t.path.map(q => new THREE.Vector3(q[0], 0, q[1]));
      const segs = (t.segs && t.segs.length === pts.length - 1) ? t.segs.map(s => ({ dur: s.dur || STEP, leap: !!s.leap }))
        : pts.slice(0, -1).map(() => ({ dur: STEP, leap: false }));
      u.hop = { pts, segs, t: 0, i: 0 };
    }
    u.base.material.color.setHex(t.team ? RED : BLUE); u.base.material.emissive.setHex(t.team ? 0x3a060c : 0x08224f);
    u.ring.visible = t.sel || t.atk; u.ring.material = t.atk ? M.red : M.mv; u.art.material.opacity = u.evoBlast ? 0 : (t.dim ? .5 : 1); const hue = AURA[t.status] || (t.status ? 0xffffff : 0xcbd5e1), dark = ((hue >> 16) * 299 + (hue >> 8 & 255) * 587 + (hue & 255) * 114) / 1000 > 140;   // text goes on the ring, dark on light rings and white on dark ones
    u.aura.visible = !!(t.status || t.badge); u.aura.material.color.setHex(hue);
    if (AURA[t.status]) u.art.material.color.setHex(0xffffff).lerp(TINT.setHex(AURA[t.status]), .5); else u.art.material.color.setHex(t.wait ? 0x8a93a8 : 0xffffff);
    if (u.img !== t.img) { u.img = t.img; u.art.material.map = t.img ? picture(t.img) : tex(128, 128, (c) => { c.fillStyle = '#fff'; c.font = '700 22px Segoe UI, sans-serif'; c.textAlign = 'center'; c.fillText(t.name.slice(0, 9), 64, 70); }); u.art.material.needsUpdate = true; }
    u.words.visible = !!t.badge; if (t.badge && u.badge !== t.badge + dark) { u.badge = t.badge + dark; u.words.material.map = around(t.badge, dark ? '#05070f' : '#fff'); u.words.material.needsUpdate = true; }
    if (u.megaN !== (t.mega || 0)) { u.megaN = t.mega || 0; const old = u.megaFace.material.map; u.megaFace.material.map = u.megaN ? megaLabel(u.megaN) : null; u.megaFace.material.needsUpdate = true; if (old) old.dispose(); }
    const key = t.mp + '|' + t.mpd;
    if (u.key !== key) {   // MP change: count the badge from the old number to the new one (same idea as the battle damage roll)
      const to = t.mp === '' || t.mp == null ? null : +t.mp, from = u.mpShown, step = to != null && from != null && Number.isFinite(from) && Number.isFinite(to) && from !== to;
      u.key = key; u.mpd = t.mpd;
      if (step) u.mpAnim = { from, to, mpd: t.mpd, t: 0, dur: .12 + .1 * Math.min(4, Math.abs(to - from)) };   // longer when the gap is bigger
      else { u.mpAnim = null; u.mpShown = to; paintTag(u, t.mp, t.mpd); u.tag.scale.setScalar(TAG_S); }
    }
    if (t.evo) {   // the Evolve button, a billboard just above the figure
      if (!u.evo) { u.evo = new THREE.Sprite(new THREE.SpriteMaterial({ map: evoMap, transparent: true, depthTest: false })); u.evo.center.set(.5, 0); u.evo.position.set(0, 1.22, 0); u.evo.scale.set(1.05, .34, 1); u.evo.renderOrder = 9; u.evo.userData.pick = { act: 'evo:' + t.i }; g.add(u.evo); pickable.push(u.evo); }
    } else if (u.evo) { g.remove(u.evo); const k = pickable.indexOf(u.evo); if (k >= 0) pickable.splice(k, 1); u.evo.material.dispose(); u.evo = null; }
  }
  for (const [i, g] of tokens) if (seen.has(i) && m.snap) g.position.copy(g.userData.to);
  if (m.intro) dropIn(m.toks);   // a new duel: the figures come onto the benches
  for (const [i, g] of tokens) if (!seen.has(i)) { scene.remove(g); tokens.delete(i); for (const m of [g.userData.base, g.userData.art, g.userData.tagBody, g.userData.tagFace, g.userData.evo]) { if (!m) continue; const k = pickable.indexOf(m); if (k >= 0) pickable.splice(k, 1); } }
}

// Camera: drag to orbit, wheel or pinch to zoom, no panning, kept above the table. Reset returns to the default view; Lock stops drags moving it.
const controls = new OrbitControls(camera, renderer.domElement); controls.enablePan = false; controls.minPolarAngle = Math.PI * .1; controls.maxPolarAngle = Math.PI * .42;
let moved = false; controls.addEventListener('start', () => { moved = true; });
const CAM_KEY = 'pokemonduelweb.cam'; let kept = null; try { let raw = localStorage.getItem(CAM_KEY); if (raw == null) { const old = localStorage.getItem('figureduel.cam'); if (old != null) { raw = old; localStorage.setItem(CAM_KEY, old); localStorage.removeItem('figureduel.cam'); } } kept = JSON.parse(raw); } catch (e) {}
if (!(kept && Array.isArray(kept.pos) && Array.isArray(kept.at))) kept = null;
function keepCamera() {   // called whenever the lock changes or a locked view is reset: store the view while locked, forget it when unlocked
  kept = controls.enabled ? null : { pos: camera.position.toArray(), at: controls.target.toArray() };
  try { kept ? localStorage.setItem(CAM_KEY, JSON.stringify(kept)) : localStorage.removeItem(CAM_KEY); } catch (e) {}
}
function home(reset) {   // reset = the Reset button: go to the default view even when a locked view is remembered.
  // the whole table, both benches included, from behind the near player; a model may bring its own camera: { pos, at, width } (width = how much of the scene must fit across)
  const d = Math.max(.92, .57 / camera.aspect) * 20.5,   // far enough for the table's depth (.92) or its width (.55 / aspect), whichever needs more, so a narrow screen is filled side to side
     c = last && last.cam, at = new THREE.Vector3(...(c ? c.at : [0, 0, 1.25])), pos = c ? new THREE.Vector3(...c.pos) : new THREE.Vector3(0, d * .84, d * .55 + 1.25)   // aimed a little towards the near side, where the plates and the button are;
  if (c) pos.lerpVectors(at, pos, Math.max(1, c.width / (2 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect) / pos.distanceTo(at)));
  const far = pos.distanceTo(at); controls.minDistance = far * .5; controls.maxDistance = far * 1.3; camera.position.copy(pos); controls.target.copy(at); controls.update(); moved = false;
  if (kept && !c && reset !== true) { camera.position.fromArray(kept.pos); controls.target.fromArray(kept.at); controls.update(); moved = true; }   // the remembered locked view (not in scenes that bring their own camera)
}
function fit() {
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); controls.rotateSpeed = Math.min(1, h / 600);   // orbit speed is per canvas height, so a short canvas would spin too fast
  if (!moved) home();
}
new ResizeObserver(fit).observe(host); fit();
host.style.position = 'relative';
// the camera buttons go in the page's menu when it has a place for them (id "camBar"), else in a corner of the table
const camBar = document.getElementById('camBar');
const camBtn = (id, name, body) => `<button id="${id}" class="iconbtn" title="${name}" aria-label="${name}">${window.icon(body)}</button>`;
const CAM_RESET = '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 5v5h5"/>', CAM_LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', CAM_OPEN = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.4-2"/>';
const camHtml = camBtn('camReset', 'Reset view', CAM_RESET) + camBtn('camLock', 'Lock view', CAM_LOCK);
if (camBar) {
  const grow = camBar.querySelector('.camGrow');
  if (grow) grow.insertAdjacentHTML('afterend', camHtml);   /* top-bar controls left; camera + fullscreen on the right */
  else camBar.insertAdjacentHTML('beforeend', camHtml);
} else host.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:0;bottom:0;display:flex;gap:1px;background:var(--line);border:1px solid var(--line);border-width:1px 1px 0 0">${camHtml}</div>`);
function paintLock() {   // the button shows the state: a closed, pressed lock while the view is locked, an open one while it is free
  const b = document.getElementById('camLock'), locked = !controls.enabled;
  b.title = locked ? 'View locked (click to unlock)' : 'View unlocked (click to lock)'; b.setAttribute('aria-label', 'Lock view'); b.setAttribute('aria-pressed', String(locked)); b.innerHTML = window.icon(locked ? CAM_LOCK : CAM_OPEN);
}
document.getElementById('camReset').onclick = () => { home(true); if (!controls.enabled) keepCamera(); };
document.getElementById('camLock').onclick = () => { controls.enabled = !controls.enabled; paintLock(); keepCamera(); };
if (kept) { controls.enabled = false; home(); }
paintLock();

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function spriteSolid(hit) {   // the clear margin of a picture is not part of the figure; only an opaque pixel is
  const map = hit.object.material && hit.object.material.map, img = map && map.image;
  if (!map || !hit.uv || !img || !img.width) return true;
  const uv = map.transformUv(hit.uv.clone());   // through the texture's window (an animated sprite's current frame in its atlas)
  let c = map.userData.ink; if (c == null && img.getContext) c = map.userData.ink = img;   // a canvas is read directly
  if (c == null) { c = document.createElement('canvas'); c.width = img.width; c.height = img.height; try { c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0); } catch (e) { c = false; } map.userData.ink = c; }
  if (!c) return true;
  try { const a = c.getContext('2d').getImageData(Math.min(c.width - 1, uv.x * c.width | 0), Math.min(c.height - 1, uv.y * c.height | 0), 1, 1).data[3]; return a > 13; }
  catch (e) { map.userData.ink = false; return true; }
}
function tapTarget(cx, cy) {   // the ray hits the picture, the stand, the badge or the node that is actually there
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set((cx - rect.left) / rect.width * 2 - 1, -(cy - rect.top) / rect.height * 2 + 1); ray.setFromCamera(mouse, camera);
  for (const h of ray.intersectObjects(pickable, false)) {
    const pick = h.object.userData.pick; if (!pick) continue;
    if (h.object.isSprite && !spriteSolid(h)) continue;
    if (pick.act) return { act: pick.act };
    if (pick.fig != null) return { fig: pick.fig };
    if (pick.pt != null) return pick.mv ? { pt: pick.pt } : null;
  }
  return null;
}
function chooseTap(cx, cy) {
  const t = tapTarget(cx, cy); if (!t) return;
  window.boardPick(t.fig != null ? t.fig : null, t.pt != null ? t.pt : null, t.act || null);
}
let downAt = null, holdTimer = 0;
const TAP = 12;   // a drag orbits the camera; a tap does not move
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button) return; downAt = { x: e.clientX, y: e.clientY, held: false }; clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {   // a held press opens the figure's detail (the original's long tap) and is not a move or an attack
    if (!downAt) return; const t = tapTarget(downAt.x, downAt.y);
    if (!t || t.fig == null || t.pt != null || t.act) return;
    downAt.held = true; if (window.boardDetail) window.boardDetail(t.fig);
  }, 480);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('pointermove', e => { if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > TAP) clearTimeout(holdTimer); });
window.addEventListener('pointercancel', () => { downAt = null; clearTimeout(holdTimer); });
window.addEventListener('pointerup', e => {
  if (!downAt) return; const d = downAt; downAt = null; clearTimeout(holdTimer);
  const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP;
  if (d.held && !moved) window.holdClick = true;   // the release after a hold must not also select, move or attack
  if (d.held || moved) return;
  chooseTap(e.clientX, e.clientY);
});

const clock = new THREE.Clock(), TILT = .3, STEP = .17;   // TILT: how far (radians) the camera must rise from the lowest side view before figures are fully centred on their bases   // seconds per hop, the same pace as the flat board
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), pulse = .6 + .4 * Math.sin(clock.elapsedTime * 5), now = performance.now();
  for (const p of playing) step(p, now);
  stepBursts(dt);
  // Seen from the side a figure stands on its base; seen from above a standing picture would hang off the far edge of the base, so as the
  // camera rises from the lowest side view the picture slides down, and after a slight tilt it sits centred on the base like a token.
  // It is lifted clear of the base as it centres, or the base would hide it.
  const rise = Math.min(1, Math.max(0, (controls.maxPolarAngle - controls.getPolarAngle()) / TILT)), lie = rise * rise * (3 - 2 * rise) * .45;
  // the MP marker sits at the base's bottom-right on screen whatever the camera's angle: the camera's right and down, laid flat on the table,
  // a puck's radius out from the rim (touching the stand, never cutting into it) and resting on the table
  CAM_R.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize(); CAM_U.setFromMatrixColumn(camera.matrixWorld, 1).setY(0).normalize().negate();
  TAG_AT.copy(CAM_R).add(CAM_U).normalize().multiplyScalar(BASE_R + TAG_R).setY(TAG_R);
  for (const g of tokens.values()) { const u = g.userData; u.tag.position.copy(TAG_AT); const px = u.art.material.map?.userData.px || [FRAME, FRAME]; u.art.scale.set(1.05 * px[0] / FRAME, 1.05 * px[1] / FRAME, 1); /* every picture at one scale */ u.art.center.y = lie; u.art.position.y = .04 + lie * .6 + (u.boostPop || 0); if (u.evoBlast) u.art.material.opacity = 0; if (u.aura.visible) u.aura.material.opacity = .6 + .3 * pulse; if (u.words.visible) u.words.rotation.z -= dt * .5;
    if (u.drop) {   // the opening drop onto the bench (dropIn)
      const d = u.drop; d.t += dt; g.visible = d.t >= 0;
      if (g.visible) { const k = Math.min(1, d.t / d.dur); bezier(d.pts, k, g.position); if (k >= 1) { u.drop = null; window.sfx?.('land'); } }
    }
    else if (u.hop) {
      const h = u.hop; h.t += dt;
      while (h.i < h.segs.length && h.t >= h.segs[h.i].dur) { h.t -= h.segs[h.i].dur; h.i++; }
      if (h.i >= h.segs.length) { g.position.copy(h.pts[h.pts.length - 1]); u.hop = null; }
      else { const s = h.segs[h.i], k = Math.min(1, h.t / s.dur); g.position.lerpVectors(h.pts[h.i], h.pts[h.i + 1], k); g.position.y = Math.sin(k * Math.PI) * (s.leap ? 1.15 : .45); }
    }
    else if (u.to) g.position.lerp(u.to, 1 - Math.pow(.001, dt)); if (u.ring.visible) u.ring.scale.setScalar(.95 + .08 * pulse);
    u.tag.visible = !!u.hasMp && !u.hop && !u.drop && !goalShown; u.mega.visible = u.megaN > 0 && !u.hop && !u.drop && !goalShown;
    if (u.mega.visible) { u.megaBody.quaternion.copy(camera.quaternion); u.mega.position.copy(u.tag.position).addScaledVector(CAM_R.setFromMatrixColumn(camera.matrixWorld, 0), MEGA_OFF * Math.cos(MEGA_AT)).addScaledVector(CAM_U.setFromMatrixColumn(camera.matrixWorld, 1), MEGA_OFF * Math.sin(MEGA_AT)).addScaledVector(CAM_F.setFromMatrixColumn(camera.matrixWorld, 2), .02); }   // the MP marker shows on a figure standing still that can move (no number in the P.C. or out of play); hidden while it moves
    if (u.tag.visible) faceTag(u);
    if (u.mpAnim) {   // roll the MP digit and pop the puck while it changes colour
      const a = u.mpAnim, k = Math.min(1, (a.t += dt) / a.dur), n = Math.round(a.from + (a.to - a.from) * k), pop = TAG_S * (1 + .28 * Math.sin(k * Math.PI));
      if (n !== u.mpShown) { u.mpShown = n; paintTag(u, String(n), a.mpd); }
      u.tag.scale.setScalar(pop);
      if (k >= 1) { u.mpAnim = null; u.mpShown = a.to; paintTag(u, String(a.to), a.mpd); u.tag.scale.setScalar(TAG_S); }
    }
  }
  stepBlasts(dt);
  stepAbilities(dt);
  stepPlates(dt);
  stepFieldSpins(dt);
  stepFight(dt);
  // Each figure is drawn whole, from the farthest to the nearest: its base, then its picture (which ignores depth, so its own base cannot
  // cut it off), then its MP badge. A nearer figure's base and picture therefore cover whatever stands behind them. The bases are marked
  // transparent only so that they take part in this ordering; they are fully opaque.
  const TAGW = new THREE.Vector3();
  [...tokens.values()].sort((p, q) => q.position.distanceToSquared(camera.position) - p.position.distanceToSquared(camera.position)).forEach((g, i) => {
    const u = g.userData, n = 5 * i; u.base.renderOrder = n + 1; u.cap.renderOrder = n + 2; u.shade.renderOrder = n + 3; u.art.renderOrder = n + 4; if (u.evo) u.evo.renderOrder = n + 7;
    // the MP badge sits on the front edge of the base: seen from behind (the goal shot, a turned camera) it is farther than the figure, so it goes
    // first and the base and picture cover it; seen from the front it goes last
    const behind = u.tag.getWorldPosition(TAGW).distanceToSquared(camera.position) > g.position.distanceToSquared(camera.position);
    u.tagBody.renderOrder = behind ? n + .3 : n + 5; u.tagFace.renderOrder = behind ? n + .4 : n + 5.4; u.megaBody.renderOrder = behind ? n + .5 : n + 5.6; u.megaFace.renderOrder = behind ? n + .6 : n + 6;   // the Mega counter over the MP marker's edge
  });
  M.mv.emissiveIntensity = pulse;
  renderer.render(scene, camera);
});

// Evolution blast: nested 3D spheres in the route-dot colour (--bd-line), so it matches the board marks in either theme.
const blastGeo = new THREE.SphereGeometry(1, 40, 28);
const blasts = [];
function endBlast(b) {
  if (b.dead) return; b.dead = true;
  if (b.g) b.g.userData.evoBlast = false;
  scene.remove(b.grp); b.core.material.dispose(); b.shell.material.dispose();
  if (!b.readyFired) { b.readyFired = true; b.markReady(); }
  b.finish();
}
function blast(i) {
  const g = tokens.get(i);
  if (!g) { const p = Promise.resolve(); return { ready: p, done: p, release() {} }; }
  const hue = new THREE.Color(css('--bd-line', '#c9ced8')), light = new THREE.Color(css('--bd', '#0c0d10')).getHSL({}).l > .5;
  const core = new THREE.Mesh(blastGeo, new THREE.MeshStandardMaterial({ color: hue, emissive: hue, emissiveIntensity: light ? .55 : 1.4, roughness: .35, metalness: .12, transparent: true, depthTest: false, depthWrite: false }));
  const shell = new THREE.Mesh(blastGeo, new THREE.MeshStandardMaterial({ color: hue, emissive: hue, emissiveIntensity: light ? .25 : .7, roughness: .45, metalness: .05, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
  const lightPt = new THREE.PointLight(hue.getHex(), 0, 2.4);
  core.renderOrder = shell.renderOrder = 20000;
  const grp = new THREE.Group(); grp.add(shell, core, lightPt); grp.position.copy(g.position); grp.position.y += .5; scene.add(grp);
  g.userData.evoBlast = true; g.userData.art.material.opacity = 0;
  const b = { g, grp, core, shell, light: lightPt, phase: 'grow', t: 0, dead: false, readyFired: false };
  b.ready = new Promise(r => { b.markReady = r; }); b.done = new Promise(r => { b.finish = r; });
  b.release = () => { if (!b.dead && b.phase !== 'fade') { b.wantFade = true; if (b.phase === 'hold') { b.phase = 'fade'; b.t = 0; } } };
  blasts.push(b);
  return { ready: b.ready, done: b.done, release: () => b.release() };
}
function stepBlasts(dt) {
  for (let n = blasts.length - 1; n >= 0; n--) {
    const b = blasts[n]; b.t += dt;
    b.grp.position.copy(b.g.position); b.grp.position.y += .5; b.grp.rotation.y += dt * 1.8;
    if (b.phase === 'grow') {
      const k = Math.min(1, b.t / .42), e = 1 - Math.pow(1 - k, 3), o = Math.min(1, k * 1.5);
      b.core.scale.setScalar(.05 + e * .37); b.shell.scale.setScalar(.08 + e * .52);
      b.core.material.opacity = o; b.shell.material.opacity = o * .42; b.light.intensity = o * 2.4;
      if (k >= 1) { b.phase = b.wantFade ? 'fade' : 'hold'; b.t = 0; if (!b.readyFired) { b.readyFired = true; b.markReady(); } }
    } else if (b.phase === 'hold') {
      b.core.scale.setScalar(.42 + Math.sin(b.t * 9) * .012); b.shell.scale.setScalar(.6);
      b.core.material.opacity = 1; b.shell.material.opacity = .42; b.light.intensity = 2.4;
      if (b.t > 2.8) { b.phase = 'fade'; b.t = 0; }
    } else {
      const k = Math.min(1, b.t / .55), e = k * k, o = 1 - e;
      if (b.g.userData.evoBlast) { b.g.userData.evoBlast = false; b.g.userData.art.material.opacity = 1; }   // the new figure is there as the sphere thins
      b.core.scale.setScalar(.42 + e * .18); b.shell.scale.setScalar(.6 + e * .28);
      b.core.material.opacity = o; b.shell.material.opacity = o * .38; b.light.intensity = o * 2.4;
      if (k >= 1) { endBlast(b); blasts.splice(n, 1); }
    }
  }
}
function clearBlasts() { for (const b of blasts) endBlast(b); blasts.length = 0; }

// Ability cue: a thin ring draws itself around the stand cylinder, rises up the figure, then fades. Same for every poké-power.
const ABILITY_R = BASE_R + .04, ABILITY_TUBE = .022, abilityRings = [];
function endAbility(a) {
  if (a.dead) return; a.dead = true;
  if (a.mesh.parent) a.mesh.parent.remove(a.mesh);
  a.geo.dispose(); a.mat.dispose();
}
function ability(i, bad) {
  const g = tokens.get(i); if (!g) return;
  const now = performance.now();
  if (g.userData.abilityAt && now - g.userData.abilityAt < 850) return;   // one boost cue at a time (notice + MP arrive can both fire)
  g.userData.abilityAt = now;
  const hue = new THREE.Color(bad ? '#ff6b7a' : (css('--gold', '') || css('--bd-line', '') || '#ffd23f'));
  const geo = new THREE.TorusGeometry(ABILITY_R, ABILITY_TUBE, 8, 72);
  const mat = new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: .95, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2; mesh.position.y = BASE_H * .35; mesh.renderOrder = 50;
  geo.setDrawRange(0, 0); g.add(mesh);
  g.userData.boostPop = 0;   // figure lifts a little while the ring climbs
  abilityRings.push({ g, mesh, geo, mat, phase: 'draw', t: 0, full: geo.index ? geo.index.count : geo.attributes.position.count, dead: false });
}
function stepAbilities(dt) {
  for (let n = abilityRings.length - 1; n >= 0; n--) {
    const a = abilityRings[n]; if (a.dead || !a.g.parent) { endAbility(a); abilityRings.splice(n, 1); continue; }
    a.t += dt;
    if (a.phase === 'draw') {
      const k = Math.min(1, a.t / .38), e = 1 - Math.pow(1 - k, 2);
      a.geo.setDrawRange(0, Math.max(3, Math.floor(e * a.full)));
      a.mat.opacity = .55 + .4 * e; a.mesh.position.y = BASE_H * .35;
      a.g.userData.boostPop = e * .08;
      if (k >= 1) { a.phase = 'rise'; a.t = 0; }
    } else {
      const k = Math.min(1, a.t / .85), e = k * k;
      a.mesh.position.y = BASE_H * .35 + e * 1.05; a.mat.opacity = .95 * (1 - e); a.mesh.scale.setScalar(1 + e * .12);
      a.g.userData.boostPop = .08 * (1 - e);
      if (k >= 1) { a.g.userData.boostPop = 0; endAbility(a); abilityRings.splice(n, 1); }
    }
  }
}
// MatchMain.UsePlateEffect: for one second the plate's effect plays on every figure its action names (AttackEffect Plate_In, or Plate_Out
// when the action moves, evolves, swaps, removes or marks a figure); with no figure it plays over the table. The original's effect
// prefabs did not survive, so it is drawn here: the plate card appears over the figure, then sinks into it with a gold ring (in) or
// bursts away from it with a red ring (out).
const plateFx = [];
function plate(i, out, c) {
  const g = i == null ? null : tokens.get(i), card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: face(c || { n: '', r: 1, c: 0 }, true), transparent: true, depthWrite: false }));
  card.renderOrder = 60;
  const ringGeo = new THREE.TorusGeometry(BASE_R + .06, .03, 8, 72), ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(out ? '#ff5a6e' : (css('--gold', '') || '#ffd23f')), transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = Math.PI / 2; ring.renderOrder = 59;
  const host = new THREE.Group(); if (g) host.position.copy(g.position); else host.position.set(0, 0, 0);
  host.add(card, ring); (g ? g.parent : scene).add(host);   // in the token's own space (the board group), so it sits on the figure
  plateFx.push({ host, g, card, ring, ringGeo, ringMat, out, big: !g, t: 0 });
}
function stepPlates(dt) {
  for (let n = plateFx.length - 1; n >= 0; n--) {
    const f = plateFx[n]; f.t += dt; const t = Math.min(1, f.t), s0 = f.big ? 1 : .5, y0 = f.big ? 1.4 : 1.55;
    if (f.g) f.host.position.copy(f.g.position);   // follows the figure (a new form's token may still be on its way in)
    f.card.quaternion.copy(camera.quaternion);   // the card faces the player
    if (t < .3) { const k = t / .3, e = 1 - Math.pow(1 - k, 3); f.card.scale.setScalar(s0 * e); f.card.position.y = y0 + .35 * (1 - e); f.card.material.opacity = e; }
    else if (t < .65) { f.card.scale.setScalar(s0); f.card.position.y = y0; f.card.material.opacity = 1; }
    else {
      const k = (t - .65) / .35, e = k * k;
      if (f.out) { f.card.scale.setScalar(s0 * (1 + e * .6)); f.card.position.y = y0 + e * .7; }
      else { f.card.scale.setScalar(s0 * (1 - e * .9)); f.card.position.y = y0 - e * 1.1; }
      f.card.material.opacity = 1 - e;
      f.ringMat.opacity = .95 * Math.sin(Math.PI * k); f.ring.position.y = f.out ? .05 + e * .6 : .6 - e * .55; f.ring.scale.setScalar(f.big ? 3 : 1 + e * .5);
    }
    if (f.t >= 1) { f.host.removeFromParent(); f.card.material.dispose(); f.ringGeo.dispose(); f.ringMat.dispose(); plateFx.splice(n, 1); }
  }
}
// A field spin (MatchMain field declare spin): when an effect makes figures that are not in a battle spin (Ice Shard, Powder Snow, Origin
// Pulse, ...), each one's wheel appears flat around its stand on the board, spins and stops on the engine's result, then fades. segs:
// [{ range (of 96), col (css colour), label }]; results: [{ num, displace }]. Resolves with the index of the slice it stopped on.
const fieldSpins = [], SPIN_IN = BASE_R, SPIN_OUT = BASE_R + AURA_W * 1.3;   // like the status ring: from the stand out, AURA_H thick, a little wider
function wheelTex(segs, lit) {   // lit: the slice under the pointer; the others are dimmed (black at .5, as the battle wheel's .dimw)
  return tex(512, 512, (g, w, h) => {
    const c = w / 2, R = w / 2 - 2, rIn = R * SPIN_IN / SPIN_OUT; let a = 0;
    for (const sg of segs) {   // clockwise from 12 o'clock, as the battle wheel
      const a0 = a / 96 * Math.PI * 2 - Math.PI / 2, a1 = (a + sg.range) / 96 * Math.PI * 2 - Math.PI / 2; a += sg.range;
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, a0, a1); g.closePath(); g.fillStyle = sg.col; g.fill(); if (lit != null && lit !== segs.indexOf(sg) && segs.length > 1) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); } g.strokeStyle = '#111'; g.lineWidth = 3; g.stroke();
      if (sg.label && sg.range >= 8) { const mid = (a0 + a1) / 2, rr = (R + rIn) / 2; g.save(); g.translate(c + Math.cos(mid) * rr, c + Math.sin(mid) * rr); g.rotate(mid - Math.PI / 2);   // upright at the near side, where the pointer is
        g.fillStyle = sg.ink || '#111'; g.font = '900 28px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sg.label, 0, 0); g.restore(); }
    }
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.strokeStyle = '#0b0b0c'; g.lineWidth = 6; g.stroke();
  });
}
function wallTex(segs, lit) {   // wide, so a join is as thin as on the top face; the outer wall in the slices' colours: CylinderGeometry u = 0.5 - t/96 lines up with the top face
  return tex(2048, 16, (c, w, h) => { let a = 0; segs.forEach((sg, n) => {
    const x = ((.5 - (a + sg.range) / 96) % 1 + 1) % 1 * w, len = sg.range / 96 * w; a += sg.range;
    for (const col of lit != null && lit !== n && segs.length > 1 ? [sg.col, 'rgba(0,0,0,.5)'] : [sg.col]) { c.fillStyle = col; c.fillRect(x, 0, len, h); if (x + len > w) c.fillRect(x - w, 0, len, h); } });
    a = 0; c.fillStyle = '#111'; for (const sg of segs) { const x = ((.5 - a / 96) % 1 + 1) % 1 * w; a += sg.range; c.fillRect(x - 1.5, 0, 3, h); if (x < 1.5) c.fillRect(x + w - 1.5, 0, 3, h); } });   // black joins, as on the top face
}
function fieldSpin(i, segs, results, still, onStop) {   // still: a frozen or melted wheel shows its result without turning; onStop: called the moment it stops
  const g = tokens.get(i); if (!g || !segs.length) { if (onStop) onStop(); return Promise.resolve(0); }
  const geo = new THREE.RingGeometry(SPIN_IN, SPIN_OUT, 96, 1), mat = new THREE.MeshBasicMaterial({ map: wheelTex(segs), transparent: true, opacity: 0, side: THREE.DoubleSide });   // writes depth, so the status words under it stay hidden
  const ring = new THREE.Mesh(geo, mat); ring.rotation.x = -Math.PI / 2;   // renderOrder 0: drawn before the figure's picture (1), so it never covers the figure
  const side = new THREE.Mesh(new THREE.CylinderGeometry(SPIN_OUT, SPIN_OUT, AURA_H + .004, 96, 1, true), new THREE.MeshBasicMaterial({ map: wallTex(segs), transparent: true, opacity: 0 }));
  side.position.y = (AURA_H + .004) / 2; ring.position.y = AURA_H + .006;   // a solid band over the status ring, the wheel on its top face
  const turnG = new THREE.Group(); turnG.add(side, ring);
  const tri = new THREE.Shape([new THREE.Vector2(-.09, 0), new THREE.Vector2(.09, 0), new THREE.Vector2(0, .15)]);   // a solid triangle as tall as the wheel
  const ptr = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: AURA_H + .006, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: css('--gold', '') || '#ffd23f', roughness: .5, transparent: true, opacity: 0 }));
  ptr.rotation.x = -Math.PI / 2; ptr.position.set(0, 0, SPIN_OUT + .17); ptr.castShadow = true;   // fixed at the near side, tip touching the rim, so the lit slice is not hidden behind the figure
  const host = new THREE.Group(); host.add(turnG, ptr); host.position.copy(g.position); g.parent.add(host);
  const starts = []; let a = 0; for (const sg of segs) { starts.push(a); a += sg.range; }
  const at = num => Math.max(0, segs.findIndex((sg, n) => num >= starts[n] && num < starts[n] + sg.range));
  return new Promise(done => {
    const steps = []; let landed = 0;
    for (const r of results) {   // each result is a full spin; a displace then shifts it to the neighbouring slice
      landed = at(r.num); steps.push({ pos: r.num + .5, turns: still ? 0 : steps.length ? 2 : 3, sec: still ? .01 : steps.length ? 1.1 : 1.6 });
      if (r.displace) { landed = ((landed + r.displace) % segs.length + segs.length * 10) % segs.length; steps.push({ pos: starts[landed] + segs[landed].range / 2, turns: 0, sec: still ? .01 : .35, back: r.displace < 0 }); }
    }
    fieldSpins.push({ g, host, turnG, ring, side, ptr, geo, mat, segs, onStop, steps, rot: 0, from: 0, to: null, t: 0, phase: 'in', landed, done });
  });
}
function stepFieldSpins(dt) {
  for (let n = fieldSpins.length - 1; n >= 0; n--) {
    const f = fieldSpins[n]; f.t += dt; f.host.position.copy(f.g.position);
    if (f.phase === 'in') { const k = Math.min(1, f.t / .25); f.mat.opacity = k; f.side.material.opacity = k; f.ptr.material.opacity = k; if (k >= 1) { f.phase = 'spin'; f.t = 0; f.to = null; } }
    else if (f.phase === 'spin') {
      const st = f.steps[0];
      if (!st) { f.phase = 'hold'; f.t = 0; if (f.onStop) f.onStop(); f.mat.map.dispose(); f.mat.map = wheelTex(f.segs, f.landed); f.side.material.map.dispose(); f.side.material.map = wallTex(f.segs, f.landed); continue; }   // stopped: the slice under the pointer stays lit
      if (f.to == null) { let to = st.pos / 96 * Math.PI * 2 + Math.PI; if (st.back) { while (to > f.rot) to -= Math.PI * 2; } else { while (to < f.rot + st.turns * Math.PI * 2) to += Math.PI * 2; } f.from = f.rot; f.to = to; f.t = 0; }   // + half a turn: the pointer is at the near side
      const k = Math.min(1, f.t / st.sec), e = 1 - Math.pow(1 - k, 3); f.rot = f.from + (f.to - f.from) * e; f.turnG.rotation.y = f.rot;   // the slice at angle pos ends under the pointer
      if (k >= 1) { f.steps.shift(); f.to = null; }
    } else if (f.phase === 'hold') { if (f.t >= 1) { f.phase = 'out'; f.t = 0; } }
    else { const k = Math.min(1, f.t / .3); f.mat.opacity = 1 - k; f.side.material.opacity = 1 - k; f.ptr.material.opacity = 1 - k;
      if (k >= 1) { f.host.removeFromParent(); f.geo.dispose(); f.mat.map.dispose(); f.mat.dispose(); f.ptr.geometry.dispose(); f.ptr.material.dispose(); f.side.geometry.dispose(); f.side.material.map.dispose(); f.side.material.dispose(); fieldSpins.splice(n, 1); f.done(f.landed); } }
  }
}
function clearAbilities() { for (const a of abilityRings) endAbility(a); abilityRings.length = 0; for (const f of fieldSpins) { f.phase = 'out'; f.t = 1; } stepFieldSpins(0); }   // and any field-spin wheel still on the table

function project(i) {   // where a figure sits on the arena, so the evolution flash can land on it
  const g = tokens.get(i); if (!g) return null;
  const v = g.position.clone(); v.y += .7; v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect(), host = (document.querySelector('.arena') || renderer.domElement.parentElement).getBoundingClientRect();
  return { x: (v.x * .5 + .5) * rect.width + rect.left - host.left, y: (-v.y * .5 + .5) * rect.height + rect.top - host.top };
}
// The battle stage (MatchMain.BattleInfo / StartBattle, BattleController, BattleAnimController, MatchCamera.SetBattleCamera). The original keeps
// it beside the table (BattleStageRoot, x 100); here it is 100 units off the other way (x mirrored on this board). The two figures stand in
// their nodes 1.5 from the middle, yours on the near side, and play attack_anime_controller's clips (web/battleclips.js, the figure root's
// motion and events); the camera is the rig's battle pose: dolly (0, 0.8, 0.34), rotY -30, rotX 78, zoom 8.9, camera (0, 0, -0.25) at
// (89.21, 0, 180), fov 30. The stage model itself is not in the APK (each stage's battle_stage_mdl was downloaded), so a plain floor stands in.
const FIGHT_AT = new THREE.Vector3(-100, 0, 0);
const FIGHT_CAM = { pos: [4.327, 2.895, 7.834], fwd: [-.488, -.221, -.845], up: [-.111, .975, -.192] };
let fight = null;
const loadClips = () => window.BATTLE_CLIPS ? Promise.resolve() : new Promise(res => { const s = document.createElement('script'); s.src = new URL('battleclips.js', document.baseURI).href; s.onload = s.onerror = () => res(); document.head.appendChild(s); });
function fighter(f, near) {   // a figure on its base, kept out of the board's own token list (and so out of its redraws and taps)
  const id = '__fight' + (near ? 'a' : 'b'), g = token({ i: id, x: 0, z: 0 }), u = g.userData; tokens.delete(id); scene.remove(g);
  for (const m of [u.base, u.art, u.tagBody, u.tagFace]) { const i = pickable.indexOf(m); if (i >= 0) pickable.splice(i, 1); }
  u.base.material.color.setHex(f.team ? RED : BLUE); u.base.material.emissive.setHex(f.team ? 0x3a060c : 0x08224f);
  u.art.material.map = picture(f.img); u.art.material.needsUpdate = true; u.ring.visible = u.aura.visible = u.words.visible = u.tag.visible = u.mega.visible = false;
  return g;
}
async function battleOpen(a, b) {   // a: yours, b: theirs ({ img, team }). The figures come in (battle_in) behind the wheels.
  battleClose(); await loadClips();
  const root = new THREE.Group(); root.position.copy(FIGHT_AT); scene.add(root);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--bd', '#0c0d10')), roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const nodes = [0, 1].map(k => { const n = new THREE.Group(); if (k) n.rotation.y = Math.PI; root.add(n); return n; });   // Player, Enemy (turned 180)
  const figs = [fighter(a, true), fighter(b, false)];
  figs.forEach((g, k) => { nodes[k].add(g); g.position.set(0, 0, 1.5); });
  const keep = { pos: camera.position.clone(), at: controls.target.clone(), up: camera.up.clone(), fov: camera.fov, on: controls.enabled };
  controls.enabled = false; camera.fov = 30; camera.up.set(...FIGHT_CAM.up); camera.position.copy(FIGHT_AT).add(new THREE.Vector3(...FIGHT_CAM.pos));
  controls.target.copy(camera.position).addScaledVector(new THREE.Vector3(...FIGHT_CAM.fwd), 8.9); camera.lookAt(controls.target); camera.updateProjectionMatrix();   // the orbit target too, so a redraw keeps this view
  fight = { root, nodes, figs, keep, base: camera.position.clone(), anims: [null, null], shake: 0, fx: [] };
  fightClip(0, 'battle_in'); fightClip(1, 'battle_in');
}
// A clip on one figure: its motion (in the node's frame, Unity's axes: x mirrored, quaternions (x, -y, -z, w)) and its events.
const REST = new THREE.Quaternion(0, 1, 0, 0).invert(), QQ = new THREE.Quaternion(), FW = new THREE.Vector3(), FW2 = new THREE.Vector3();
function fightClip(k, name, on) {
  const c = (window.BATTLE_CLIPS || {})[name];
  fight.anims[k] = { name, c: c || { l: 0 }, t: 0, next: 0, on: on || (() => {}) };
  return new Promise(res => { fight.anims[k].done = res; });
}
function stepFight(dt) {
  if (!fight) return;
  for (let k = 0; k < 2; k++) {
    const a = fight.anims[k]; if (!a) continue;
    a.t += dt; const c = a.c, n = c.p ? c.p.length / 3 : c.q ? c.q.length / 4 : 0, f = Math.min(n - 1, Math.floor(a.t * 30)), g = fight.figs[k];
    if (c.p && f >= 0) g.position.set(-c.p[f * 3], c.p[f * 3 + 1], c.p[f * 3 + 2]);
    if (c.q && f >= 0) { QQ.set(c.q[f * 4], -c.q[f * 4 + 1], -c.q[f * 4 + 2], c.q[f * 4 + 3]).multiply(REST); g.quaternion.copy(QQ); }
    while (c.e && a.next < c.e.length && c.e[a.next][0] <= a.t) a.on(c.e[a.next][1], c.e[a.next][2], g), a.next++;
    if (a.t >= c.l) { fight.anims[k] = null; a.done(); }
  }
  fight.figs.forEach(g => { const u = g.userData, px = u.art.material.map?.userData.px || [FRAME, FRAME]; u.art.scale.set(1.05 * px[0] / FRAME, 1.05 * px[1] / FRAME, 1); });   // every picture at one scale
  [...fight.figs].sort((p, q) => q.getWorldPosition(FW).distanceToSquared(camera.position) - p.getWorldPosition(FW2).distanceToSquared(camera.position)).forEach((g, i) => { const u = g.userData, n = 900 + 5 * i; u.base.renderOrder = n + 1; u.cap.renderOrder = n + 2; u.shade.renderOrder = n + 3; u.art.renderOrder = n + 4; });
  if (fight.shake) {   // MatchCamera.ShakeProgress: 0.1 x power, a new offset every 0.03 s
    const m = Math.floor((fight.shakeT = (fight.shakeT || 0) + dt) / .03), r = Math.sin(m * 12.9898) * 43758.5453, ang = (r - Math.floor(r)) * Math.PI * 2;
    camera.position.copy(fight.base).add(new THREE.Vector3(.1 * fight.shake * Math.sin(ang), 0, .1 * fight.shake * Math.cos(ang)));
  } else if (fight.base) camera.position.copy(fight.base);
}
// A hit, a guard and the like: a flash in the attack's colour where the effect plays (the original's particle effects are not copied)
const HIT_COL = { dark: 0x6b3fa0, electric: 0xffe14a, grass: 0x5ad25a, psychic: 0xff6fd0, steel: 0xb8c4d0, fire: 0xff7a1a, water: 0x3aa0ff, ice: 0x9feaff, poison: 0xb050e0, ground: 0xc8963c,
  flying: 0xd8ecff, ghost: 0x8a5cd0, dragon: 0x5a6cff, fairy: 0xffa8e0, gold: 0xffd23f, zskill: 0xff5ad2, guard: 0x59c9f8 };
const pal = c => ({ flash: [c, 0xffffff, c, 0x101010], ring: [c, 0xffffff, c], spark: [c, 0xffffff, c], life: 1.2 });
function flashAt(g, flag) { const at = new THREE.Vector3(); (g || fight.root).getWorldPosition(at); at.y += .4; burst(at, pal(HIT_COL[flag] || 0xffffff)); }   // BattleAnimController.SetEffect: at the node's origin (the stage's middle), a guard on the figure
// BattleController.Init: the winner w attacks (attack_success / damage on the loser with the attack's effect flag), or, when its attack is not an
// attack, dodges or guards while the loser runs into it (attack_to_guard). A gold attack or a Z-Move first plays its glow (1.5 s) on both.
// spec: { w: 0 yours | 1 theirs, effect: [flag, flag] (the effect flag of each side's attack, '' when none), attack: [bool, bool],
//   dodge: [bool, bool], gold: [bool, bool], z: [bool, bool], sound(name) }. Resolves when both figures are done (IsEndBattleAnimation).
async function battleFight(spec) {
  if (!fight) return;
  const w = spec.w, l = 1 - w, flag = spec.effect[w], played = [false, false];
  const hitSound = k => { if (!played[k]) { played[k] = true; spec.sound(spec.hit(flag)); } };
  const on = k => (fn, p, g) => {
    if (fn === 'ShowDamageOrDebuffEffect') { hitSound(k); flashAt(null, flag); }
    else if (fn === 'PlayPrecedingSoundEffect' || fn === 'PlayHitSound') hitSound(k);
    else if (fn === 'ShowGuardEffect') { spec.sound('shield'); flashAt(g, 'guard'); }
    else if (fn === 'ShowGoldEffect') { spec.sound('gold'); flashAt(null, 'gold'); }
    else if (fn === 'ShowZSkillEffect') flashAt(null, 'zskill');
    else if (fn === 'OnDodge') spec.sound('blue');
    else if (fn === 'StartCameraShake') { fight.shake = p || 1; fight.shakeT = 0; }
    else if (fn === 'StopCameraShake') fight.shake = 0;
  };
  const pre = spec.z[w] ? ['zskill_fx_on', 'zskill_fx_wait'] : spec.gold[w] ? ['gold_fx_on', 'gold_fx_wait'] : null;
  if (pre) await Promise.all([fightClip(w, pre[0], on(w)), fightClip(l, pre[1], on(l))]);
  if (spec.attack[w]) await Promise.all([fightClip(w, 'attack_' + flag, on(w)), fightClip(l, 'damage_' + flag, on(l))]);
  else await Promise.all([fightClip(w, spec.dodge[w] ? 'dodge' : 'guard', on(w)), fightClip(l, 'attack_to_guard', on(l))]);
  fight.shake = 0;
}
function battleClose() {
  if (!fight) return;
  const f = fight; fight = null;
  scene.remove(f.root); f.root.traverse(o => { if (o.isMesh && o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); });
  camera.fov = f.keep.fov; camera.up.copy(f.keep.up); camera.position.copy(f.keep.pos); controls.target.copy(f.keep.at); controls.enabled = f.keep.on; camera.updateProjectionMatrix(); controls.update();
}
window.Board3D = { battleOpen, battleFight, battleClose, draw, goal, newDuel, clearGoal: () => { goalShown = false; }, controls, tokens, project, blast, clearBlasts, ability, clearAbilities, plate, fieldSpin, info: () => ({ ...renderer.info.memory, objects: (() => { let n = 0; scene.traverse(() => n++); return n; })() }) };   // controls and tokens are exposed for inspection
if (window.board3dModel) draw(window.board3dModel);
