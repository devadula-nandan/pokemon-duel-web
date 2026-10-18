// Runs the original game's native rule engine (libTFG.so, ARM) inside the page with unicorn.js. Port of tools/tfg.py.
// The library exports  void ai_init();  void ai_cmd(const char *json);  const char *get_g_ss();
// Everything it imports from Android's libc / libm is implemented here; the hot memory routines are pre-assembled ARM code.
//   const eng = await createTFG(MUnicorn, libBytes);  eng.cmd('{"cmd":"ping"}')  ->  'pong'
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.createTFG = factory(); })(this, function () {
  'use strict';
  const BASE = 0x10000000, STUB = 0x0F000000, HEAP = 0x30000000, STACK = 0x7F000000, MISC = 0x0E000000, CMDBUF = 0x0D000000;
  const HEAP_SIZE = 0x04000000, STACK_SIZE = 0x00400000, CMDBUF_SIZE = 0x00400000, ALLOC = MISC + 0xC000, NATIVE = STUB + 0xA000;
  const NATIVE_AT = { malloc: 0, free: 112, __aeabi_memcpy: 184, __aeabi_memmove: 236, __aeabi_memset: 280, memcmp: 336, strlen: 376, calloc: 404, realloc: 448 };
  const NATIVE_HEX = '170080e20f00c0e300300ce3003e40e3010b50e30d00008a202183e0001092e5000051e30300000a08c091e500c082e5080081e21eff2fe1001093e500c081e000c083e5000081e5080081e21eff2fe1011040e2111f6fe1201061e20100a0e31001a0e1412f83e2012182e0eaffffea000050e31eff2f01080040e2001090e500300ce3003e40e3010b51e3212183900400009a01c041e21ccf6fe120c06ce2412f83e20c2182e000c092e508c080e5000082e51eff2fe100c0a0e1040052e30300003a043091e404308ce4042042e2f9ffffea000052e31eff2f010130d1e40130cce4012042e2f9ffffea010050e1f0ffff9a023081e0030050e1edffff2a000052e31eff2f01012042e20230d1e70230c0e7f9ffffea00c0a0e1ff2002e2022482e1022882e1040051e30200003a04208ce4041041e2faffffea000051e31eff2f010120cce4011041e2faffffea00c0a0e10000a0e3000052e31eff2f010100dce40130d1e4030050e01eff2f11012042e2f7ffffea0010a0e10120d1e4000052e3fcffff1a000041e0010040e21eff2fe1900102e070402de90240a0e10200a0e195ffffeb0050a0e10410a0e10020a0e3d7ffffeb0500a0e17080bde8000050e30100a0018cffff0a082010e5082042e2020051e11eff2f9170402de90040a0e10250a0e10100a0e183ffffeb0060a0e10410a0e10520a0e1adffffeb0400a0e199ffffeb0600a0e17080bde8';
  const hex = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16));
  const words = a => { const b = new Uint8Array(a.length * 4); new DataView(b.buffer).setUint32; a.forEach((w, i) => new DataView(b.buffer).setUint32(i * 4, w >>> 0, true)); return b; };
  const enc = new TextEncoder(), dec = new TextDecoder();

  return async function createTFG(MUnicorn, lib) {
    const U = await MUnicorn(), uc = new U.Unicorn(U.ARCH_ARM, U.MODE_ARM), img = lib instanceof Uint8Array ? lib : new Uint8Array(lib), iv = new DataView(img.buffer, img.byteOffset, img.byteLength);
    const R0 = U.ARM_REG_R0, rr = r => uc.reg_read_i32(r) >>> 0, rw = (r, v) => uc.reg_write_i32(r, v | 0);
    const mread = (a, n) => Uint8Array.from(uc.mem_read(a, n)), mwrite = (a, b) => { if (b.length) uc.mem_write(a, Array.from(b)); };
    const u32 = a => { const b = mread(a, 4); return (b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24) >>> 0; }, w32 = (a, v) => mwrite(a, words([v]));
    const f64 = new DataView(new ArrayBuffer(8)), d2w = d => { f64.setFloat64(0, d, true); return [f64.getUint32(0, true), f64.getUint32(4, true)]; };
    const w2d = (lo, hi) => { f64.setUint32(0, lo, true); f64.setUint32(4, hi, true); return f64.getFloat64(0, true); };
    const w2f = w => { f64.setUint32(0, w, true); return f64.getFloat32(0, true); }, f2w = f => { f64.setFloat32(0, f, true); return f64.getUint32(0, true); };
    function cstr(a) { const out = []; for (;;) { const c = mread(a + out.length, 64), i = c.indexOf(0); if (i >= 0) { for (let k = 0; k < i; k++) out.push(c[k]); return Uint8Array.from(out); } for (const x of c) out.push(x); } }
    const str = a => dec.decode(cstr(a));

    for (const [b, n] of [[HEAP, HEAP_SIZE], [STACK, STACK_SIZE], [STUB, 0x10000], [MISC, 0x10000], [CMDBUF, CMDBUF_SIZE], [0xFFFF0000, 0x1000]]) uc.mem_map(b, n, U.PROT_ALL);
    mwrite(NATIVE, hex(NATIVE_HEX)); w32(ALLOC, HEAP + 0x1000);
    let misc = MISC; const blob = b => { const a = misc; mwrite(a, b); misc = (a + b.length + 15) & ~15; return a; };

    // ---- ELF loading
    const phoff = iv.getUint32(28, true), phentsize = iv.getUint16(42, true), phnum = iv.getUint16(44, true), segs = []; let dyn = null, exidx = [0, 0];
    let rwSeg = null;
    for (let i = 0; i < phnum; i++) { const o = phoff + i * phentsize, t = iv.getUint32(o, true), off = iv.getUint32(o + 4, true), va = iv.getUint32(o + 8, true), fsz = iv.getUint32(o + 16, true), msz = iv.getUint32(o + 20, true);
      if (t === 1 && iv.getUint32(o + 24, true) & 2) rwSeg = [BASE + va, (msz + 3) & ~3];
      if (t === 1) segs.push([off, va, fsz, msz]); else if (t === 2) dyn = [va, fsz]; else if (t === 0x70000001) exidx = [BASE + va, fsz >>> 3]; }
    const top = Math.max(...segs.map(s => s[1] + s[3])), image = new Uint8Array((top + 0xFFFF) & ~0xFFFF);
    for (const [off, va, fsz] of segs) image.set(img.subarray(off, off + fsz), va);
    const dv = new DataView(image.buffer), rd = va => dv.getUint32(va, true), D = {};
    for (let o = 0; o < dyn[1]; o += 8) { const tag = rd(dyn[0] + o); if (!tag) break; D[tag] = rd(dyn[0] + o + 4); }
    const strtab = D[5], symtab = D[6], nsym = rd(D[4] + 4), name = o => { let e = o; while (image[e]) e++; return dec.decode(image.subarray(o, e)); };
    const lower = Uint8Array.from(new Uint8Array(new Int16Array([-1, ...Array.from({ length: 256 }, (_, c) => c >= 65 && c <= 90 ? c + 32 : c)]).buffer));
    const upper = Uint8Array.from(new Uint8Array(new Int16Array([-1, ...Array.from({ length: 256 }, (_, c) => c >= 97 && c <= 122 ? c - 32 : c)]).buffer));
    const objs = { __stack_chk_guard: blob(words([0x5AFE5AFE])), __sF: blob(new Uint8Array(3 * 84)), _tolower_tab_: blob(words([blob(lower)])), _toupper_tab_: blob(words([blob(upper)])) };
    const imports = [], sym = {}, symaddr = [], once = STUB + 0x8000;
    for (let i = 0; i < nsym; i++) { const o = symtab + i * 16, n = name(strtab + rd(o)), value = rd(o + 4), shndx = dv.getUint16(o + 14, true); let addr;
      if (shndx) { addr = BASE + value; sym[n] = addr; } else if (!n) addr = 0; else if (n in objs) addr = objs[n]; else if (n in NATIVE_AT) addr = NATIVE + NATIVE_AT[n];
      else if (n === 'pthread_once') addr = once; else { addr = STUB + 4 * imports.length; imports.push(n); }
      symaddr.push(addr); }
    const relocs = [];
    for (const [tag, sz] of [[17, 18], [23, 2]]) if (D[tag] != null) for (let o = D[tag]; o < D[tag] + D[sz]; o += 8) relocs.push([rd(o), rd(o + 4)]);
    for (const [off, info] of relocs) { const typ = info & 0xFF, si = info >>> 8, cur = rd(off);
      dv.setUint32(off, (typ === 23 ? cur + BASE : typ === 2 ? cur + symaddr[si] : symaddr[si]) >>> 0, true); }
    uc.mem_map(BASE, image.length, U.PROT_ALL);
    for (let o = 0; o < top; o += 0x100000) uc.mem_write(BASE + o, Array.from(image.subarray(o, Math.min(top, o + 0x100000))));
    const inits = []; for (let i = 0; i < (D[27] || 0) / 4; i++) { const a = rd(D[25] + 4 * i); if (a && a !== 0xFFFFFFFF) inits.push(a); }
    // import stubs are "bx lr"; a code hook does the work. pthread_once calls back into guest code, so it is real ARM.
    mwrite(STUB, words(new Array(0x2000).fill(0xE12FFF1E)));
    mwrite(once, words([0xE92D4010, 0xE5902000, 0xE3520000, 0x1A000002, 0xE3A02001, 0xE5802000, 0xE12FFF31, 0xE3A00000, 0xE8BD8010]));
    const RET = STUB + 0x9000;
    // ARM Linux kernel user helpers: cmpxchg, memory barrier, get_tls
    mwrite(0xFFFF0FC0, words([0xE5923000, 0xE0533000, 0x05821000, 0xE2730000, 0xE12FFF1E])); mwrite(0xFFFF0FA0, words([0xE12FFF1E])); mwrite(0xFFFF0FE0, words([0xEE1D0F70, 0xE12FFF1E]));
    uc.reg_write_i32(U.ARM_REG_C1_C0_2, uc.reg_read_i32(U.ARM_REG_C1_C0_2) | (0xF << 20)); uc.reg_write_i32(U.ARM_REG_FPEXC, 0x40000000); uc.reg_write_i32(U.ARM_REG_C13_C0_3, MISC + 0x8000);

    // ---- libc
    let aborted = null; const tls = {}, lazy = {};
    const R = i => rr(R0 + i), S = i => u32(rr(U.ARM_REG_SP) + 4 * i), keep = (k, b) => lazy[k] || (lazy[k] = blob(b));
    function hostMalloc(n) { let total = (n + 23) & ~15; if (total > 1024) total = 2 ** Math.ceil(Math.log2(total)); const brk = u32(ALLOC); w32(ALLOC, brk + total); w32(brk, total); return brk + 8; }
    function strto(bits, signed) { const s = str(R(0)); let base = R(2), m = /^[ \t\n\v\f\r]*([+-]?)(0[xX])?/.exec(s), i = m[0].length - (m[2] ? 2 : 0);
      if ((base === 0 || base === 16) && m[2]) { base = 16; i += 2; } else if (base === 0) base = s[i] === '0' ? 8 : 10;
      let j = i, v = 0n; for (; j < s.length; j++) { const dgt = parseInt(s[j], 36); if (!(dgt < base)) break; v = v * BigInt(base) + BigInt(dgt); }
      if (j === i) j = 0; if (R(1)) w32(R(1), R(0) + enc.encode(s.slice(0, j)).length);
      if (m[1] === '-') v = -v; if (signed) { const hi = (1n << BigInt(bits - 1)) - 1n; if (v > hi) v = hi; if (v < -hi - 1n) v = -hi - 1n; }
      v = BigInt.asUintN(bits, v); return bits === 32 ? Number(v) : [Number(v & 0xFFFFFFFFn), Number(v >> 32n)]; }
    function format(fmt, next) { // enough printf for the engine's own messages and libc++ number output
      return fmt.replace(/%([-+ #0]*)(\d+|\*)?(?:\.(\d+|\*))?(hh|h|ll|l|L|q|j|z|t)?([diuxXeEfFgGscp%])/g, (_, flags, width, prec, len, c) => {
        if (c === '%') return '%'; if (width === '*') width = next('i') | 0; if (prec === '*') prec = next('i') | 0; let out;
        const wide = len === 'll' || len === 'q' || len === 'j';
        if (c === 'd' || c === 'i') out = String(wide ? BigInt.asIntN(64, next('q')) : next('i') | 0);
        else if (c === 'u') out = String(wide ? next('q') : next('i') >>> 0); else if (c === 'x' || c === 'X') { out = (wide ? next('q') : BigInt(next('i') >>> 0)).toString(16); if (c === 'X') out = out.toUpperCase(); }
        else if (c === 's') { const a = next('i'); out = a ? str(a) : '(null)'; if (prec != null) out = out.slice(0, +prec); } else if (c === 'c') out = String.fromCharCode(next('i') & 255); else if (c === 'p') out = '0x' + (next('i') >>> 0).toString(16);
        else { const d = next('d'), p = prec == null ? 6 : +prec; out = !isFinite(d) ? (isNaN(d) ? 'nan' : d < 0 ? '-inf' : 'inf') : c === 'f' || c === 'F' ? d.toFixed(p) : c === 'e' || c === 'E' ? d.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2') : String(+d.toPrecision(p || 1)); }
        if (flags.includes('+') && /[dif-gF-G]/.test(c) && out[0] !== '-') out = '+' + out;
        const w = +width || 0; return flags.includes('-') ? out.padEnd(w) : flags.includes('0') && c !== 's' ? out.padStart(w, '0') : out.padStart(w); });
    }
    const vaList = ap => kind => { if (kind === 'i') { const v = u32(ap); ap += 4; return v; } ap = (ap + 7) & ~7; const lo = u32(ap), hi = u32(ap + 4); ap += 8; return kind === 'd' ? w2d(lo, hi) : BigInt(hi) << 32n | BigInt(lo); };
    const regArgs = first => { let pos = first; const word = k => k < 4 ? R(k) : S(k - 4); return kind => { if (kind === 'i') return word(pos++); pos += pos & 1; const lo = word(pos), hi = word(pos + 1); pos += 2; return kind === 'd' ? w2d(lo, hi) : BigInt(hi) << 32n | BigInt(lo); }; };
    function scan(text, fmt, next) { let n = 0, pos = 0;
      for (const m of fmt.matchAll(/%(hh|h|ll|l|L|q)?([diuxXfFeEgGp])|\s+|[^%\s]+/g)) { if (!m[2]) { if (/^\s/.test(m[0])) { while (/\s/.test(text[pos] || '')) pos++; continue; } if (text.startsWith(m[0], pos)) { pos += m[0].length; continue; } break; }
        while (/\s/.test(text[pos] || '')) pos++; const rest = text.slice(pos), isF = /[fFeEgG]/.test(m[2]);
        const t = (isF ? /^[+-]?(inf(inity)?|nan|(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?))/i : /[xXp]/.test(m[2]) ? /^[+-]?(0[xX])?[0-9a-fA-F]+/ : /^[+-]?\d+/).exec(rest); if (!t) break;
        const a = next('i'); if (isF) { const b = new DataView(new ArrayBuffer(8)); if (m[1]) { b.setFloat64(0, +t[0], true); mwrite(a, new Uint8Array(b.buffer)); } else { b.setFloat32(0, +t[0], true); mwrite(a, new Uint8Array(b.buffer, 0, 4)); } }
        else { const v = BigInt.asUintN(64, BigInt(/[xXp]/.test(m[2]) ? (t[0].startsWith('-') ? '-0x' : '0x') + t[0].replace(/^[+-]?(0[xX])?/, '') : t[0].replace(/^\+/, ''))); if (m[1] === 'll' || m[1] === 'q') { w32(a, Number(v & 0xFFFFFFFFn)); w32(a + 4, Number(v >> 32n)); } else w32(a, Number(v & 0xFFFFFFFFn)); }
        pos += t[0].length; n++; }
      return n; }
    const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0, zero = () => 0, m1 = f => () => d2w(f(w2d(R(0), R(1)))), m2 = f => () => d2w(f(w2d(R(0), R(1)), w2d(R(2), R(3))));
    const C = {
      strcmp: () => cmp(str(R(0)), str(R(1))), strncasecmp: () => cmp(str(R(0)).slice(0, R(2)).toLowerCase(), str(R(1)).slice(0, R(2)).toLowerCase()),
      memchr: () => { const i = mread(R(0), R(2)).indexOf(R(1) & 255); return i >= 0 ? R(0) + i : 0; }, strcpy: () => { mwrite(R(0), [...cstr(R(1)), 0]); return R(0); },
      strlcpy: () => { const s = cstr(R(1)); if (R(2)) mwrite(R(0), [...s.subarray(0, R(2) - 1), 0]); return s.length; }, wcscmp: () => { for (let i = 0; ; i += 4) { const a = u32(R(0) + i), b = u32(R(1) + i); if (a !== b || !a) return cmp(a, b); } },
      isspace: () => +[9, 10, 11, 12, 13, 32].includes(R(0)), isblank: () => +(R(0) === 9 || R(0) === 32), isupper: () => +(R(0) >= 65 && R(0) <= 90),
      tolower: () => R(0) >= 65 && R(0) <= 90 ? R(0) + 32 : R(0), toupper: () => R(0) >= 97 && R(0) <= 122 ? R(0) - 32 : R(0),
      strtol: () => strto(32, true), strtoul: () => strto(32, false), strtoll: () => strto(64, true), strtoull: () => strto(64, false), atoi: () => parseInt(str(R(0)), 10) | 0,
      ceilf: () => f2w(Math.ceil(w2f(R(0)))), nextafterf: () => R(0), __isfinite: () => +isFinite(w2d(R(0), R(1))), __signbit: () => R(1) >>> 31,
      __fpclassifyd: () => { const d = w2d(R(0), R(1)); return !isFinite(d) ? (isNaN(d) ? 2 : 1) : d === 0 ? 16 : Math.abs(d) < 2.2250738585072014e-308 ? 8 : 4; },
      scalbn: () => d2w(w2d(R(0), R(1)) * 2 ** (R(2) | 0)), modf: () => { const x = w2d(R(0), R(1)), whole = Math.trunc(x); mwrite(R(2), new Uint8Array(new Float64Array([whole]).buffer)); return d2w(x - whole); },
      lrint: () => Math.round(w2d(R(0), R(1))) | 0, llrint: () => { const v = BigInt.asUintN(64, BigInt(Math.round(w2d(R(0), R(1))))); return [Number(v & 0xFFFFFFFFn), Number(v >> 32n)]; },
      vasprintf: () => { const s = enc.encode(format(str(R(1)), vaList(R(2)))), a = hostMalloc(s.length + 1); mwrite(a, [...s, 0]); w32(R(0), a); return s.length; },
      fprintf: () => { const s = format(str(R(1)), regArgs(2)); if (typeof console !== 'undefined') console.warn('[engine] ' + s); return s.length; },
      vsscanf: () => scan(str(R(0)), str(R(1)), vaList(R(2))), sscanf: () => scan(str(R(0)), str(R(1)), regArgs(2)),
      fopen: zero, fclose: zero, fflush: zero, fread: zero, fwrite: () => R(2), fputc: () => R(0), fputwc: () => R(0), fseeko: () => -1, ftello: () => -1,
      open: () => 99, close: zero, read: () => { const b = new Uint8Array(R(2)); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(b); mwrite(R(1), b); return R(2); },
      pthread_self: () => 1, pthread_equal: () => +(R(0) === R(1)), pthread_key_create: () => { const k = Object.keys(tls).length + 1; tls[k] = 0; w32(R(0), k); return 0; },
      pthread_getspecific: () => tls[R(0)] || 0, pthread_setspecific: () => { tls[R(0)] = R(1); return 0; },
      gettimeofday: () => { const t = Date.now(); mwrite(R(0), words([Math.floor(t / 1000), (t % 1000) * 1000])); return 0; }, sysconf: () => R(0) === 39 || R(0) === 40 ? 4096 : 1,
      __errno: () => keep('errno', new Uint8Array(4)), strerror: () => keep('err', enc.encode('error\0')), setlocale: () => keep('loc', enc.encode('C\0')), strftime: () => { mwrite(R(0), [0]); return 0; },
      dl_unwind_find_exidx: () => { w32(R(1), exidx[1]); return exidx[0]; },
      abort: () => { aborted = 'abort() called'; uc.emu_stop(); }, raise: () => { aborted = 'raise() called'; uc.emu_stop(); }, __stack_chk_fail: () => { aborted = 'stack check failed'; uc.emu_stop(); },
      __assert2: () => { aborted = `assert failed: ${str(R(0))}:${R(1)} ${str(R(2))}: ${str(R(3))}`; uc.emu_stop(); },
      log: m1(Math.log), sqrt: m1(Math.sqrt), acos: m1(Math.acos), asin: m1(Math.asin), atan: m1(Math.atan), cos: m1(Math.cos), cosh: m1(Math.cosh), exp: m1(Math.exp), sin: m1(Math.sin), sinh: m1(Math.sinh), tan: m1(Math.tan), tanh: m1(Math.tanh),
      acosh: m1(Math.acosh), asinh: m1(Math.asinh), atanh: m1(Math.atanh), cbrt: m1(Math.cbrt), expm1: m1(Math.expm1), log1p: m1(Math.log1p), log10: m1(Math.log10), exp2: m1(x => 2 ** x), rint: m1(Math.round), nearbyint: m1(Math.round),
      logb: m1(x => Math.floor(Math.log2(Math.abs(x)))), atan2: m2(Math.atan2), fmod: m2((a, b) => a % b), pow: m2(Math.pow), hypot: m2(Math.hypot), remainder: m2((a, b) => a - b * Math.round(a / b)),
    };
    for (const n of ['pthread_mutex_lock', 'pthread_mutex_unlock', 'pthread_mutex_trylock', 'pthread_mutex_init', 'pthread_mutex_destroy', 'pthread_mutexattr_init', 'pthread_mutexattr_settype', 'pthread_mutexattr_destroy',
      'pthread_cond_wait', 'pthread_cond_broadcast', 'pthread_cond_signal', 'pthread_cond_destroy', 'pthread_cond_timedwait', 'pthread_join', 'pthread_detach', 'pthread_key_delete', 'sched_yield', 'nanosleep',
      '__cxa_atexit', '__cxa_finalize', 'getenv', 'dlopen', 'dlsym']) C[n] = zero;
    uc.hook_add(U.HOOK_CODE, (_, address) => {
      const fn = C[imports[(Number(address) - STUB) >>> 2]];
      if (!fn) { aborted = 'unimplemented import ' + imports[(Number(address) - STUB) >>> 2]; return uc.emu_stop(); }
      const r = fn(); if (r == null) return;
      if (Array.isArray(r)) { rw(R0, r[0]); rw(R0 + 1, r[1]); } else rw(R0, r);
    }, null, STUB, STUB + 4 * imports.length);

    function call(addr, a0) {
      rw(R0, a0 || 0); rw(R0 + 1, 0); rw(R0 + 2, 0); rw(U.ARM_REG_SP, STACK + STACK_SIZE - 0x1000); rw(U.ARM_REG_LR, RET);
      uc.emu_start(addr, RET, 0, 0);
      if (aborted) { const m = aborted; aborted = null; throw new Error(m); }
      return rr(R0);
    }
    for (const fn of inits) call(fn, 0);
    call(sym.ai_init);
    const run = text => { const data = enc.encode(text); if (data.length + 1 > CMDBUF_SIZE) throw new Error('command too long'); mwrite(CMDBUF, data); mwrite(CMDBUF + data.length, [0]); call(sym.ai_cmd, CMDBUF); return str(call(sym.get_g_ss)); };

    // ---- Resuming the replay. The engine is stateless: every command replays record.all_moves from the start, so each call
    // costs ~100k ARM instructions more per move already played. ai_cmd parses the record, sets the game up (SETUP..), then
    // replays in the loop at LOOP_CMP..LOOP_EXIT (r4 walks the json11 vector of moves at [r7+0xa68, r7+0xa6c); each step calls
    // 0x102b89a4(game 0x103b00b0, state STATE, move)). The game lives in the engine's globals plus heap blocks they point to.
    // Everything allocated from SETUP to LOOP_EXIT goes to a second heap arena (B); at LOOP_EXIT the globals (minus the
    // parsed command at [r7, STATE)) and arena B are saved. A later command whose record extends the saved one is sent with
    // only its new moves, the saved game is put back at LOOP_CMP, and the loop replays just those. Replies are byte-identical
    // to a full replay (checked against tools/tfg.py over many records).
    const SETUP = 0x100866e8, LOOP_CMP = 0x1008671c, LOOP_EXIT = 0x1008681c, STATE = 0x10a75410, TABLE = 392, B_START = HEAP + HEAP_SIZE, B_SIZE = 0x00800000;
    // The engine's own memory pool (one 16 MB block from ai_init at POOL) holds the game objects and the move history (Celebi's Time
    // Travel reads it); POOL_CURSOR points near its high-water mark. LOOP_WORDS are the two spots in the parsed-command area the loop writes.
    const POOL = 0x30001000, POOL_CURSOR = 0x103b3568, POOL_MARGIN = 0x10000, SMALL = [0x31001000, 0x80], LOOP_WORDS = [[0x10a7486c, 4], [0x10a74d34, 0x14]];
    uc.mem_map(B_START, B_SIZE, U.PROT_ALL);
    const handle = () => U.getValue(uc.handle_ptr, '*');
    const readFast = (a, n) => { const p = U._malloc(n); U.ccall('uc_mem_read', 'number', ['pointer', 'number', 'pointer', 'number'], [handle(), BigInt(a), p, BigInt(n)]); const out = U.HEAPU8.slice(p, p + n); U._free(p); return out; };
    const tables = { A: null, B: Uint8Array.from(words([B_START, ...new Array(TABLE / 4 - 1).fill(0)])) };
    let arena = 'A', snap = null, job = null;   // snap: { key, moves, data, heapB, table }; job: this command { key, moves, resume }
    const toArena = to => { if (arena === to) return; tables[arena] = readFast(ALLOC, TABLE); uc.mem_write(ALLOC, tables[to]); arena = to; };
    uc.hook_add(U.HOOK_CODE, () => toArena('B'), null, SETUP, SETUP);
    uc.hook_add(U.HOOK_CODE, () => {
      if (!(job && job.resume)) return;
      const r7 = R(7), [rwStart] = rwSeg;
      uc.mem_write(rwStart, snap.data.subarray(0, r7 - rwStart)); uc.mem_write(STATE, snap.data.subarray(STATE - rwStart));
      for (const [a, n] of LOOP_WORDS) uc.mem_write(a, snap.data.subarray(a - rwStart, a - rwStart + n));
      uc.mem_write(B_START, snap.heapB); uc.mem_write(ALLOC, snap.table); uc.mem_write(POOL, snap.pool); uc.mem_write(SMALL[0], snap.small);
    }, null, LOOP_CMP, LOOP_CMP);
    uc.hook_add(U.HOOK_CODE, () => {
      if (job) { const bump = u32(ALLOC); snap = { key: job.key, moves: job.moves, data: readFast(rwSeg[0], rwSeg[1]), heapB: readFast(B_START, bump - B_START), table: readFast(ALLOC, TABLE), pool: readFast(POOL, u32(POOL_CURSOR) + POOL_MARGIN - POOL), small: readFast(SMALL[0], SMALL[1]) }; }
      toArena('A');
    }, null, LOOP_EXIT, LOOP_EXIT);
    uc.hook_add(U.HOOK_CODE, () => {   // a block freed while the other arena is live goes back to the arena it came from
      const p = R(0); if (!p) return;
      const owner = p >= B_START ? 'B' : 'A'; if (owner === arena) return;
      const blk = p - 8, sz = u32(blk), off = sz <= 1024 ? sz >>> 2 : 260 + 4 * (32 - Math.clz32(sz - 1)), t = new DataView(tables[owner].buffer, tables[owner].byteOffset);
      w32(blk + 8, t.getUint32(off, true)); t.setUint32(off, blk, true); rw(U.ARM_REG_PC, rr(U.ARM_REG_LR));
    }, null, NATIVE + NATIVE_AT.free, NATIVE + NATIVE_AT.free);

    return {
      cmd(text) {
        job = null;
        try {
          const o = JSON.parse(text), r = o.record;
          if (r && Array.isArray(r.all_moves)) {
            const rest = Object.assign({}, r); delete rest.all_moves; delete rest.seeds;
            const seeds = r.seeds || [], key = JSON.stringify(rest), moves = r.all_moves.map((m, i) => JSON.stringify(m) + '|' + JSON.stringify(seeds[i] === undefined ? null : seeds[i]));
            // not for the AI (go): its search does not give the same move from a resumed game, so it always replays in full
            const resume = o.cmd !== 'go' && !!snap && snap.key === key && snap.moves.length <= moves.length && snap.moves.every((m, i) => m === moves[i]);
            if (resume) { const n = snap.moves.length; o.record = Object.assign({}, r, { all_moves: r.all_moves.slice(n), seeds: seeds.slice(n) }); text = JSON.stringify(o); }
            job = { key, moves, resume };
          }
        } catch (e) { job = null; }
        try { return run(text); }
        catch (e) { snap = null; throw e; }
        finally { toArena('A'); }
      },
    };
  };
});
