/* Cena 2D: mapa visual + jogadores + combate + controles na tela + modo DEBUG.
   A imagem da máscara NUNCA é desenhada; o debug usa camadas geradas a partir das classes lidas da máscara. */
(() => {
'use strict';
const { Body } = SL.Collision, { Fighter } = SL;
const DBG = [null, [235, 24, 24, 125], [255, 40, 170, 105], [185, 70, 255, 185]]; // bloqueado, caminhável, subcolisão
const CNAME = ['sem colisão', 'vermelho (BLOCKED)', 'rosa (WALKABLE)', 'roxo (SUB)', 'borda do mapa'];
const UI_ASSETS = { left: 'assets/ui/pad/btn-left.png', right: 'assets/ui/pad/btn-right.png',   // setas ← e →
  z: 'assets/ui/pad/btn-z.png', special: 'assets/ui/pad/btn-blank.png', shield: 'assets/ui/pad/btn-shield.png', pink: 'assets/ui/pad/btn-pink.png', blue: 'assets/ui/pad/btn-blue.png', fist: 'assets/ui/pad/btn-fist.png',
  yellow: 'assets/ui/pad/btn-yellow.png', meditate: 'assets/ui/pad/btn-meditate.png', boot: 'assets/ui/pad/btn-boot.png' };   // 9 botões de combate + 2 setas, recortados das imagens enviadas
const KEYS = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW', 'Space'], down: ['ArrowDown', 'KeyS'], attack: ['KeyJ', 'KeyZ'], meditate: ['KeyM'], fly: ['KeyF'] };
const TAP_KEYS = { KeyK: 'power', KeyX: 'power', KeyE: 'power', KeyT: 'transform', KeyR: 'special', KeyQ: 'barrage', KeyC: 'sun', KeyF: 'flyToggle' };   // teclado: um toque

class GameScene {
  constructor(canvas, loaded, players, meId, opts = {}) {
    const au = opts.authority; this.authFn = typeof au === 'function' ? au : () => au !== false;   // só a autoridade da sala (host) roda a IA dos bots (pode mudar se o host sair)
    this.netIO = opts.net || null; this.meId = meId; this.netT = 0; this.nb = 0;
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.map = loaded; this.mask = loaded.mask; this.debug = false; this.layers = [0, 1, 1, 1]; this.dbg = {};
    this.world = { mask: this.mask, fighters: [], projectiles: [], fx: [], effects: [] };
    if (this.netIO) this.world.net = { hit: (f, dmg, dir, kb) => this.netIO.send({ k: 'hit', to: f.player.id, dmg, dir, kb }), proj: (f, d) => this.netIO.send({ k: 'proj', by: f.player.id, d }) }; this.fighters = this.world.fighters;
    players.forEach((p, i) => this.addPlayer(p, i));
    this.ensureDummy();
    this.me = this.fighters.find(f => f.me) || this.fighters[0];
    this.K = new Set(); this.pad = {}; this.pend = {}; this.ui = null;
    this.onKey = e => this.key(e, true); this.onKeyUp = e => this.key(e, false);
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKeyUp);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas); this.resize();
    window.SaiyanGameScene = this;
    this.last = performance.now(); this.acc = 0; this.running = true; this.raf = requestAnimationFrame(t => this.frame(t));
  }
  get authority() { return this.authFn(); }
  isRemote(p) { return p.bot ? !this.authority : p.id !== this.meId; }   // réplica = controlada por outro cliente
  addPlayer(p, i) { const f = this.add(p.bot && SL.BotAI ? { ...p, character: SL.BotAI.characterFor(++this.nb) } : p, p.id === this.meId, this.map.def.spawn.x + i * 10); f.remote = this.isRemote(p); if (f.def.anims.intro && !f.remote) f.set('intro'); return f; }   // introdução do personagem (toca uma vez ao entrar na luta)
  ensureDummy() { // alvo de treino só quando o jogador está sozinho
    const real = this.fighters.filter(f => !f.dummy), d = this.fighters.find(f => f.dummy);
    if (real.length === 1 && !d) { const x = this.add({ id: 'dummy', name: 'TREINO', character: SL.Characters.DEFAULT }, false, 120); x.dummy = true; x.face = -1; }
    else if (real.length > 1 && d) this.fighters.splice(this.fighters.indexOf(d), 1);
  }
  /* Entradas e saídas na sala durante a partida: cria/remove os personagens e recalcula quem controla cada um (host muda → bots mudam de dono). */
  syncRoster(players) {
    const ids = new Set(players.map(p => p.id));
    for (let i = this.fighters.length - 1; i >= 0; i--) { const f = this.fighters[i]; if (!f.dummy && !ids.has(f.player.id)) { if (f === this.me) continue; this.fighters.splice(i, 1); } }
    players.forEach((p, i) => { if (!this.fighters.some(f => f.player.id === p.id)) this.addPlayer(p, i); });
    for (const f of this.fighters) if (!f.dummy) f.remote = this.isRemote(f.player);
    this.ensureDummy(); this.world.projectiles = this.world.projectiles.filter(q => this.fighters.includes(q.owner));
  }
  /* Mensagens dos outros jogadores: estado (posição/animação), golpes recebidos e projéteis. */
  onNet(from, d) {
    if (!d) return; const byId = id => this.fighters.find(f => !f.dummy && f.player.id === id);
    if (d.k === 's') { for (const s of d.f || []) { const f = byId(s.id); if (f && f.remote) f.applyNet(s, !f.net); } }
    else if (d.k === 'hit') { const f = byId(d.to); if (f && !f.remote && +d.dmg > 0 && +d.dmg <= 200) f.hurt(+d.dmg, d.dir < 0 ? -1 : 1, Math.min(600, Math.abs(+d.kb) || 0)); }
    else if (d.k === 'proj') {
      const f = byId(d.by), q = d.d; if (!f || !f.remote || !q) return; const w = this.world, F = SL;
      if (q.t === 'shot' && f.def.cast) w.projectiles.push(new F.Shot(f, f.def.cast, q.x, q.y, q.face));
      else if (q.t === 'ball' && q.o) w.projectiles.push(new F.KiBall(f, q.x, q.y, q.face, { ...q.o, pal: F.PAL[q.o.pal] || F.PAL.pink }));
      else if (q.t === 'beam' && f.def.beam) w.projectiles.push(new F.Beam(f, q.x, q.y, q.face));
    }
  }
  add(p, me, x) {
    const body = new Body(this.mask, x, this.mask.surfaceY(x)), f = new Fighter(body, p, me, { x, y: body.y }); f.world = this.world; this.fighters.push(f); if (p.bot && SL.BotAI) new SL.BotAI.BotBrain(f); return f;
  }
  toggleDebug() { this.debug = !this.debug; }
  key(e, down) {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyZ', 'KeyK', 'KeyX', 'KeyE', 'KeyF', 'KeyT', 'KeyR', 'KeyQ', 'KeyC', 'KeyL', 'KeyM', 'F3', 'Backquote', 'KeyG'].includes(e.code)) e.preventDefault();
    if (down && !e.repeat) {
      if (['F3', 'Backquote', 'KeyG'].includes(e.code)) this.toggleDebug();
      if (this.debug && /^Digit[123]$/.test(e.code)) this.layers[+e.code.slice(5)] ^= 1;
      if (TAP_KEYS[e.code]) this.pend[TAP_KEYS[e.code]] = true;
    }
    down ? this.K.add(e.code) : this.K.delete(e.code);
  }
  held(k) { return KEYS[k].some(c => this.K.has(c)); }
  input() { // teclado + botões na tela; ações de um toque (voar/poder) chegam como "pressed"
    const P = this.pad, N = this.pend, me = this.me, S = this.stick || (this.stick = { x: 0, y: 0 });
    if (N.flyToggle) this.flyOn = !this.flyOn;
    if (P.flyStart) { P.flyStart = false; this.flyOn = true; }
    if (P.flyStop) { P.flyStop = false; this.flyOn = false; }
    if (me && (me.dead || me.hp <= 0)) this.flyOn = false;
    const L = this.held('left') || P.left, R = this.held('right') || P.right, U = this.held('up') || P.jump || N.jump, D = this.held('down');
    const inp = { left: L, right: R, up: U, down: D, guard: !!P.guard, meditate: this.held('meditate') || !!P.meditate, flyHold: !!this.flyOn,
      pressed: { attack: this.held('attack') || P.attack || N.attack, power: N.power, transform: N.transform, special: N.special, barrage: N.barrage, sun: N.sun } };
    if (this.flyOn) {   // VOO LIVRE: analógico na tela (qualquer ângulo) + setas ←/→ + teclado (WASD/setas, 8 direções)
      let ax = S.x + (R ? 1 : 0) - (L ? 1 : 0), ay = S.y + (D ? 1 : 0) - (this.held('up') ? 1 : 0);
      const len = Math.hypot(ax, ay); if (len > 1) { ax /= len; ay /= len; }
      inp.ax = ax; inp.ay = ay; inp.left = ax < -.25; inp.right = ax > .25; inp.up = ay < -.25; inp.down = ay > .25;
      if (me && me.body.grounded && ay > .4) this.flyOn = false;   // empurrou para baixo no chão: pousa
    }
    if (this.ui && this.ui.bt) this.ui.bt.classList.toggle('on', !!this.flyOn);
    if (this.fsEl) { this.fsEl.style.display = this.flyOn && this.stickDown ? 'block' : 'none'; }
    /* buffer de entrada: um toque de poder/ação dado enquanto o personagem ainda está ocupado (ex.: no fim de um soco) não se perde: vale por ~0,4 s */
    const B = this.buf || (this.buf = {});
    for (const k in inp.pressed) { if (inp.pressed[k]) B[k] = me && me.busy ? 24 : 0; else if (B[k] > 0) { if (me && !me.busy) { inp.pressed[k] = true; B[k] = 0; } else B[k]--; } }
    this.pend = {}; if (this.editing) { inp.left = inp.right = inp.up = inp.guard = inp.meditate = inp.flyHold = false; inp.ax = inp.ay = undefined; for (const k in inp.pressed) inp.pressed[k] = false; } return inp;
  }
  /* Controles na tela com os PNGs recortados das imagens enviadas (assets/ui/pad): só as setas ← e → à esquerda; à direita a grade 3×3:
     Z · especial · escudo / rosa · azul(poder) · punho / amarelo · meditar · BOTA. A BOTA é o PULAR (segure = sobe) e o toque duplo liga/desliga o VOO. */
  attachControls(host) {
    const mk = (cls, key, mode, src, label, o = {}) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'cbtn ' + cls }); b.tabIndex = -1; b.setAttribute('aria-label', label); b.title = label;
      const img = Object.assign(document.createElement('img'), { src, alt: '', draggable: false }); if (o.rot) img.style.transform = `rotate(${o.rot}deg)`; b.append(img);
      if (o.text) b.append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: o.text }));
      if (o.fill) b.append(Object.assign(document.createElement('i'), { className: 'fill' }));
      b.addEventListener('pointerdown', e => { if (this.editing) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('on'); this.pend[key] = true;
        if (o.dbl) { const t = performance.now(); if (t - (b._tap || -1e9) < 320) { this.pend[o.dbl] = true; b._tap = -1e9; } else b._tap = t; }   // toque duplo: liga/desliga o voo
        if (mode === 'hold') this.pad[key] = true; });   // o toque rápido também conta (dura menos que 1 quadro)
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, () => { b.classList.remove('on'); if (mode === 'hold') this.pad[key] = false; }));
      b.addEventListener('contextmenu', e => e.preventDefault()); return b;
    };
    const U = UI_ASSETS, root = document.createElement('div'), move = document.createElement('div'), acts = document.createElement('div');
    root.className = 'ctl'; move.className = 'move'; acts.className = 'acts';
    move.append(mk('l', 'left', 'hold', U.left, 'Esquerda'), mk('r', 'right', 'hold', U.right, 'Direita'));        // só ← e → (o direcional de 4 setas foi removido)
    const power = mk('power', 'power', 'tap', U.blue, 'Poder de Ki (azul)', { fill: true });
    const z = mk('z', 'transform', 'tap', U.z, 'Z – Transformação'), sp = mk('sp', 'special', 'tap', U.special, 'Habilidade especial: onda de impacto'), pk = mk('pk', 'barrage', 'tap', U.pink, 'Rajada de energia rosa'),
      yl = mk('yl', 'sun', 'tap', U.yellow, 'Esfera de energia amarela'), md = mk('md', 'meditate', 'hold', U.meditate, 'Carregar Ki (segure)'), bt = mk('bt', 'jump', 'hold', U.boot, 'Bota: toque = pular · segure = voar livre (arraste na tela para mover)');   // a bota é o PULAR/VOAR
    acts.append(z, sp, mk('guard', 'guard', 'hold', U.shield, 'Defesa'), pk, power, mk('atk', 'attack', 'hold', U.fist, 'Soco'), yl, md, bt); root.append(move, acts);
    this._wireFly(bt, host);   // ordem da imagem: 3×3
    const bars = document.createElement('div'); bars.className = 'bars';
    bars.innerHTML = '<div class="meters"><div class="bar hp"><i></i><b>HP</b></div><div class="bar en"><i></i><b>EN</b></div></div>';
    bars.prepend(SL.Characters.portrait(this.me.player.character, 1)); host.append(bars, root);
    if (this.initCustomize) this.initCustomize(root, host);   // controles personalizáveis (js/controls-editor.js)
    this.ui = { hp: bars.querySelector('.hp i'), en: bars.querySelector('.en i'), power, z, sp, pk, yl, md, bt };
  }
  /* BOTA: no chão, toque = pular; SEGURAR 0,25 s = decolar e VOAR LIVRE (fica voando sem segurar). No ar, um toque na bota liga o voo;
     voando, um toque na bota desliga (cai/pousa). Voando: arraste o dedo em qualquer ponto da metade esquerda da tela para
     mover em QUALQUER direção (analógico flutuante); ←/→ também funcionam. Teclado: F liga/desliga; WASD/setas movem em 8 direções. */
  _wireFly(b, host) {
    const P = this.pad; let id = null, timer = null;
    const clear = () => { clearTimeout(timer); timer = null; id = null; };
    b.addEventListener('pointerdown', e => { if (this.editing) return; id = e.pointerId; clearTimeout(timer);
      if (this.flyOn) { P.flyStop = true; P.jump = false; return; }
      if (this.me && !this.me.body.grounded) { P.flyStart = true; P.jump = false; return; }
      timer = setTimeout(() => { if (id !== null) { P.jump = false; P.flyStart = true; this.stick.y = -.6; setTimeout(() => { if (!this.stickDown) this.stick.y = 0; }, 350); } }, 250); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, clear));
    /* analógico flutuante */
    const S = this.stick || (this.stick = { x: 0, y: 0 }), fs = document.createElement('div'); fs.className = 'flystick'; fs.innerHTML = '<i></i>'; fs.style.display = 'none'; host.append(fs); this.fsEl = fs;
    let sid = null, ox = 0, oy = 0; const R = () => Math.max(40, Math.min(70, host.getBoundingClientRect().height * .14));
    host.addEventListener('pointerdown', e => {
      if (this.editing || !this.flyOn || sid !== null || e.target.closest('.cbtn,.gear,.gmenu,.cedit,button,input,select')) return;
      const r = host.getBoundingClientRect(); if (e.clientX > r.left + r.width * .55) return;
      sid = e.pointerId; ox = e.clientX; oy = e.clientY; this.stickDown = true; S.x = S.y = 0;
      fs.style.setProperty('--r', R() + 'px'); fs.style.left = (ox - r.left) + 'px'; fs.style.top = (oy - r.top) + 'px'; fs.firstChild.style.transform = 'translate(-50%,-50%)'; try { host.setPointerCapture(sid); } catch (_) { }
    });
    host.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; const k = R(); let dx = (e.clientX - ox) / k, dy = (e.clientY - oy) / k; const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; } const dz = .18; S.x = Math.abs(dx) < dz && Math.abs(dy) < dz ? 0 : dx; S.y = Math.abs(dx) < dz && Math.abs(dy) < dz ? 0 : dy;
      fs.firstChild.style.transform = `translate(calc(-50% + ${dx * k}px),calc(-50% + ${dy * k}px))`; });
    const end = e => { if (e.pointerId !== sid) return; sid = null; this.stickDown = false; S.x = S.y = 0; fs.style.display = 'none'; };
    ['pointerup', 'pointercancel'].forEach(n => host.addEventListener(n, end));
  }
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); const r = this.cv.getBoundingClientRect();
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr)); this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
  }
  frame(t) {
    if (!this.running) return;
    this.acc = Math.min(this.acc + (t - this.last) / 1000, .1); this.last = t;
    while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.step(); }
    this.draw(); this.updateUI(); this.raf = requestAnimationFrame(t2 => this.frame(t2));
  }
  step() {
    const inp = this.input(), dt = 1 / 60, w = this.world;
    for (const f of this.fighters) { if (f.remote) f.replicate(dt, w); else f.update(dt, f.me ? inp : f.brain ? f.brain.think(dt, w) : {}, w); }
    if (this.netIO && (this.netT += dt) >= 1 / 15) { this.netT = 0; const mine = this.fighters.filter(f => !f.dummy && !f.remote); if (mine.length) this.netIO.send({ k: 's', f: mine.map(f => f.netState()) }); }   // ~15 envios/s
    w.projectiles.forEach(p => p.update(dt, w)); w.projectiles = w.projectiles.filter(p => !p.dead);
    w.fx.forEach(x => { x.t += dt; }); w.fx = w.fx.filter(x => x.t < .8);
    w.effects.forEach(e => e.update(dt)); w.effects = w.effects.filter(e => !e.dead);
  }
  updateUI() {
    if (!this.ui) return; const m = this.me, C = SL.CombatCFG;
    this.ui.hp.style.width = (m.hp / C.hp * 100) + '%'; this.ui.en.style.width = (m.energy / C.energy * 100) + '%';
    this.ui.power.classList.toggle('nope', !m.powerReady); this.ui.power.style.setProperty('--fill', Math.min(100, m.energy / m.powerCost * 100) + '%');
    const U = this.ui; U.z.classList.toggle('active', m.form > 0); U.z.classList.toggle('nope', !m.form && !m.ready('transform')); U.sp.classList.toggle('nope', !m.ready('burst'));
    U.pk.classList.toggle('nope', !m.ready('barrage')); U.yl.classList.toggle('nope', !m.ready('sun')); U.bt.classList.toggle('active', !!m.body.flying);
    U.md.classList.toggle('active', m.state === 'meditate'); U.md.classList.toggle('nope', m.energy >= C.energy && m.state !== 'meditate');
  }
  layer(c) {
    if (this.dbg[c]) return this.dbg[c];
    const { w, h, cls } = this.mask, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d'), img = x.createImageData(w, h), k = DBG[c];
    for (let i = 0; i < cls.length; i++) if (cls[i] === c) img.data.set(k, i * 4);
    x.putImageData(img, 0, 0); return (this.dbg[c] = cv);
  }
  draw() {
    const { ctx, cv } = this, W = cv.width, H = cv.height, m = this.map, dw = m.def.w, dh = m.def.h, b = this.me.body, w = this.world;
    const s = Math.max(H / dh, W / 1100), vw = W / s, vh = H / s;
    const cx = Math.floor(Math.min(Math.max(b.x - vw / 2, 0), Math.max(0, dw - vw))), cy = Math.floor(Math.min(Math.max(b.y - b.h / 2 - vh / 2, 0), Math.max(0, dh - vh)));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(m.art, cx, cy, vw, vh, 0, 0, W, H);
    if (this.debug) for (const c of [1, 2, 3]) if (this.layers[c]) ctx.drawImage(this.layer(c), cx, cy, vw, vh, 0, 0, W, H);
    ctx.save(); ctx.scale(s, s); ctx.translate(-cx, -cy); ctx.imageSmoothingEnabled = false;
    for (const f of this.fighters) f.draw(ctx, f.def.img);                     // cada personagem usa o PRÓPRIO sprite sheet
    for (const p of w.projectiles) p.draw(ctx, p.owner.def.img);
    for (const e of w.effects) e.draw(ctx, e.def.img);
    ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    for (const x of w.fx) { ctx.globalAlpha = 1 - x.t / .8; ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeText(x.txt, x.x, x.y - x.t * 30); ctx.fillText(x.txt, x.x, x.y - x.t * 30); }
    ctx.globalAlpha = 1;
    if (this.debug) {
      for (const f of this.fighters) {
        const d = f.body, x = d.x - d.w / 2, y = d.y - d.h;
        ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 1.5 / s; ctx.strokeRect(x, y, d.w, d.h);               // collider
        ctx.fillStyle = '#00ff66'; ctx.fillRect(Math.floor(d.x) - 1, Math.floor(d.y) - 1, 2, 2);            // pés (ponto de apoio)
        if (d.hit && d.hit.age < 45) { const p = d.hit; ctx.strokeStyle = '#ffee00'; ctx.lineWidth = 2 / s; ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 5, p.y); ctx.moveTo(p.x + .5, p.y - 4); ctx.lineTo(p.x + .5, p.y + 5); ctx.stroke(); } // ponto de colisão
        if (f.brain) { ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#7dffb0'; ctx.fillText('AI ' + f.brain.state, d.x, d.y - 62); }
        ctx.strokeStyle = '#ff8a00'; const hb = f.dbg; if (hb) ctx.strokeRect(hb.l, hb.t, hb.r - hb.l, hb.b - hb.t);                                   // hitbox do soco
      }
      ctx.strokeStyle = '#ff8a00'; for (const p of w.projectiles) if (p.dbg) ctx.strokeRect(p.dbg.l, p.dbg.t, p.dbg.r - p.dbg.l, p.dbg.b - p.dbg.t); // hitbox do poder
    }
    ctx.restore();
    if (this.debug) {
      const k = this.dpr, under = this.mask.at(Math.floor(b.x), Math.floor(b.y)), h = b.hit;
      ctx.font = `${13 * k}px monospace`; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3 * k;
      [`estado: ${this.me.state}  hp ${this.me.hp | 0}  en ${this.me.energy | 0}`, `x ${b.x.toFixed(1)}  y ${b.y.toFixed(1)}  vx ${b.vx | 0}  vy ${b.vy | 0}`, `chão: ${b.grounded ? 'sim' : 'não'}   sob os pés: ${CNAME[under]}`,
       `último contato: ${h ? CNAME[h.c] + ' em ' + h.x + ',' + h.y : '-'}`, 'DEBUG  [F3/G] liga/desliga · [1][2][3] camadas']
        .forEach((t, i) => { ctx.strokeText(t, 12 * k, (150 + i * 16) * k); ctx.fillText(t, 12 * k, (150 + i * 16) * k); });
    }
  }
  destroy() { this.running = false; cancelAnimationFrame(this.raf); removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKeyUp); this.ro.disconnect(); if (window.SaiyanGameScene === this) window.SaiyanGameScene = null; }
}
SL.GameScene = GameScene;
})();
