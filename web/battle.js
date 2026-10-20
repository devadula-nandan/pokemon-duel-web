// The battle screen and the wheel drawing, shared by the game (index.html) and Storybook. Exposes wheelSvg, pieceText, DISK_COL and
// Battle.run / declare / close / say. Needs data.js (DUEL_DATA) and sound.js (sfx).
(() => {
  const D = DUEL_DATA, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // A figure's wheel, drawn as a data disk the way the original shows it: a thick black rim, flat wedges with a sunburst of fine stripes and
  // thin black dividers, a black ring for a hub, the attack's name spaced out along the rim and its damage (or stars) large beneath it.
  // All lettering stands with its feet on the rim and its head towards the hub, so a wedge reads upright when it is at the bottom of the disk.
  // Small wheels (under 130 px) leave the names out.
  const DISK_COL = ['#f05353', '#ffffff', '#ce72ec', '#f0d74e', '#59c9f8'];   // Miss, white, purple, gold, blue (SkillColorEnum.ToColor)
  // Roulette.GetRouletteText: White and Gold print the damage as the attack's format asks (none, N, N+, Nx), Purple a star per point, the rest
  // nothing. A Z-Move's wheel always prints its number (Roulette.SetZSkill).
  const pieceText = (id, val, col, z) => col === 2 ? '★'.repeat(Math.max(0, val || 0)) : col === 1 || col === 3 ? (['', String(val || 0), (val || 0) + '+', (val || 0) + 'x'][z ? 1 : (D.skills[id] || [])[3] || 0] || '') : '';
  let wheelSeq = 0;
  function wheelSvg(skills, size, battle) {   // battle: the battle screen's wheel, in its 3D frame (RouletteWakuMesh + RouletteFrame): pieces to 0.875 of
    // the frame's 0.965, a black ring with a grey line at 0.936, and a small black hub (0.109) with a grey ring at 0.080
    const id = 'wh' + (++wheelSeq), names = size >= 130, R = battle ? 90.7 : 88, ang = t => t / 96 * 2 * Math.PI, pt = (t, r) => [100 + r * Math.sin(ang(t)), 100 - r * Math.cos(ang(t))];
    let a = 0, wedges = '', text = '', defs = '', rays = '';
    for (let k = 0; k < 96; k += 2) { const [x1, y1] = pt(k, R), [x2, y2] = pt(k + 1, R); rays += `M100 100L${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}Z`; }
    skills.filter(x => x.range > 0).forEach((x, n) => {
      const sk = x.sealed ? ['Miss', '', 0] : D.skills[x.id] || ['', '', 0], col = sk[2], a2 = a + x.range, mid = (a + a2) / 2, ink = col === 2 ? '#fff' : '#111', big = x.range > 48 ? 1 : 0;
      const [x1, y1] = pt(a, R), [x2, y2] = pt(a2, R);
      wedges += x.range >= 96 ? `<circle cx="100" cy="100" r="${R}" fill="${DISK_COL[col]}"/>` : `<path d="M100 100L${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}Z" fill="${DISK_COL[col]}" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`;
      const val = pieceText(x.id, x.speed_or_damage, col, x.z);
      if (names && x.range >= 4) {   // the name runs anticlockwise just inside the rim, which is what stands it feet-out; a thin wedge gets small lettering
        const fs = x.range >= 12 ? 9.5 : x.range >= 8 ? 7.5 : 5, gap = x.range >= 16 ? 2.4 : x.range >= 12 ? 1.6 : .6, room = Math.floor(x.range * 5.1 / (fs * .62 + gap)), name = sk[0].length > room ? sk[0].slice(0, Math.max(1, room - 1)) + '…' : sk[0];
        const [p1x, p1y] = pt(a2 - .5, 79), [p2x, p2y] = pt(a + .5, 79);
        defs += `<path id="${id}p${n}" d="M${p1x} ${p1y}A79 79 0 ${big} 0 ${p2x} ${p2y}"/>`;
        text += `<text font-size="${fs}" font-weight="500" letter-spacing="${gap}" fill="${ink}"><textPath href="#${id}p${n}" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text>`;
      }
      if (val && x.range >= 8) {
        const [vx, vy] = pt(mid, names ? 52 : 56), deg = mid / 96 * 360 + 180, fs = col === 2 ? (names ? 12 : 15) : Math.min(names ? 26 : 26, 9 + x.range * .55);
        text += `<text x="${vx}" y="${vy}" font-size="${fs}" font-weight="800" fill="${ink}" text-anchor="middle" dominant-baseline="central" transform="rotate(${deg} ${vx} ${vy})">${val}</text>`;
      }
      a = a2;
    });
    return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" style="display:block"><defs>${defs}<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <circle cx="100" cy="100" r="99" fill="#0b0b0c"/>${wedges}<path d="${rays}" fill="#000" opacity=".085"/>${text}
      ${battle ? `<circle cx="100" cy="100" r="95.35" fill="none" stroke="#000" stroke-width="9.3"/><circle cx="100" cy="100" r="97" fill="none" stroke="#7d7d7d" stroke-width=".6"/>
      <circle cx="100" cy="100" r="11.3" fill="#000"/><circle cx="100" cy="100" r="8.3" fill="none" stroke="#4c4c4c" stroke-width=".5"/></svg>` : `<circle cx="100" cy="100" r="93.5" fill="none" stroke="#0b0b0c" stroke-width="11"/><circle cx="100" cy="100" r="96.5" fill="none" stroke="url(#${id}s)" stroke-width="2.2"/><circle cx="100" cy="100" r="88.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".9"/>
      <circle cx="100" cy="100" r="11.5" fill="#1a1a1c" stroke="#0b0b0c" stroke-width="5.5"/><circle cx="100" cy="100" r="13.6" fill="none" stroke="url(#${id}s)" stroke-width="1.6"/></svg>`}`;
  }
  // ---------- the battle screen ----------
  // A port of the original's: MatchMain.BattleInfo / StartSpin / SpinTouchStop / BattleSpin / SpinEndWait / BattleResult, Roulette (spin, stop,
  // More, shift, damage notices) and SpinSkillDataUI (each side's attack and damage in its corner).
  //  - It opens with a 0.3 s fade (Se233); 0.5 s later each wheel slides in along the line between them (BattleStartMove).
  //  - Both wheels start turning by themselves (StartSpin: a turn every 0.2166 s, Se036 looping). A player in the duel stops them with a tap
  //    (Se223_2), or they stop by themselves after 3 s. Each then eases onto its result over at least a turn (0.65 s per 680 degrees).
  //  - A stop plays Se037, or Se060 when it lands on a Miss. A shift (confusion and the like) waits 0.5 s and turns 0.3 s to the next piece.
  //  - "MORE" (a spin again, Fire Spin and the like): 0.5 s later Se059, a step higher each time, and the wheel whirls six turns, faster each time.
  //  - The engine's damage notices are shown as the original shows them: the name and damage, the damage running to each new value in 0.3 s,
  //    "×N" for each landing of a multiplying attack, "＋N" for a support attack, one change a second; then, 0.7 s after the wheels, the result.
  //  - The result: Se061 when your side wins, Se063 for a draw. The original then shows the two figures fighting on a 3D stage
  //    (BattleController); here the winner's wheel lights, the loser's dims and a flare crosses the middle. Then a 0.3 s fade to the table.
  // Layout: the roulette camera is orthographic and shows 1.4 units from the middle to the top edge. A wheel is 0.9 units in radius (mesh 0.5
  // x Rot 1.5 x Show 1.2) in a frame that meets the other one at the middle; the centres sit 0.41615 across and 0.86275 up or down from it,
  // yours below and to the left (the camera looks back along the table). The corner panels are placed in the 750 x 1334 UI Root's units.
  const LEAN = 25.75;   // atan(0.41615 / 0.86275): the line through the two wheel centres, from the vertical
  const EASE_OUT = 'cubic-bezier(.39,.575,.565,1)';   // NGUI UITweener.Method.EaseOut (a quarter sine)
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sfx = (n, p) => { if (window.sfx) window.sfx(n, p); };
  // DamageNoticeManager: each *_damage_notice names what changed the damage (its kind) and carries the change (a set, a sum, a product or a
  // product sum). An ability's change is filed as a plate's (MatchMain.PokePowerDamageNotice calls PlateDamageNotice), and a base notice keeps
  // only a set or a product sum. The result of the battle is added last, under the support attack when one stood in.
  const NOTICE_KIND = { base_damage_notice: 'Base', skill_damage_notice: 'Skill', plate_damage_notice: 'Plate', pokepower_damage_notice: 'Plate', condition_damage_notice: 'Condition',
    triangle_damage_notice: 'Triangle', mist_damage_notice: 'Mist', techno_charge_damage_notice: 'TechnoCharge', support_skill_damage_notice: 'SupportSkill' };
  function damageNotices(list, key, same, res, support) {
    const out = [];
    for (const e of list || []) {
      const v = e.value || e; if (!same(v.pokemon, key)) continue;
      const kind = NOTICE_KIND[v.type] || 'Other', d = v.value || {}, n = { kind, skillId: v.skill_id, condition: v.condition };
      if (d.type === 'damage_set_notice') n.set = Object.assign({}, d);
      else if (d.type === 'damage_sum_notice') { if (kind === 'Base') continue; n.sum = Object.assign({}, d); }
      else if (d.type === 'damage_product_notice') { if (kind === 'Base') continue; n.product = Object.assign({}, d); }
      else if (d.type === 'damage_product_sum_notice') n.productSum = Object.assign({}, d);
      else continue;
      out.push(n);
    }
    if (res) out.push({ kind: 'Result', skillId: support != null ? support : res.skill, resultVal: res.speed_or_damage });
    return out;
  }
  // SpinSkillDataUI: the attack's name, an added part ("×3", "＋20"), the damage (running to each new value in 0.3 s) and "Sealed".
  class SpinPanel {
    constructor(stage, slot) {
      this.el = document.createElement('div'); this.el.className = 'sdp ' + slot; this.el.hidden = true;
      this.el.innerHTML = '<i class="bg"></i><span class="nmr"><b class="nm"></b><span class="add"></span></span><span class="dmg"></span><span class="imp">Sealed</span>';
      stage.appendChild(this.el); [this.nm, this.add, this.dmg, this.imp] = ['.nm', '.add', '.dmg', '.imp'].map(q => this.el.querySelector(q));
      this.reserved = false; this.reset(); this.init();
    }
    reset() { this.damage = 0; this.now = 0; this.base = 0; this.mult = 0; this.baseMult = 0; }
    init() { this.reset(); this.name = ''; this.nm.textContent = this.add.textContent = this.dmg.textContent = ''; this.imp.hidden = true; }
    hide() { this.el.hidden = true; this.el.classList.remove('open'); }
    text(t) {
      if (this.reserved) { this.imp.hidden = false; this.reserved = false; }
      this.nm.textContent = this.name = t || '';
      if (this.el.hidden) { this.el.hidden = false; this.el.classList.remove('open'); void this.el.offsetWidth; this.el.classList.add('open'); }   // the panel opens in 0.1 s
    }
    value(d) {
      this.text(this.name);
      if (d == null) { this.dmg.textContent = ''; return; }
      if (this.damage === 0) { this.dmg.textContent = String(d); this.now = d; }
      this.damage = Math.max(d, 0); this.base = this.now; this.run();
    }
    named(name, d) { this.name = name; this.value(d); }
    speed(name, s) { this.name = name; this.value(null); this.dmg.textContent = s; }
    run() {   // SpinSkillDataUI.Update: the damage and the "×N" run from where they were to the new values in 0.3 s
      const t0 = performance.now(), from = this.base, to = this.damage, m0 = this.baseMult, m1 = this.mult;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 300);
        this.now = Math.round(from + (to - from) * k); this.dmg.textContent = String(this.now);
        const m = Math.floor(m0 + (m1 - m0) * k); if (m > 0) this.add.textContent = '×' + m;
        if (k < 1) this.raf = requestAnimationFrame(step); else { this.base = this.damage; this.baseMult = this.mult; }
      };
      cancelAnimationFrame(this.raf); step();
    }
    multiplier(n) { this.baseMult = this.mult; this.mult = Math.max(n, 0); }
    addMultiplier(n = 1) { this.multiplier(this.mult + n); }
    productMultiplier(n) { if (this.mult <= 0) this.mult = 1; this.multiplier(this.mult * n); }
    addend(n) { this.add.textContent = n <= 0 ? String(n) : '＋' + n; }
    effect(kind) { this.el.classList.remove('buff', 'debuff'); void this.el.offsetWidth; this.el.classList.add(kind); }   // Main_Buff_fx_UI / Main_Debuff_fx_UI
  }
  // Roulette: one figure's wheel on the battle screen.
  class BattleWheel {
    constructor(view, k, key, info, slot) {
      Object.assign(this, { view, k, key, info, slot, rot: 0, raf: 0, pich: 0, notices: [], stops: [], damage: 0, resultSkill: -1, displacement: false });
      this.el = $('w' + k); this.disk = $('bd' + k);
      const starts = []; let a = 0;
      this.pieces = info.skills.filter(x => x.range > 0).map(x => { const col = x.sealed ? 0 : (D.skills[x.id] || [0, 0, 0])[2];
        starts.push(a); a += x.range;
        return { id: x.id, range: x.range, col, val: x.speed_or_damage || 0, name: x.sealed ? (D.skills[1131] || ['Miss'])[0] : (D.skills[x.id] || ['?'])[0],
          z: !!x.z, imprison: info.marker.triangle === 'imprison' && info.marker.skill_id === x.id }; });
      this.starts = starts; this.base = slot === 'up' ? 180 + LEAN : LEAN;
      const m = this.el && /rotate\(([-\d.]+)deg\)/.exec(this.el.style.transform || ''); if (m) this.rot = +m[1];
    }
    angle(pos) { return this.base - pos / 96 * 360; }
    pieceAt(num) { let a = 0; for (let n = 0; n < this.pieces.length; n++) { a += this.pieces[n].range; if (a > num) return n; } return 0; }
    paint(sec, ease) { if (!this.el) return; this.el.style.transition = sec ? `transform ${sec}s ${ease}` : 'none'; this.el.style.transform = `rotate(${this.rot}deg)`; }
    startLoop() {   // Roulette.StartSpin(1): a linear turn every 0.1666 s x 1.3
      if (this.raf || this.info.frozen) return; let last = performance.now();
      const f = t => { this.rot += (t - last) * 360 / 216.6; last = t; this.paint(); this.raf = requestAnimationFrame(f); };
      this.raf = requestAnimationFrame(f);
    }
    stopLoop() { cancelAnimationFrame(this.raf); this.raf = 0; }
    async turnTo(to, sec) { this.rot = to; this.paint(sec * this.view.pace, EASE_OUT); await this.view.wait(sec * 1000); }
    async stopAt(sec, num) {   // Roulette.SetSpinTweenRotate: from a turning wheel, onto the result over at least one more turn; from a standing one, six turns
      const target = this.angle(num + .01 + Math.random() * .98); let to = target;
      if (this.raf) { this.stopLoop(); while (to < this.rot + 360) to += 360; await this.turnTo(to, sec * 1.3 * (to - this.rot) / 680); }
      else { while (to < this.rot + 1800) to += 360; await this.turnTo(to, sec * 1.3); }
    }
    async shift(d, now) {   // Roulette.Displace: 0.3 s to the middle of the piece d along, the way it points
      const L = this.pieces.length, t = ((this.pieceAt(now) + d) % L + L * 10) % L; let to = this.angle(this.starts[t] + this.pieces[t].range / 2);
      if (d >= 0) { while (to < this.rot) to += 360; } else { while (to > this.rot) to -= 360; }
      await this.turnTo(to, .3); return t;
    }
    showPiece(p) { if (p.col === 2) this.panel.speed(p.name, pieceText(p.id, p.val, 2)); else this.panel.named(p.name, (p.col === 1 || p.col === 3) && p.val > 0 ? p.val : null); }
    resultName() { return (D.skills[this.resultSkill] || [''])[0]; }
    initNotices() {   // Roulette.InitDamageNotices: a base set or product sum is folded into the attack's own product
      const base = this.notices.filter(n => n.kind === 'Base'), skill = this.notices.filter(n => n.kind === 'Skill');
      if (base.length && skill.length) {
        if ((base[0].productSum || base[0].set) && skill[0].productSum) { skill[0].productSum.multiplier++; this.notices.splice(this.notices.indexOf(base[0]), 1); }
        else if ((base[0].productSum || base[0].set) && skill[0].product) this.notices.splice(this.notices.indexOf(base[0]), 1);
      }
      const r = this.notices.find(n => n.kind === 'Result'); if (r) this.resultSkill = r.skillId;
    }
    effectOf(n) {   // SpinSkillDataUI.CreateEffect: a condition's damage has its own sound and ticker line; a plate's (or an ability's) is a buff or a debuff
      const p = this.panel;
      if (n.kind === 'Condition') { const s = { poison: 'st_poison', bad_poison: 'st_bad_poison', burn: 'st_burn' }[n.condition]; if (s) { this.view.sound(s); this.view.tick(this.key, `${this.view.name(this.key)}: ${this.view.condName(n.condition)} lowers its damage.`); } }
      else if (n.kind === 'Plate' || n.kind === 'TechnoCharge') { const down = n.sum && n.sum.addend <= 0; p.effect(down ? 'debuff' : 'buff'); this.view.sound(down ? 'mp_down' : 'mp_up'); }
      else if (n.kind === 'Mist') { const down = n.productSum && n.productSum.multiplier <= 0; p.effect(down ? 'debuff' : 'buff'); this.view.sound(down ? 'mp_down' : 'mp_up'); }
    }
    calc(spinning) {   // Roulette.DamageNoticeCalc
      if (!this.notices.length) return;
      let n;
      if (spinning) { n = this.notices.find(x => x.kind === 'Skill' || x.kind === 'Base'); if (!n) return; if (n.kind === 'Base') this.notices.splice(this.notices.indexOf(n), 1); }
      else n = this.notices[0];
      this.effectOf(n);
      const p = this.panel, last = this.last || {}, battle = this.view.battle, left = this.stops.length;
      if (n.kind === 'Result') {   // DamageResultNotice
        const q = this.pieces.find(x => x.id === n.skillId); if (!q) return;
        if (q.col === 2) p.speed(q.name, pieceText(q.id, n.resultVal, 2));
        else p.named(q.name, (q.col === 1 || q.col === 3) && (n.resultVal > 0 || q.val > 0) ? n.resultVal : null);
      } else if (n.set) { if (battle) p.named((D.skills[n.skillId] || [''])[0], n.set.result !== 0 ? n.set.result : null); }
      else if (n.sum) {
        if (left > 0) { this.damage = n.sum.result; if (battle) p.named(this.resultName(), this.damage); }
        else if (battle) { p.text(this.resultName()); p.value(n.sum.result); }
        if (n.kind === 'SupportSkill') p.addend(n.sum.addend);
        if (spinning) { const b = this.notices.findIndex(x => x.kind === 'Base'); if (b >= 0) this.notices.splice(b, 1); }
      } else if (n.productSum) {   // DamageProductSumNotice: a multiplying attack adds its damage for each landing
        const ps = n.productSum;
        if (left <= 1) { if (battle) { p.named(this.resultName(), ps.result); if ((n.kind === 'Skill' || n.kind === 'SupportSkill') && n.skillId === last.id) p.addMultiplier(ps.multiplier); } }
        else if (n.skillId === last.id) {
          if (ps.current >= 0) { this.damage = n.kind !== 'Base' ? ps.current : ps.result; ps.current = -1; }
          else if (ps.multiplier > 0) { this.damage += ps.multiplicand; ps.multiplier--; }
          if (battle) { p.named(this.resultName(), this.damage); if (n.kind !== 'Base') p.addMultiplier(); }
        } else if (ps.multiplier > 1 && left === 1) { this.damage = ps.result; if (battle) p.named(this.resultName(), this.damage); }
        else if (battle) p.value(ps.result);
        if (n.kind === 'Base') { const b = this.notices.indexOf(n); if (b >= 0) this.notices.splice(b, 1); }
      } else if (n.product) {   // DamageProductNotice
        const pr = n.product;
        if (pr.multiplier > 1 && left === 1) { if (battle) { p.named(this.resultName(), pr.result); p.productMultiplier(pr.multiplier); } }
        else if (n.skillId === last.id) { if (pr.multiplier > 0) { this.damage += pr.current; pr.multiplier--; } if (battle) { p.named(this.resultName(), this.damage); p.addMultiplier(); } }
        else { p.value(pr.result); p.productMultiplier(pr.multiplier); }
      }
    }
    async damageDisp(delay = true) {   // Roulette.DamageDisp / DamageDispNext: every change but the attack's own, one a second
      this.notices = this.notices.filter(n => n.kind !== 'Skill'); if (!this.notices.length) return;
      if (this.notices.length > 1) this.dispDelay = .5;
      await this.view.wait(delay ? (this.dispDelay || 0) * 1000 : 0); this.dispDelay = .5;
      for (;;) {
        this.calc(false); if (!this.notices.length) return;
        const kind = this.notices.shift().kind;
        if (!this.notices.length || kind === 'Result' || this.notices.every(n => n.kind === 'Result')) return;   // IsSpin: the result waits for SpinEndWait
        await this.view.wait(1000);
      }
    }
    darken(landed, a) {   // Roulette.SpinNext: the other pieces go dark
      if (!this.el) return; const old = this.el.querySelector('.dimw'); if (old) old.remove();
      const pt = (t, r) => [100 + r * Math.sin(t / 96 * 2 * Math.PI), 100 - r * Math.cos(t / 96 * 2 * Math.PI)];
      this.el.insertAdjacentHTML('beforeend', `<svg class="dimw" viewBox="0 0 200 200">${this.pieces.map((y, n) => { if (n === landed || this.pieces.length < 2) return ''; const [x1, y1] = pt(this.starts[n], 90.7), [x2, y2] = pt(this.starts[n] + y.range, 90.7); return `<path d="M100 100L${x1} ${y1}A90.7 90.7 0 ${y.range > 48 ? 1 : 0} 1 ${x2} ${y2}Z" fill="#000" opacity="${a}"/>`; }).join('')}</svg>`);
    }
    fx(kind, ms) { if (!this.disk) return null; const d = document.createElement('div'); d.className = 'bfx ' + kind; this.disk.appendChild(d); if (ms) setTimeout(() => d.remove(), ms * this.view.pace); return d; }
    async run(stops, stopSec) {   // Roulette.StopSpin and what follows each stop
      this.stops = stops.slice(); this.damage = 0; this.pich = 0; this.initNotices(); this.panel.init();
      const old = this.el && this.el.querySelector('.dimw'); if (old) old.remove();
      if (this.info.frozen || !this.pieces.length || !this.stops.length) return;   // MatchMain.BattleSpin: a frozen wheel does not stop again
      const battle = this.view.battle; let sec = stopSec;
      if (this.displacement) {   // Roulette.SetDisplacement: a declared shift moves from the piece it stood on to the new result
        this.displacement = false; const now = this.lastTarget != null ? this.lastTarget : this.stops[0].num;
        const L = this.pieces.length, t = await this.shift(((this.pieceAt(this.stops[0].num) - this.pieceAt(now)) % L + L) % L, now);
        this.last = this.pieces[t]; if (battle) this.showPiece(this.last); this.stops = []; this.darken(t, .5); return;
      }
      for (;;) {
        const r = this.stops[0]; this.view.turning++;
        await this.stopAt(sec, r.num); this.lastTarget = r.num;
        if (--this.view.turning <= 0) this.view.soundOff();
        let landed = this.pieceAt(r.num);
        this.view.sound(this.pieces[landed].col === 0 ? 'miss' : 'spin_stop');
        if (r.displace) {
          if (this.info.marker.circle === 'panic') { this.fx('panic', 3000); this.view.sound('st_panic'); this.view.tick(this.key, `${this.view.name(this.key)} is confused!`); }
          await this.view.wait(500); landed = await this.shift(r.displace, r.num);
          this.view.tick(this.key, `${this.view.name(this.key)}: the result moved ${Math.abs(r.displace)} piece${Math.abs(r.displace) === 1 ? '' : 's'}.`);
          this.last = this.pieces[landed];
          if (!this.notices.some(n => n.kind === 'Skill') && battle) this.showPiece(this.last); else this.calc(true);
        } else {
          this.last = this.pieces[landed];
          if (this.notices.every(n => n.kind !== 'Skill' && n.kind !== 'Base')) { if (battle && this.stops.length === 1 && !this.notices.length) this.showPiece(this.last); }
          else this.calc(true);
        }
        const imprisoned = this.last.imprison && r.type === 'battle';   // SpinNext: a sealed attack does not spin on
        if (this.stops.length > 1 && !imprisoned) {   // MoreSpin
          this.stops.shift(); this.fx('more', 2000);
          await this.view.wait(500); this.view.sound('multiplier', this.pich); this.pich += 2; this.view.soundOn();
          sec = Math.min(1, Math.max(.1, sec * .6)); continue;
        }
        this.stops = [];
        const shown = this.damageDisp();
        if (battle) { this.panel.text(this.resultName()); if (imprisoned) this.showPiece(this.last); }
        const L = this.pieces.length; this.darken(((this.pieceAt(r.num) + (r.displace || 0)) % L + L) % L, battle ? .5 : .8);
        await shown; return;
      }
    }
  }
  const battleMark = text => { const t = String(text || ''); return t.includes('win') ? 1 : t.includes('draw') ? 0 : t.includes('lose') ? -1 : null; };   // the original matches with IndexOf
  // The live-ticker strip at the top of the battle screen (LiveTickerRoot: black, 47 high): one line, typed out
  async function say(text, color) {
    const el = document.querySelector('#battle:not([hidden]) .lt'); if (!el) return;
    const job = (say.job = (say.job || 0) + 1); el.style.color = color || '#fff';
    for (let n = 1; n <= text.length && job === say.job; n++) { el.textContent = text.slice(0, n); await sleep(30); }
  }
  let gen = 0;   // close() ends every screen still running (a story switched mid-battle)
  function close() { gen++; if (window.sfxStop) { sfxStop('spin'); sfxStop('roulette'); } const ov = $('battle'); if (ov) { ov.hidden = true; ov.innerHTML = ''; } }
  // One spin on the battle screen. spec:
  //   host      the element the screen covers                view   what run() returned for the spin before (a respin keeps it), or null
  //   spins     [{ key, info: { skills, frozen, marker }, results }]: each spinning figure, its wheel and the engine's stops
  //   slotOf    (key, keys) -> 'dn' (yours), 'up' or 'row'    battle  a battle (not a spin of its own)   hold  more spins of this battle follow
  //   result    the battle_result's value, or null            notices the engine's *_damage_notice records    human  a player is in the duel
  //   same(a, b) the same figure                              mine(side) the result side that is yours        tick(key, text), name(key), condName(c)
  //   strike(winner, piece) the sound of the winning hit (optional)
  // Returns the view to pass to the next spin of the same battle.
  async function run(spec) {
    const same = spec.same || ((a, b) => a === b), spins = spec.spins, ids = spins.map(s => s.key), battle = spec.battle || !!(spec.view && spec.view.battle);
    const keep = !!(spec.view && spec.view.ids && ids.length && ids.every(id => spec.view.ids.some(x => same(x, id))) && $('bd0'));   // a respin turns the wheel that is already there
    let ov = $('battle');
    if (!ov) { ov = document.createElement('div'); ov.id = 'battle'; spec.host.appendChild(ov); }
    let view = spec.view;
    if (!keep) {
      const row = ids.length > 2, solo = ids.length === 1;
      ov.hidden = false; ov.innerHTML = `<div class="stage${row ? ' row' : solo ? ' solo' : ''}${battle ? ' open' : ''}">${spins.map((sp, k) =>
        `<div class="bdisk ${spec.slotOf(sp.key, ids)}${battle ? ' wait' : ''}" id="bd${k}"><div class="spin" id="w${k}">${wheelSvg(sp.info.skills, 440, true)}</div></div>`).join('')
      }<div class="flare" id="flare"></div><div class="sparks" id="sparks">${Array.from({ length: 14 }, (_, k) => `<i style="--a:${(k % 2 ? 180 + LEAN : LEAN) + ((k * 37) % 44) - 22}deg;--l:${26 + (k * 53) % 60}px;--far:${70 + (k * 29) % 120}px;--t:${(k % 5) * .05}s"></i>`).join('')}</div><div class="gem"></div><div class="lt"></div><button class="skip" data-v="ok">Skip</button></div>`;
      view = { battle, ids, wheels: [], support: {}, started: false, turning: 0, result: view && view.result };
    } else view.battle = view.battle || battle;
    const stage = ov.querySelector('.stage');
    let shut = false; const g = gen, stopped = () => { if (gen !== g) shut = true; return shut; };
    const done = new Promise(res => { ov.onclick = ev => { if (ev.target.closest('[data-v]')) { shut = true; view.soundOff(); res(); } }; });
    Object.assign(view, { pace: spec.human ? 1 : .25,   // a duel between two computers plays at four times the speed
      wait: ms => stopped() ? Promise.resolve() : Promise.race([sleep(ms * view.pace), done]), sound: (n, pitch) => { if (!stopped()) sfx(n, pitch); },
      soundOn: () => { if (!stopped()) sfx('roulette'); }, soundOff: () => { if (window.sfxStop) sfxStop('roulette'); },
      tick: spec.tick || (() => {}), name: spec.name || (k => String(k)), condName: spec.condName || (c => c) });
    if (battle && spec.result) view.result = spec.result;
    const res = view.result;
    for (const x of spec.notices || []) { const v = x.value || x; if (v.type === 'support_skill_damage_notice') view.support[v.pokemon] = v.skill_id; }
    const sideOf = key => res && [res.attack, res.defence].find(y => y && same(y.pokemon, key));
    const wheels = spins.map(sp => {
      const k = view.ids.findIndex(x => same(x, sp.key)); if (k < 0) return null;
      const old = view.wheels.find(w => same(w.key, sp.key)), slot = spec.slotOf(view.ids[k], view.ids);
      const w = new BattleWheel(view, k, sp.key, sp.info, slot);
      w.panel = old ? old.panel : new SpinPanel(stage, slot); w.lastTarget = old && old.lastTarget; w.displacement = !!(old && old.displacement);
      const side = battle ? sideOf(sp.key) : null, sup = Object.keys(view.support).find(p => same(+p, sp.key));
      w.notices = damageNotices(spec.notices, sp.key, same, side, sup != null ? view.support[sup] : null);
      w.panel.reserved = !!(side && sp.info.marker.triangle === 'imprison' && sp.info.marker.skill_id === side.skill);   // BattleResultInit: the sealed attack came up
      if (old) view.wheels.splice(view.wheels.indexOf(old), 1); view.wheels.push(w);
      return { w, sp };
    }).filter(Boolean);
    if (battle && res) for (const w of view.wheels) if (!wheels.some(x => x.w === w) && !w.notices.some(n => n.kind === 'Result')) {   // the wheel that did not spin again gets the result too
      const side = sideOf(w.key); if (side) w.notices.push({ kind: 'Result', skillId: side.skill, resultVal: side.speed_or_damage }); }
    if (!keep && battle) {   // BattleInfo: the fade, then each wheel slides in (BattleStartMove) and the condition shows on it (RouletteCircleEffect)
      view.sound('attack_phase'); await view.wait(500);
      for (const { w, sp } of wheels) {
        if (w.disk) { w.disk.classList.remove('wait'); w.disk.classList.add('in'); }
        const m = sp.info.marker, c = m.circle;
        if (c === 'freeze' || c === 'melt') { w.fx('frozen'); view.tick(w.key, `${view.name(w.key)} is frozen.`); }
        else if (c === 'paralyze' && !m.z_state) w.fx('paralyze'); else if (c === 'burn') w.fx('burn');
        if (m.z_state) { w.panel.text(''); w.fx('zseal'); }   // DispZSkillCutIn, ZSkillEffect
        if (w.pieces.some(p => p.imprison)) w.fx('seal');
      }
      await view.wait(400);
    }
    if (!view.started && battle) {   // StartSpin: the wheels turn by themselves; a player in the duel stops them with a tap, or they stop after 3 s
      view.started = true; const turning = wheels.filter(x => !x.sp.info.frozen);
      if (turning.length) { for (const x of turning) { x.w.startLoop(); x.w.fx('spark', 1000); } view.soundOn(); }
      if (spec.human && turning.length) {
        const tapped = await Promise.race([new Promise(r => { stage.addEventListener('pointerdown', ev => { if (!ev.target.closest('[data-v]')) r(true); }, { once: true }); }), view.wait(3000).then(() => false)]);
        if (tapped) view.sound('se223_2');
      } else await view.wait(300);
    } else if (wheels.some(x => !x.sp.info.frozen && !x.w.displacement)) view.soundOn();
    // BattleSpin (stops in 0.5 s) / FieldSpin (0.4 s, no panel)
    await Promise.all(wheels.map(({ w, sp }) => w.run(sp.results || [], battle ? .5 : .4)));
    view.soundOff();
    if (battle && !spec.hold) {   // SpinEndWait, then AllNoticeClear shows each result, then BattleResult
      await view.wait(700);
      for (const w of view.wheels) w.damageDisp(false);
      if (res) {
        const sides = [res.attack, res.defence].filter(Boolean), mine = (spec.mine && spec.mine(sides)) || sides[0];
        if (mine && /draw/.test(mine.result)) view.sound('draw'); else if (mine && /win/.test(mine.result)) view.sound('attack');   // Se063 / Se061
        // BattleController.BattleCheck: the figures fight when either attack is an attack and the battle is not a draw (a plain "win" counts as one)
        const isAtk = s => { const sk = D.skills[s.skill] || [0, 0, 0, 0, 0], col = sk[2]; return col === 1 || col === 3 ? (s.speed_or_damage || 0) > 0 : !!sk[4]; };
        const drawn = sides.some(s => s.result === 'win') || (sides.length > 1 && sides.every(s => /draw/.test(s.result)));
        const winner = sides.find(s => battleMark(s.result) === 1), wk = winner ? view.ids.findIndex(id => same(id, winner.pokemon)) : -1;
        const nextField = winner && (D.skills[winner.skill] || [])[6] === 1;
        if (sides.some(isAtk) && !drawn && !nextField) {
          await view.wait(300);
          if (wk >= 0 && $('bd' + wk)) { $('bd' + wk).classList.add('won'); view.ids.forEach((_, k) => { if (k !== wk && $('bd' + k)) $('bd' + k).classList.add('lost'); }); }
          const ww = wk >= 0 && view.wheels.find(w => same(w.key, view.ids[wk])), land = (ww && ww.last) || {};
          const strike = !winner ? 'hit' : /knock|faint/.test(String(winner.result)) ? 'ko' : (spec.strike && spec.strike(winner, land)) || (land.col === 0 ? 'miss' : { 2: 'purple', 3: 'gold', 4: 'blue' }[land.col] || 'hit');
          if (!shut) { const fl = $('flare'), spk = $('sparks'); if (fl) fl.classList.add('on'); if (spk) spk.classList.add('on'); sfx(strike); }
          await view.wait(1500);
        } else await view.wait(500);
      }
      if (stage && !stopped()) { stage.classList.add('close'); await view.wait(300); }   // the 0.3 s fade back to the table
      if (gen === g) close(); return null;
    } else if (!battle) { await view.wait(2000); if (gen === g) close(); return null; }   // a spin outside a battle stays up two seconds
    return stopped() ? null : view;
  }
  // DeclareRespin: that side's panel closes, its wheel flashes "MORE RESPIN", Se059, and the next spin turns it again. DeclareDisplacement: the
  // panel closes and the next spin only shifts that wheel to its new result.
  async function declare(view, type, ids, same) {
    same = same || ((a, b) => a === b);
    for (const id of ids || []) { const w = view && view.wheels.find(x => same(x.key, id)); if (!w) continue; w.panel.hide(); if (type === 'declare_respin') w.fx('respin', 1000); else w.displacement = true; }
    if (type === 'declare_respin') { sfx('multiplier'); await sleep(1000 * ((view && view.pace) || 1)); }
  }
  window.Battle = { run, declare, close, say, damageNotices, LEAN };
  Object.assign(window, { DISK_COL, pieceText, wheelSvg });
})();
