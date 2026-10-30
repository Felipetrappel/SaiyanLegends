/* Cena 2D: mapa visual + jogadores + combate + controles na tela + modo DEBUG.
   A imagem da máscara NUNCA é desenhada; o debug usa camadas geradas a partir das classes lidas da máscara. */
(() => {
'use strict';
const { Body } = SL.Collision, { Fighter } = SL;
const DBG = [null, [235, 24, 24, 125], [255, 40, 170, 105], [185, 70, 255, 185]]; // bloqueado, caminhável, subcolisão
const CNAME = ['sem colisão', 'vermelho (BLOCKED)', 'rosa (WALKABLE)', 'roxo (SUB)', 'borda do mapa'];
/* Ícones dos botões (SVG 100×100, desenhados aqui: nada de imagem externa). */
const ICONS = {
  fist: '<g fill="#fff3c4" stroke="#3a1a00" stroke-width="3" stroke-linejoin="round"><rect x="24" y="30" width="14" height="22" rx="6"/><rect x="38" y="26" width="14" height="26" rx="6"/><rect x="52" y="26" width="14" height="26" rx="6"/><rect x="66" y="30" width="14" height="22" rx="6"/><path d="M24 46h56v18c0 14-10 22-26 22s-30-8-30-22z"/><path d="M26 54c-10 0-14 8-8 16" fill="none" stroke-width="7" stroke-linecap="round"/></g>',
  charge: '<g><circle cx="50" cy="56" r="26" fill="none" stroke="#7fdcff" stroke-width="5" opacity=".7"/><path d="M56 14L30 56h18l-6 30 28-44H52z" fill="#fff3c4" stroke="#3a1a00" stroke-width="3" stroke-linejoin="round"/><path d="M14 72l8-10 8 10M70 72l8-10 8 10" fill="none" stroke="#7fdcff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>',
  wing: '<g stroke="#3a1a00" stroke-width="3" stroke-linejoin="round"><path d="M50 84V30" fill="none" stroke="#fff3c4" stroke-width="9" stroke-linecap="round"/><path d="M50 12L28 38h14v14h16V38h14z" fill="#fff3c4"/><path d="M20 62c-8-2-12-10-12-18 10 0 20 4 24 14-3 4-8 5-12 4zM80 62c8-2 12-10 12-18-10 0-20 4-24 14 3 4 8 5 12 4z" fill="#9ae6ff"/></g>',
  small: '<g><path d="M8 50h30M14 40h22M14 60h22" stroke="#d9b6ff" stroke-width="5" stroke-linecap="round" opacity=".85"/><circle cx="62" cy="50" r="19" fill="#ff7fcb" stroke="#fff3c4" stroke-width="4"/><circle cx="62" cy="50" r="9" fill="#fff"/></g>',
  big: '<g><path d="M4 50h26M10 36h22M10 64h22" stroke="#d9b6ff" stroke-width="5" stroke-linecap="round" opacity=".85"/><g stroke="#ffe27a" stroke-width="4" stroke-linecap="round"><path d="M64 10v10M64 80v10M30 50h10M88 50h6M40 24l7 7M88 24l-7 7M40 76l7-7M88 76l-7-7"/></g><circle cx="64" cy="50" r="27" fill="#ff5fb8" stroke="#fff3c4" stroke-width="5"/><circle cx="64" cy="50" r="15" fill="#ffd0ee"/><circle cx="64" cy="50" r="7" fill="#fff"/></g>',
  shock: '<g fill="none" stroke-linecap="round"><circle cx="50" cy="52" r="12" fill="#fff3c4" stroke="#3a1a00" stroke-width="3"/><circle cx="50" cy="52" r="26" stroke="#9fd8ff" stroke-width="6"/><circle cx="50" cy="52" r="40" stroke="#c9a2ff" stroke-width="5" opacity=".8"/><path d="M6 52h8M86 52h8M50 8v8" stroke="#ffe27a" stroke-width="5"/></g>',
  star: '<path d="M50 10l12 26 28 3-21 19 6 28-25-14-25 14 6-28L10 39l28-3z" fill="#fff3c4" stroke="#3a1a00" stroke-width="3" stroke-linejoin="round"/>',
  lock: '<g stroke="#3a1a00" stroke-width="3"><rect x="26" y="44" width="48" height="38" rx="7" fill="#b9a6d8"/><path d="M36 44V34a14 14 0 0 1 28 0v10" fill="none" stroke="#b9a6d8" stroke-width="8"/></g>',
  shield: '<path d="M50 10l34 12v26c0 20-14 34-34 42C30 82 16 68 16 48V22z" fill="#9ae6ff" stroke="#3a1a00" stroke-width="3" stroke-linejoin="round"/><path d="M50 22l22 8v18c0 13-9 23-22 29z" fill="#fff" opacity=".55"/>',
  left: '<path d="M62 18L28 50l34 32" fill="none" stroke="#fff3c4" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M38 18l34 32-34 32" fill="none" stroke="#fff3c4" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>'
};
const KEYS = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW', 'Space'], down: ['ArrowDown', 'KeyS'], attack: ['KeyJ', 'KeyZ'], meditate: ['KeyM'] };
const TAP_KEYS = { KeyF: 'fly', KeyK: 'power', KeyX: 'power', KeyE: 'power', KeyB: 'big', KeyR: 'special', KeyQ: 'barrage', KeyC: 'sun', };   // (a transformação não tem tecla nem botão: o sistema ainda não existe)   // teclado: um toque

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
      if (q.t === 'shot' && f.def.cast) w.projectiles.push(new F.Shot(f, q.big && f.hasBig ? F.bigCfg(f.def) : f.def.cast, q.x, q.y, q.face));
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
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyZ', 'KeyK', 'KeyX', 'KeyE', 'KeyF', 'KeyB', 'KeyR', 'KeyQ', 'KeyC', 'KeyL', 'KeyM', 'F3', 'Backquote', 'KeyG'].includes(e.code)) e.preventDefault();
    if (down && !e.repeat) {
      if (['F3', 'Backquote', 'KeyG'].includes(e.code)) this.toggleDebug();
      if (this.debug && /^Digit[123]$/.test(e.code)) this.layers[+e.code.slice(5)] ^= 1;
      if (TAP_KEYS[e.code]) this.pend[TAP_KEYS[e.code]] = true;
    }
    down ? this.K.add(e.code) : this.K.delete(e.code);
  }
  held(k) { return KEYS[k].some(c => this.K.has(c)); }
  input() { // teclado + botões na tela; ações de um toque (voar/poder) chegam como "pressed"
    const P = this.pad, N = this.pend, inp = { left: this.held('left') || P.left, right: this.held('right') || P.right, up: this.held('up') || P.jump || N.jump, down: this.held('down'), guard: !!P.guard, meditate: this.held('meditate') || !!P.meditate,
      pressed: { attack: this.held('attack') || P.attack || N.attack, fly: N.fly, power: N.power, big: N.big, special: N.special, barrage: N.barrage, sun: N.sun } };
    /* buffer de entrada: um toque de poder/ação dado enquanto o personagem ainda está ocupado (ex.: no fim de um soco) não se perde: vale por ~0,4 s */
    const me = this.me, B = this.buf || (this.buf = {});
    for (const k in inp.pressed) { if (inp.pressed[k]) B[k] = me && me.busy ? 24 : 0; else if (B[k] > 0) { if (me && !me.busy) { inp.pressed[k] = true; B[k] = 0; } else B[k]--; } }
    this.pend = {}; if (this.editing) { inp.left = inp.right = inp.up = inp.guard = inp.meditate = false; for (const k in inp.pressed) inp.pressed[k] = false; } return inp;
  }
  /* Controles na tela (botões desenhados em SVG, roxo/dourado). Direita: HABILIDADE ÚNICA · PODER GRANDE · CARREGAR KI / PULAR-VOAR · PODER PEQUENO · SOCO.
     Esquerda: ← → e DEFESA. Não há botão de transformação (o sistema ainda não existe). Cada botão tem recarga (anel escuro) e fica apagado sem Ki. */
  attachControls(host) {
    const mk = (cls, key, mode, icon, label, text, o = {}) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'cbtn ' + cls }); b.tabIndex = -1; b.setAttribute('aria-label', label); b.title = label;
      b.innerHTML = `<svg class="ic" viewBox="0 0 100 100" aria-hidden="true">${ICONS[icon] || ICONS.star}</svg>` + (text ? `<span class="lbl">${text}</span>` : '') + '<i class="cd"></i><i class="fx"></i>';
      b.addEventListener('pointerdown', e => { if (this.editing) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('on'); this.pend[key] = true;
        if (o.dbl) { const t = performance.now(); if (t - (b._tap || -1e9) < 320) { this.pend[o.dbl] = true; b._tap = -1e9; } else b._tap = t; }   // toque duplo: liga/desliga o voo
        if (mode === 'hold') this.pad[key] = true; });   // o toque rápido também conta (dura menos que 1 quadro)
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, () => { b.classList.remove('on'); if (mode === 'hold') this.pad[key] = false; }));
      b.addEventListener('contextmenu', e => e.preventDefault()); return b;
    };
    const root = document.createElement('div'), move = document.createElement('div'), acts = document.createElement('div'), un = this.me.unique;
    root.className = 'ctl'; move.className = 'move'; acts.className = 'acts';
    move.append(mk('l', 'left', 'hold', 'left', 'Esquerda', ''), mk('r', 'right', 'hold', 'right', 'Direita', ''), mk('guard', 'guard', 'hold', 'shield', 'Defesa (segure)', 'DEFESA'));
    const sp = mk('sp', 'special', 'tap', un ? un.icon : 'lock', un ? 'Habilidade única: ' + un.name.toLowerCase() : 'Habilidade única (este personagem ainda não tem)', un ? 'ÚNICA' : 'ÚNICA');
    const power = mk('power', 'big', 'tap', 'big', 'Poder grande: carrega e dispara (recarga longa)', 'GRANDE'), pk = mk('pk', 'power', 'tap', 'small', 'Poder pequeno: projétil rápido', 'PEQUENO'),
      md = mk('md', 'meditate', 'hold', 'charge', 'Carregar Ki (segure)', 'CARREGAR'), bt = mk('bt', 'jump', 'hold', 'wing', 'Pular (toque) · voar (toque duplo)', 'PULAR/VOAR', { dbl: 'fly' }), atk = mk('atk', 'attack', 'hold', 'fist', 'Soco (toque várias vezes)', 'SOCO');
    if (!un) sp.classList.add('off');
    acts.append(md, sp, power, bt, pk, atk); root.append(move, acts);   // 2 linhas × 3 colunas
    const bars = document.createElement('div'); bars.className = 'bars';
    bars.innerHTML = '<div class="meters"><div class="bar hp"><i></i><b>HP</b></div><div class="bar en"><i></i><b>EN</b></div></div>';
    bars.prepend(SL.Characters.portrait(this.me.player.character, 1)); host.append(bars, root);
    if (this.initCustomize) this.initCustomize(root, host);   // controles personalizáveis (js/controls-editor.js)
    this.ui = { hp: bars.querySelector('.hp i'), en: bars.querySelector('.en i'), power, pk, sp, md, bt, atk, guard: root.querySelector('.guard') };
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
    for (const f of this.fighters) {   // recompensa: derrotar um oponente (bot ou jogador) que você acertou por último rende XP e moedas de ouro
      if (f === this.me || f.dummy) continue;
      if (!f.dead) f._paid = false;
      else if (!f._paid && f.lastBy === this.me && performance.now() - f.lastByT < 10000 && SL.Profile) { f._paid = true; SL.Profile.addXp(25); SL.Profile.addCoins('gold', 10); w.fx.push({ x: this.me.body.x, y: this.me.body.y - 70, txt: '+25 XP  +10 ouro', t: 0 }); }
    }
    w.fx.forEach(x => { x.t += dt; }); w.fx = w.fx.filter(x => x.t < .8);
    w.effects.forEach(e => e.update(dt)); w.effects = w.effects.filter(e => !e.dead);
  }
  updateUI() {
    if (!this.ui) return; const m = this.me, C = SL.CombatCFG, U = this.ui, A = SL.ABILITIES;
    U.hp.style.width = (m.hp / C.hp * 100) + '%'; U.en.style.width = (m.energy / (m.maxEn || C.energy) * 100) + '%';
    const set = (b, ready, cd, active) => { b.classList.toggle('nope', !ready); b.classList.toggle('rdy', ready && !active); b.classList.toggle('active', !!active); const v = cd.toFixed(2); if (b._cd !== v) { b._cd = v; b.style.setProperty('--cd', v); } };
    set(U.pk, m.powerReady, m.cdFrac('small'), m.state === 'cast');                                          // PODER PEQUENO
    const bigKey = m.hasBig ? 'big' : 'sun'; set(U.power, m.ready(bigKey), m.cdFrac('big'), m.state === 'big' || m.state === 'sun');   // PODER GRANDE
    set(U.sp, !!m.unique && m.ready('burst'), m.unique ? m.cdFrac('unique') : 0, m.state === 'burst' || m.state === 'dash');          // HABILIDADE ÚNICA
    set(U.md, m.energy < (m.maxEn || C.energy) || m.state === 'meditate', 0, m.state === 'meditate');         // CARREGAR KI
    set(U.bt, true, 0, !!m.body.flying);                                                                      // PULAR / VOAR
    set(U.atk, true, 0, m.state === 'attack'); set(U.guard, true, 0, m.state === 'shield');
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
