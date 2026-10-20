// Original Pokémon Duel audio from The Sounds Resource (Duels + Common + Cutscenes).
// sfx(name) plays a logical event or a raw clip id (se024, jingle001, …).
// Spin uses a looping se024 until sfxStop('spin') / spin_stop. BGM: bgm.play / bgm.stop.
// Sound button cycles: all (music+sfx) → sfx → off (localStorage).
(() => {
  const SOUND_KEY = 'pokemonduelweb.sound';
  const MODES = ['all', 'sfx', 'off'];
  // Cached clips play through HTMLAudio (media channel). Web Audio is for synth fallback + decode.
  // Must unlock inside a real tap — not after await (asset-gate download breaks the gesture).
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  let actx = null, noiseBuf = null, master = null, musicGain = null, mode = 'all', bgmSrc = null, bgmId = null, resumeWait = null, bgmAudio = null;
  const loopSrc = {}; // Web Audio loops
  const htmlLoops = {}; // HTMLAudio loops
  const blobUrls = {}; // path -> object URL from cache
  try {
    let saved = localStorage.getItem(SOUND_KEY);
    if (saved == null) {
      const old = localStorage.getItem('figureduel.sound');
      if (old != null) { saved = old; localStorage.removeItem('figureduel.sound'); }
    }
    if (saved === 'on' || saved === 'all') mode = 'all';
    else if (saved === 'sfx') mode = 'sfx';
    else if (saved === 'off') mode = 'off';
    else mode = 'all';
    localStorage.setItem(SOUND_KEY, mode);
  } catch (e) {}

  const sfxOn = () => mode !== 'off';
  const musicOn = () => mode === 'all';
  const persist = () => { try { localStorage.setItem(SOUND_KEY, mode); } catch (e) {} };

  function ensureCtx() {
    if (!sfxOn()) return Promise.resolve(null);
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return Promise.resolve(null); }
    if (!master) { master = actx.createGain(); master.gain.value = .9; master.connect(actx.destination); }
    if (!musicGain) { musicGain = actx.createGain(); musicGain.gain.value = .45; musicGain.connect(actx.destination); }
    if (!noiseBuf) {
      const n = actx.sampleRate, d = (noiseBuf = actx.createBuffer(1, n, n)).getChannelData(0); let s = 1;
      for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    }
    if (actx.state === 'running') return Promise.resolve(actx);
    if (!resumeWait) {
      resumeWait = actx.resume().then(() => actx).catch(() => actx).finally(() => { resumeWait = null; });
    }
    return resumeWait;
  }

  // Call from a tap handler before any await (gate Continue / Skip / first click).
  function unlockAudio() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    ensureCtx();
    try {
      if (actx) {
        const tick = actx.createBuffer(1, 1, actx.sampleRate || 44100);
        const src = actx.createBufferSource();
        src.buffer = tick; src.connect(actx.destination); src.start(0);
      }
    } catch (e) {}
    try {
      const a = new Audio(SILENT);
      a.volume = 0.01;
      a.setAttribute('playsinline', '');
      a.playsInline = true;
      a.play().catch(() => {});
    } catch (e) {}
  }
  window.unlockAudio = unlockAudio;

  function ready() {
    if (!sfxOn() || !actx) return null;
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }

  const UI_GAIN = .14, SFX_GAIN = .75;
  function level(vol, ui) { return ui || vol >= .32 ? vol : vol + (.32 - vol) * .78; }
  function burst(t, at, dur, vol, freq, q, type, ui) {
    vol = level(vol, ui);
    const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.setValueAtTime(Math.max(40, freq), t + at); f.Q.value = q || .7;
    g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
    src.connect(f).connect(g).connect(master); src.start(t + at); src.stop(t + at + dur + .02);
    return f;
  }
  function tone(t, type, f0, f1, at, dur, vol) {
    vol = level(vol);
    const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + at + dur);
    g.gain.setValueAtTime(.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + Math.min(.02, dur * .3));
    g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
    o.connect(g).connect(master); o.start(t + at); o.stop(t + at + dur + .02);
  }
  const bank = {
    select: t => burst(t, 0, .03, .22, 2400, 1, 'highpass'),
    click: t => burst(t, 0, .03, .05, 2400, 1, 'highpass', true),
    back: t => burst(t, 0, .04, .045, 900, 1, 'bandpass', true),
    step: t => { burst(t, 0, .07, .4, 140, .8); burst(t, .01, .03, .12, 900, 1, 'bandpass'); },
    land: t => { burst(t, 0, .05, .35, 220, 1); burst(t, .012, .04, .18, 1100, 2, 'bandpass'); },
    spin: t => { for (let k = 0; k < 14; k++) burst(t, 1.15 * Math.pow(k / 14, 1.7), .02, .16, 1600 + (k % 3) * 180, 3, 'bandpass'); },
    spin_short: t => bank.spin(t), spin_stop: t => bank.land(t),
    miss: t => { const f = burst(t, 0, .2, .16, 1800, .6, 'bandpass'); f.frequency.exponentialRampToValueAtTime(280, t + .2); },
    hit: t => { burst(t, 0, .16, .45, 90, .6); burst(t, 0, .045, .28, 1400, 1.4, 'bandpass'); },
    gold: t => { burst(t, 0, .14, .4, 120, .7); burst(t, 0, .06, .22, 2200, 2, 'bandpass'); tone(t, 'triangle', 1568, 1175, .01, .22, .08); },
    purple: t => { burst(t, 0, .2, .2, 700, 2, 'bandpass'); tone(t, 'sine', 880, 1320, 0, .16, .07); },
    blue: t => { tone(t, 'triangle', 988, 988, 0, .1, .09); burst(t, 0, .08, .12, 3000, 1, 'highpass'); },
    ko: t => { burst(t, 0, .28, .5, 70, .5); burst(t, .02, .08, .3, 600, 1, 'bandpass'); },
    draw: t => { burst(t, 0, .06, .22, 400, 1, 'bandpass'); burst(t, .09, .06, .18, 320, 1, 'bandpass'); },
    attack: t => { const f = burst(t, 0, .18, .22, 500, .8, 'bandpass'); f.frequency.exponentialRampToValueAtTime(1800, t + .18); },
    plate: t => { burst(t, 0, .025, .2, 3200, 1, 'highpass'); burst(t, .03, .05, .16, 500, 1); },
    plate_pick: t => bank.plate(t), plate_ok: t => bank.select(t), plate_cancel: t => bank.cancel(t), plate_energy: t => bank.ability(t),
    ability: t => { tone(t, 'sine', 740, 1180, 0, .12, .07); burst(t, 0, .14, .1, 2000, 2, 'bandpass'); },
    ability_bad: t => bank.st_curse(t),
    win: t => { [523, 659, 784, 1047].forEach((f, k) => tone(t, 'triangle', f, f, k * .11, .2, .1)); },
    lose: t => { [392, 330, 262, 196].forEach((f, k) => tone(t, 'triangle', f, f * .97, k * .14, .26, .09)); },
    turn: t => { burst(t, 0, .04, .2, 1800, 2, 'bandpass'); burst(t, .08, .06, .16, 2400, 2, 'bandpass'); },
    end_turn: t => bank.turn(t),
    st_poison: t => [0, .08, .16].forEach((at, k) => burst(t, at, .07, .2, 700 - k * 140, 2, 'bandpass')),
    st_bad_poison: t => [0, .07, .14, .21].forEach((at, k) => burst(t, at, .09, .22, 420 - k * 60, 2, 'bandpass')),
    st_burn: t => { for (let k = 0; k < 10; k++) burst(t, k * .03, .04, .14, 400 + (k * 470) % 1800, 1.2, 'bandpass'); },
    st_paralyze: t => { for (let k = 0; k < 6; k++) burst(t, k * .028, .02, .2, k % 2 ? 2800 : 900, 4, 'highpass'); },
    st_sleep: t => { const f = burst(t, 0, .5, .1, 400, .6, 'lowpass'); f.frequency.linearRampToValueAtTime(180, t + .5); },
    st_freeze: t => { burst(t, 0, .12, .16, 5000, 2, 'highpass'); },
    st_panic: t => { for (let k = 0; k < 5; k++) burst(t, k * .06, .04, .16, k % 2 ? 1600 : 700, 3, 'bandpass'); },
    st_curse: t => { burst(t, 0, .45, .28, 90, .5); },
    evolve: t => { const f = burst(t, 0, .55, .18, 300, .7, 'bandpass'); f.frequency.exponentialRampToValueAtTime(2800, t + .5); },
    wait: t => { burst(t, 0, .16, .2, 240, .7); },
    cancel: t => burst(t, 0, .05, .16, 500, 1, 'bandpass'),
    mp_up: t => [523, 659, 784].forEach((f, k) => tone(t, 'triangle', f, f, k * .06, .1, .08)),
    mp_down: t => [659, 523, 392].forEach((f, k) => tone(t, 'triangle', f, f, k * .07, .12, .08)),
    st_other: t => burst(t, 0, .1, .16, 900, 1, 'bandpass'),
    duel_start: t => bank.land(t), first: t => bank.turn(t), goal: t => bank.ko(t),
    surround: t => { burst(t, 0, .2, .4, 120, .6); burst(t, .05, .25, .28, 600, 1, 'bandpass'); },
    swap: t => bank.step(t), cured: t => bank.ability(t), attack_phase: t => bank.attack(t)
  };
  bank.st_melt = t => bank.st_freeze(t);

  // Logical event -> original clip id(s). Sequences play in order. LOOP names keep the clip looping until sfxStop.
  const ORIG = {
    // UI (Common)
    click: 'se001', back: 'se002', swipe: 'se009', sell: 'se010',
    levelup: 'se012', exp: 'se013', fusion_start: 'se014', fusion_set: 'se136',
    fusion_aura: ['se137', 'se138'], view_toggle: 'se116', reset: 'se125',
    hotel: 'se057', stamina: 'se058', item_get: 'se141', deck_check: 'se198',
    booster_prompt: 'se206', booster_open: 'se207', booster_results: 'se208',
    booster_suspense: 'se209', booster_single: 'se222', booster_tap: 'se223',
    booster_tap_b: 'se223_2', booster_ten: 'se224', rare_booster: 'se139',
    exchange: 'se216', start_game: 'se221', exit: 'se227', quest: 'se154',
    // Duel UI / flow
    select: 'se028', cancel: 'se029', deselect: 'se029',
    step: 'se011', land: 'se011', ai_step: 'se034', ai_select: 'se213',
    ai_on: 'se210', ai_off: 'se211', ai_unused: 'se039',
    spin: 'se024', roulette: 'se036_1', spin_short: 'se036_1shot', spin_tick: 'se036_1shot', spin_stop: 'se037',
    prize_chance: 'se214', prize_extend: 'se215',
    miss: 'se060', hit: 'se172', punch: 'se171', swing: 'se173', throw_a: 'se174', throw_b: 'se175',
    shock_a: 'se176', shock_b: 'se177', shock_c: 'se178', blast: 'se179',
    scythe_a: 'se180', scythe_b: 'se181', psychic_force: 'se182', beam: 'se183',
    blizzard: 'se184', sludge: 'se185', bind: 'se186', vine: 'se187',
    gold: 'se188', mist_a: 'se189', mist_b: 'se190', fairy_hit: 'se191',
    flood_a: 'se192', flood_b: 'se193', flood_c: 'se194',
    heavy_fire: 'se217', heavy_water: 'se218',
    purple: 'se073', blue: 'se067', shield: 'se064', shield_b: 'se065', shield_c: 'se066',
    ko: 'se038', draw: 'se063', multiplier: 'se059',
    attack: 'se061', attack_phase: 'se233',
    plate: 'se114', plate_pick: 'se030', plate_ok: 'se047', plate_cancel: 'se142',
    plate_energy: 'se129', plate_action: 'se130',
    ability: 'se121', ability_bad: 'se122',
    win: 'jingle001', lose: 'jingle002', lose_alt: 'se235',
    turn: 'se026', end_turn: 'se219', turn_bridge: 'se023',
    evolve: ['se165', 'se017_2'], form_b: 'se017',
    wait: 'se087', exclusion: 'se087',
    mp_up: 'se123', mp_down: 'se124',
    st_poison: 'se091', st_bad_poison: 'se092', st_burn: 'se093', st_paralyze: 'se090',
    st_sleep: 'se089', st_freeze: 'se094', st_melt: 'se094', st_panic: 'se088', st_curse: 'se122',
    st_other: 'se087', cured: 'se046',
    duel_start: 'se022', first: 'se226', goal: 'se212', swap: 'se048', surround: 'se035',
    elo_up: 'se042', elo_down: 'se043', promo_a: 'se044', promo_b: 'se132',
    releg_a: 'se045', releg_b: 'se133', new_figure: 'se140',
    type_dark: 'se070', type_electric: 'se071', type_grass: 'se072', type_psychic: 'se073',
    type_fighting: 'se074', type_steel: 'se075', type_fire: 'se076', type_water: 'se077',
    type_ice: 'se078', type_poison: 'se079', type_ground: 'se080', type_flying: 'se081',
    type_bug: 'se082', type_rock: 'se083', type_ghost: 'se084', type_dragon: 'se085', type_fairy: 'se086',
    // Cutscenes (story / device — playable by name or raw id)
    device_boot: 'se003', device_off: 'se004', news: 'se005', carlo: 'se006',
    plane_land: 'se051', plane_alert: 'se052', gates: 'se053', ringtone: 'se054',
    airport_news: 'se055', airport: 'se134', airplane: 'se135',
    device_first: 'se147', device_setup: 'se148', device_play: 'se149',
    cheer: 'se152', alarm: 'se153', footsteps_in: 'se156', footsteps_out: 'se157',
    phone: 'se158', car: 'se160', interference: 'se166', outage: 'se169', firewall: 'se170',
    smash_a: 'se203', emblem: 'se205', dialog: 'se229', mechanisms: 'se230',
    smash_b: 'se231', carlo_intro: 'se238'
  };
  const LOOP = { spin: 1, roulette: 1 }; // se024 loops for the whole wheel / first-move spin

  // Every shipped clip (Duels 107 + Common 30 + Cutscenes 29, overlaps resolved).
  const ALL_IDS = ['jingle001','jingle002','se001','se002','se003','se004','se005','se006','se009','se010','se011','se012','se013','se014','se017','se017_2','se022','se023','se024','se026','se027','se028','se029','se030','se034','se035','se036_1','se036_1shot','se037','se038','se039','se042','se043','se044','se045','se046','se047','se048','se051','se052','se053','se054','se055','se057','se058','se059','se060','se061','se063','se064','se065','se066','se067','se070','se071','se072','se073','se074','se075','se076','se077','se078','se079','se080','se081','se082','se083','se084','se085','se086','se087','se088','se089','se090','se091','se092','se093','se094','se114','se116','se121','se122','se123','se124','se125','se129','se130','se132','se133','se134','se135','se136','se137','se138','se139','se140','se141','se142','se147','se148','se149','se152','se153','se154','se156','se157','se158','se160','se165','se166','se169','se170','se171','se172','se173','se174','se175','se176','se177','se178','se179','se180','se181','se182','se183','se184','se185','se186','se187','se188','se189','se190','se191','se192','se193','se194','se198','se203','se205','se206','se207','se208','se209','se210','se211','se212','se213','se214','se215','se216','se217','se218','se219','se221','se222','se223','se223_2','se224','se226','se227','se229','se230','se231','se233','se235','se238'];

  const raw = {}, clips = {}, decoding = {}, failed = {}, loading = {};
  // Resolve against <base href> so /2d/ and GitHub Pages subpaths both work.
  const sfxPath = id => 'sfx/' + id + '.wav';
  const audioArmed = () => !window.Assets || Assets.isArmed();

  function fetchRaw(id) {
    if (!id || failed[id]) return Promise.resolve(null);
    if (raw[id]) return Promise.resolve(raw[id]);
    if (loading[id]) return loading[id];
    return loading[id] = (async () => {
      try {
        // Only play clips the asset gate cached — no surprise network downloads.
        if (!window.Assets || !Assets.getBuffer) return null;
        const fromPack = await Assets.getBuffer(sfxPath(id));
        if (fromPack && fromPack.byteLength) { raw[id] = fromPack; return fromPack; }
        return null;
      } catch (e) { return null; }
      finally { delete loading[id]; }
    })();
  }

  function decodeId(id) {
    if (!id || failed[id]) return Promise.resolve(null);
    if (clips[id]) return Promise.resolve(clips[id]);
    if (decoding[id]) return decoding[id];
    return decoding[id] = fetchRaw(id).then(bytes => {
      if (!bytes) return null;
      return ensureCtx().then(c => {
        if (!c) return null;
        return c.decodeAudioData(bytes.slice(0)).then(buf => {
          clips[id] = buf;
          delete raw[id]; // free the compressed copy once decoded
          return buf;
        }).catch(() => { failed[id] = 1; return null; });
      });
    }).finally(() => { delete decoding[id]; });
  }

  function stopLoop(name) {
    const src = loopSrc[name];
    if (src) {
      delete loopSrc[name];
      try { src.stop(); } catch (e) {}
    }
    const a = htmlLoops[name];
    if (a) {
      delete htmlLoops[name];
      try { a.pause(); a.currentTime = 0; } catch (e) {}
    }
  }

  function playBuf(buf, gain, dest, loop, loopKey, rate) {
    if (!actx || actx.state === 'closed') return null;
    if (loopKey) stopLoop(loopKey);
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = !!loop; if (rate) src.playbackRate.value = rate;
    const g = actx.createGain(); g.gain.value = gain;
    src.connect(g).connect(dest || master); src.start();
    if (loop && loopKey) {
      loopSrc[loopKey] = src;
      src.onended = () => { if (loopSrc[loopKey] === src) delete loopSrc[loopKey]; };
    }
    return src;
  }

  async function cachedUrl(path) {
    if (blobUrls[path]) return blobUrls[path];
    if (!window.Assets || !Assets.mediaUrl) return null;
    const u = await Assets.mediaUrl(path);
    if (u) blobUrls[path] = u;
    return u || null;
  }

  // Prefer HTMLAudio from the asset cache (audible on iOS silent switch).
  async function playHtml(path, vol, loopKey, rate) {
    const url = await cachedUrl(path);
    if (!url) return false;
    if (loopKey) stopLoop(loopKey);
    const a = new Audio(url);
    a.volume = Math.max(0.01, Math.min(1, vol));
    a.loop = !!loopKey;
    if (rate) { a.preservesPitch = false; a.playbackRate = rate; }   // a pitch change, as SoundController.ChangePitch
    a.setAttribute('playsinline', '');
    a.playsInline = true;
    if (loopKey) htmlLoops[loopKey] = a;
    try { await a.play(); return true; } catch (e) { return false; }
  }

  function playClip(id, ui, loopKey, rate) {
    const vol = ui ? Math.min(1, UI_GAIN * 2.2) : SFX_GAIN;
    return playHtml(sfxPath(id), vol, loopKey || null, rate).then(ok => {
      if (ok) return true;
      return decodeId(id).then(buf => {
        if (!buf || !sfxOn()) return false;
        return ensureCtx().then(c => {
          if (!c || !sfxOn()) return false;
          playBuf(buf, ui ? UI_GAIN : SFX_GAIN, null, !!loopKey, loopKey || null, rate);
          return true;
        });
      });
    }).catch(() => false);
  }

  function resolveIds(name) {
    if (ORIG[name] != null) {
      const map = ORIG[name];
      return Array.isArray(map) ? map.slice() : [map];
    }
    const low = String(name).toLowerCase();
    if (ALL_IDS.indexOf(low) >= 0) return [low];
    return [];
  }

  function sfx(name, pitch) {   // pitch: semitones up (SoundUtil.GetPitch), e.g. the rising Se059 of each respin
    if (!sfxOn() || !audioArmed()) return;
    if (name === 'spin_stop') stopLoop('spin');
    const ui = name === 'click' || name === 'back';
    const ids = resolveIds(name);
    const loopKey = LOOP[name] ? name : null;
    if (loopKey && (loopSrc[loopKey] || htmlLoops[loopKey])) return;
    if (!ids.length) {
      ensureCtx().then(c => { if (c && bank[name]) bank[name](c.currentTime); });
      return;
    }
    let i = 0;
    const next = () => {
      if (i >= ids.length || !sfxOn()) return;
      const id = ids[i++];
      playClip(id, ui, i === 1 ? loopKey : null, pitch ? Math.pow(2, pitch / 12) : 0).then(ok => {
        if (!ok && i === 1) ensureCtx().then(c => { if (c && bank[name]) bank[name](c.currentTime); });
        if (i < ids.length) setTimeout(next, 200);
      });
    };
    next();
  }

  function sfxStop(name) {
    if (name) stopLoop(name);
    else {
      Object.keys(loopSrc).forEach(stopLoop);
      Object.keys(htmlLoops).forEach(stopLoop);
    }
  }

  // --- BGM -----------------------------------------------------------------
  const canOgg = (() => {
    try {
      const a = document.createElement('audio');
      return !!(a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"'));
    } catch (e) { return false; }
  })();
  const BGM = {
    menu: canOgg ? ['bgm/menu.ogg', 'bgm/bgm001.wav'] : ['bgm/bgm001.wav'],
    duel: canOgg ? ['bgm/duel.ogg', 'bgm/bgm001.wav'] : ['bgm/bgm001.wav'],
    tense: canOgg ? ['bgm/tense.ogg', 'bgm/bgm001.wav'] : ['bgm/bgm001.wav'],
    epic: canOgg ? ['bgm/epic.ogg', 'bgm/bgm001.wav'] : ['bgm/bgm001.wav']
  };
  const bgmBuf = {}, bgmLoading = {};
  const bgmUrl = path => new URL(path, document.baseURI || location.href).href;

  function loadBgmUrl(url) {
    const path = /^https?:/i.test(url) ? null : url;
    const href = path ? bgmUrl(path) : url;
    if (bgmBuf[href] && bgmBuf[href].getChannelData) return Promise.resolve(bgmBuf[href]);
    if (bgmBuf[href] === false) return Promise.resolve(null);
    if (bgmLoading[href]) return bgmLoading[href];
    return bgmLoading[href] = (async () => {
      try {
        if (!path || !window.Assets || !Assets.getBuffer) { bgmBuf[href] = false; return null; }
        const b = await Assets.getBuffer(path);
        if (!b) { bgmBuf[href] = false; return null; }
        const c = await ensureCtx();
        if (!c) return null;
        const buf = await c.decodeAudioData(b.slice(0));
        bgmBuf[href] = buf;
        return buf;
      } catch (e) {
        bgmBuf[href] = false;
        return null;
      } finally { delete bgmLoading[href]; }
    })();
  }

  async function playBgm(id) {
    if (!musicOn() || !audioArmed()) return;
    if (window.Assets && Assets.packReady && !(await Assets.packReady('bgm'))) return;
    if (bgmId === id && (bgmSrc || (bgmAudio && !bgmAudio.paused))) return;
    stopBgm(false);
    bgmId = id;
    const urls = BGM[id] || BGM.duel;
    // HTMLAudio from cache (media channel — works with iOS silent switch).
    for (const u of urls) {
      if (/^https?:/i.test(u)) continue;
      const url = await cachedUrl(u);
      if (!url || bgmId !== id || !musicOn()) continue;
      try {
        const a = new Audio(url);
        a.loop = true;
        a.volume = .45;
        a.setAttribute('playsinline', '');
        a.playsInline = true;
        await a.play();
        bgmAudio = a;
        a.onended = () => { if (bgmAudio === a) bgmAudio = null; };
        return;
      } catch (e) {}
    }
    const c = await ensureCtx();
    if (!c || bgmId !== id || !musicOn()) return;
    let buf = null;
    for (const u of urls) { buf = await loadBgmUrl(u); if (buf) break; }
    if (!buf || bgmId !== id || !musicOn()) return;
    try {
      bgmSrc = actx.createBufferSource();
      bgmSrc.buffer = buf; bgmSrc.loop = true;
      bgmSrc.connect(musicGain);
      musicGain.gain.cancelScheduledValues(actx.currentTime);
      musicGain.gain.setValueAtTime(0.001, actx.currentTime);
      musicGain.gain.exponentialRampToValueAtTime(.45, actx.currentTime + .8);
      bgmSrc.start();
      bgmSrc.onended = () => { if (bgmSrc) bgmSrc = null; };
    } catch (e) { bgmSrc = null; }
  }

  function stopBgm(fade) {
    if (bgmAudio) {
      const a = bgmAudio; bgmAudio = null; bgmId = null;
      try { a.pause(); a.currentTime = 0; } catch (e) {}
      return;
    }
    const src = bgmSrc; bgmSrc = null; bgmId = null;
    if (!src || !actx) return;
    try {
      if (fade !== false && musicGain) {
        musicGain.gain.cancelScheduledValues(actx.currentTime);
        musicGain.gain.setValueAtTime(Math.max(.001, musicGain.gain.value), actx.currentTime);
        musicGain.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .4);
        setTimeout(() => { try { src.stop(); } catch (e) {} }, 450);
      } else src.stop();
    } catch (e) {}
  }

  // Pick a battle impact clip from the winning attack name (Duels attack bank).
  function strikeSfx(name, col, miss) {
    if (miss) return 'miss';
    const t = String(name || '').toLowerCase();
    if (/punch|fist|arm|mega punch|focus/.test(t)) return 'punch';
    if (/slash|cut|scythe|night slash|x-scissor|leaf blade/.test(t)) return /scythe|guillotine/.test(t) ? 'scythe_a' : 'swing';
    if (/throw|seismic|vital|circle/.test(t)) return 'throw_a';
    if (/beam|hyper beam|solar|psybeam|aurora|charge beam/.test(t)) return 'beam';
    if (/blizzard|ice beam|icy|frost/.test(t)) return 'blizzard';
    if (/sludge|toxic|acid|poison/.test(t)) return 'sludge';
    if (/bind|wrap|constrict|infestation/.test(t)) return 'bind';
    if (/vine|power whip|wood/.test(t)) return 'vine';
    if (/psychic|psyshock|confusion|future/.test(t)) return 'psychic_force';
    if (/surf|hydro|water|aqua|whirlpool|flood/.test(t)) return /heavy|hydro pump|water spout/.test(t) ? 'heavy_water' : 'flood_a';
    if (/fire|flamethrower|blast burn|eruption|overheat|heat/.test(t)) return /blast|eruption|overheat/.test(t) ? 'heavy_fire' : 'blast';
    if (/mist|moonblast|dazzling|fairy|play rough/.test(t)) return /mist/.test(t) ? 'mist_a' : 'fairy_hit';
    if (/shock|thunder|volt|zap|discharge/.test(t)) return 'shock_a';
    if (col === 3) return 'gold';
    if (col === 2) return 'purple';
    if (col === 4) return 'blue';
    return 'hit';
  }

  window.sfx = sfx;
  window.sfxStop = sfxStop;
  window.strikeSfx = strikeSfx;
  window.bgm = { play: playBgm, stop: stopBgm, id: () => bgmId };
  const STATUS = { poison: 1, bad_poison: 1, burn: 1, paralyze: 1, sleep: 1, freeze: 1, melt: 1, panic: 1, curse: 1 };
  window.mpSfx = change => { if (change) sfx(change > 0 ? 'mp_up' : 'mp_down'); };
  window.statusSfx = kind => sfx(STATUS[kind] ? 'st_' + kind : 'st_other');

  const LABELS = { all: 'music + sfx', sfx: 'sfx', off: 'off' };
  const soundBtns = () => {
    const seen = new Set(), out = [];
    for (const b of document.querySelectorAll('[data-sound-btn], #soundBtn')) { if (seen.has(b)) continue; seen.add(b); out.push(b); }
    return out;
  };
  const cycleSound = () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    persist();
    if (!musicOn()) stopBgm(false);
    if (mode === 'off') sfxStop();
    draw();
    if (sfxOn()) {
      ensureCtx().then(() => {
        sfx('click');
        if (musicOn()) {
          const onGame = document.getElementById('game') && !document.getElementById('game').hidden;
          bgm.play(onGame ? 'duel' : 'menu');
        }
      });
    }
  };
  const draw = () => {
    const speaker = '<path d="M4 9v6h4l5 4V5L8 9H4z"/>';
    const glyph = mode === 'all' ? speaker + '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'
      : mode === 'sfx' ? speaker + '<path d="M16 10.5a2.5 2.5 0 0 1 0 3"/>'
      : speaker + '<path d="M16 9l5 6M21 9l-5 6"/>';
    const title = 'Sound: ' + LABELS[mode];
    for (const b of soundBtns()) {
      b.classList.add('iconbtn');
      b.innerHTML = icon(glyph);
      b.title = title; b.setAttribute('aria-label', title);
      if (!b._soundBound) { b._soundBound = 1; b.onclick = cycleSound; }
    }
  };
  addEventListener('DOMContentLoaded', () => draw());
  addEventListener('pointerdown', () => { unlockAudio(); }, true);
  addEventListener('pointerdown', e => {
    if (!audioArmed()) return;
    if (e.target.closest && e.target.closest('#assetGate')) return;
    const el = e.target.closest && e.target.closest('button, [role="button"], a, summary, .row, .tcard, .pchip');
    if (!el || el.disabled || el.id === 'soundBtn' || el.hasAttribute('data-sound-btn') || el.closest('#nav') || el.getAttribute('aria-disabled') === 'true') return;
    const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    sfx(/^(close|back)\b/i.test(label) || el.classList.contains('x') ? 'back' : 'click');
  }, true);
})();
