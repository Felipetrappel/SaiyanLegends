/* Combate: estados/animações do personagem, soco (hitbox), poder de energia (projétil) e dano.
   Usa o Body de collision.js para mover (colisão por máscara intacta). */
(() => {
'use strict';
const CFG = {
  hp: 100, energy: 100, regen: 12, powerCost: 50, respawn: 2,
  attack: { dmg: 12, dur: .25, cd: .12, from: .0625, to: .2, reach: 28, kb: 150 },
  charge: { dur: 1.3, form: .35, r0: 1, r1: 3, r2: 8 },   // 0→.35s a esfera se forma na mão; depois cresce até r2 enquanto ele segura
  power: { dur: .3, fireAt: .1, release: 10, scale0: .3, cd: .5, dmg: 30, range: 520, speed: 620, kb: 260 },
  shieldReduce: .75, beamMid: 2
};
const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

function frameAt(def, name, t) { const a = def.anims[name], n = a.f.length, i = a.loop ? Math.floor(t * a.fps) % n : Math.min(Math.floor(t * a.fps), n - 1); return a.f[i]; }
/* Desenha um frame do atlas (sem suavização), ancorado no centro do corpo (x) e no chão (feetY). */
function drawFrame(ctx, img, def, fi, x, feetY, face) {
  if (!img.complete || !img.naturalWidth) return;
  const f = def.frames[fi]; ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(feetY - f.ay)); if (face < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, f.x, f.y, f.w, f.h, -f.ax, 0, f.w, f.h); ctx.restore();
}


/* Esfera de energia (pixel art, mesmas cores do feixe do sheet) + faíscas. Centro (x,y), raio r em px do jogo. */
const PAL = { purple: ['#9b3ff0', '#b46bff', '#a94cf5', '#d9a8ff', '#f6e8ff', '#ffffff', '#ffe14d', '#e08cff'],
  pink: ['#ff4fb0', '#ff7fcb', '#ff5fb8', '#ffb3e0', '#ffe3f3', '#ffffff', '#fff0a0', '#ff9bd8'],
  yellow: ['#ff9d00', '#ffc42e', '#ffa800', '#ffd96a', '#fff2b5', '#ffffff', '#fff7a8', '#ffd24d'] };
function drawOrb(ctx, x, y, r, t, pal = PAL.purple) {
  x = Math.round(x); y = Math.round(y); const R = Math.max(1, Math.round(r)), fl = Math.floor(t * 18) % 3;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const ring = (rr, col, a) => { ctx.globalAlpha = a; ctx.fillStyle = col; for (let dy = -rr; dy <= rr; dy++) { const w = Math.round(Math.sqrt(rr * rr - dy * dy)); ctx.fillRect(x - w, y + dy, w * 2 + 1, 1); } };
  ring(R + 2 + (fl === 1 ? 1 : 0), pal[0], .35); ring(R + 1, pal[1], .6);
  ring(R, pal[2], 1); ring(Math.round(R * .78), pal[3], 1); ring(Math.round(R * .5), pal[4], 1); ring(Math.round(R * .25), pal[5], 1);
  ctx.globalAlpha = 1;
  for (let i = 0; i < 5; i++) { const a = (i * 1.26 + Math.floor(t * 14) * .9) % (Math.PI * 2), d = R + 2 + ((i * 7 + Math.floor(t * 14) * 3) % 5);   // faíscas amarelas/roxas em volta
    ctx.fillStyle = i % 2 ? pal[6] : pal[7]; ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1); }
  ctx.restore();
}
const tints = new Map(); // silhueta colorida de um frame (para o brilho da aura)
function tinted(img, def, fi, color) {
  const key = def.id + fi + color; let c = tints.get(key); if (c) return c;
  const f = def.frames[fi]; c = document.createElement('canvas'); c.width = f.w; c.height = f.h; const x = c.getContext('2d');
  x.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, f.w, f.h); tints.set(key, c); return c;
}
function drawAura(ctx, img, def, fi, x, feetY, face, k, t, color = '#c24bff') { // contorno roxo que engrossa com a carga k (0..1)
  if (!img.complete || !img.naturalWidth || k <= 0) return;
  const f = def.frames[fi], c = tinted(img, def, fi, color), rr = 1 + Math.floor(k * 3), a = (.3 + .4 * k) * (.85 + .15 * Math.sin(t * 40));
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(x), Math.round(feetY - f.ay)); if (face < 0) ctx.scale(-1, 1);
  for (let r = 1; r <= rr; r++) { ctx.globalAlpha = a * (1 - (r - 1) / (rr + 1)); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) ctx.drawImage(c, -f.ax + dx * r, dy * r); }
  ctx.globalAlpha = 1; ctx.restore();
}

class Beam { // feixe de energia: cauda + trecho repetido + cabeça (sprites do sheet)
  constructor(owner, x0, yc, face) { Object.assign(this, { owner, x0, yc, face, sc: CFG.power.scale0, head: x0 + owner.def.beam.headR * CFG.power.scale0, dist: 0, life: 0, fade: 0, ending: false, dead: false, hits: new Set(), dbg: null }); }
  len() { const F = this.owner.def.frames, B = this.owner.def.beam.A; return (F[B.tail].w + CFG.beamMid * F[B.mid].w + F[B.head].w) * this.sc; }
  rect() { const L = this.len(); return this.face > 0 ? { l: Math.max(this.head - L, this.x0), r: this.head, t: this.yc - 20 * this.sc, b: this.yc + 20 * this.sc } : { l: this.head, r: Math.min(this.head + L, this.x0), t: this.yc - 20 * this.sc, b: this.yc + 20 * this.sc }; }
  update(dt, world) {
    this.life += dt; this.sc = Math.min(1, CFG.power.scale0 + (1 - CFG.power.scale0) * this.life / .25);   // a energia cresce ao sair da mão
    if (this.ending) { this.fade += dt; if (this.fade > .2) this.dead = true; return; }
    const st = CFG.power.speed * dt; this.head += this.face * st; this.dist += st;
    if (world.mask.at(Math.floor(this.head + this.face * 3), Math.floor(this.yc)) || this.dist >= CFG.power.range) { this.ending = true; return; } // some no terreno ou no alcance máximo
    const r = this.dbg = this.rect();
    for (const f of world.fighters) if (f !== this.owner && !f.dead && !this.hits.has(f) && overlap(r, f.rect())) { this.hits.add(f); if (!this.owner.remote) f.hurt(CFG.power.dmg * this.owner.dmgMul, this.face, CFG.power.kb, this.owner); }
  }
  draw(ctx, img) {
    if (!img.complete) return;
    const d = this.owner.def, B = d.beam[Math.floor(this.life * 16) % 2 ? 'B' : 'A'], F = d.frames, cy = d.beam.cy;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = this.ending ? Math.max(0, 1 - this.fade / .2) : 1;
    ctx.beginPath(); ctx.rect(this.face > 0 ? this.x0 : this.x0 - 5000, this.yc - 100, 5000, 200); ctx.clip(); // o feixe "nasce" da mão
    ctx.translate(Math.round(this.head), Math.round(this.yc)); if (this.face < 0) ctx.scale(-1, 1); ctx.scale(this.sc, this.sc);
    const put = (fi, lx) => { const f = F[fi]; ctx.drawImage(img, f.x, f.y, f.w, f.h, lx, f.y - cy, f.w, f.h); };
    let x = -F[B.head].w; put(B.head, x);
    for (let k = 0; k < CFG.beamMid; k++) { x -= F[B.mid].w; put(B.mid, x); }
    x -= F[B.tail].w; put(B.tail, x); ctx.restore();
  }
}

/* Projétil de energia do STREET (sprites do sheet, animado). Para no terreno/alcance; explode ao acertar. */
class Shot {
  constructor(owner, cfg, x0, yc, face) { Object.assign(this, { owner, cfg, pj: owner.def.proj[cfg.proj], face, yc, head: x0 + face * 8, dist: 0, life: 0, fade: 0, sc: .6, ending: false, dead: false, dbg: null }); }
  frame() { const F = this.owner.def.frames, f = this.pj.frames, ii = this.pj.intro; if (ii) { const k = Math.floor(this.life * (this.pj.ifps || 24)); if (k < ii.length) return F[ii[k]]; }   // quadros de formação (nascimento do Ki)
    return F[f[Math.floor(this.life * this.pj.fps) % f.length]]; }
  rect() { const f = this.frame(), w = f.w * this.sc * .85, h = f.h * this.sc * .7; return this.face > 0 ? { l: this.head - w, r: this.head, t: this.yc - h / 2, b: this.yc + h / 2 } : { l: this.head, r: this.head + w, t: this.yc - h / 2, b: this.yc + h / 2 }; }
  end(world, impact) { this.ending = true; const im = this.pj.impact; if (impact && im) (world.effects ||= []).push(new Effect(this.owner.def, im, this.head, this.yc)); if (impact && this.cfg.size) (world.effects ||= []).push(new Ring(this.owner.def, this.head, this.yc, 10, 64, .32, '#ff8a6a')); }
  update(dt, world) {
    const c = this.cfg; this.life += dt; this.sc = Math.min(1, .6 + .4 * this.life / .15) * (c.size || 1);       // nasce menor na mão e cresce
    if (this.ending) { this.fade += dt; if (this.fade > .12) this.dead = true; return; }
    const st = c.speed * dt; this.head += this.face * st; this.dist += st; const r = this.dbg = this.rect();
    if (world.mask.at(Math.floor(this.head + this.face * 3), Math.floor(this.yc))) { this.end(world, true); return; }   // bateu no terreno
    if (this.dist >= c.range) { this.end(world, false); return; }                                                        // alcance máximo
    for (const f of world.fighters) if (f !== this.owner && !f.dead && overlap(r, f.rect())) { if (!this.owner.remote) f.hurt(c.dmg * this.owner.dmgMul, this.face, c.kb, this.owner); this.end(world, true); return; }
  }
  draw(ctx, img) {
    if (!img.complete) return; const f = this.frame();
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = this.ending ? Math.max(0, 1 - this.fade / .12) : 1;
    ctx.translate(Math.round(this.head), Math.round(this.yc)); if (this.face < 0) ctx.scale(-1, 1); ctx.scale(this.sc, this.sc);
    ctx.drawImage(img, f.x, f.y, f.w, f.h, -f.w, -Math.round(f.h / 2), f.w, f.h); ctx.restore();   // borda direita do sprite = frente do projétil
  }
}
class Effect { // efeito de sprite de curta duração (ex.: explosão no impacto)
  constructor(def, cfg, x, y) { Object.assign(this, { def, cfg, x, y, life: 0, dead: false }); }
  update(dt) { this.life += dt; if (this.life >= this.cfg.dur) this.dead = true; }
  draw(ctx, img) {
    if (!img.complete) return; const c = this.cfg, f = this.def.frames[c.frames[Math.floor(this.life / .07) % c.frames.length]], s = c.scale;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = Math.max(0, 1 - this.life / c.dur); ctx.translate(Math.round(this.x), Math.round(this.y)); ctx.scale(s, s);
    ctx.drawImage(img, f.x, f.y, f.w, f.h, -Math.round(f.w / 2), -Math.round(f.h / 2), f.w, f.h); ctx.restore();
  }
}

/* Esfera de energia genérica (rajada rosa / esfera solar amarela): voa em linha reta, para no terreno/alcance e explode ao acertar. */
class KiBall {
  constructor(owner, x, y, face, o) { Object.assign(this, { owner, x, y, face, o, life: 0, dist: 0, fade: 0, ending: false, dead: false, dbg: null }); }
  rect() { const r = this.o.r; return { l: this.x - r, r: this.x + r, t: this.y - r, b: this.y + r }; }
  update(dt, world) {
    this.life += dt; if (this.ending) { this.fade += dt; if (this.fade > .1) this.dead = true; return; }
    const st = this.o.speed * dt; this.x += this.face * st; this.dist += st; const r = this.dbg = this.rect();
    if (world.mask.at(Math.floor(this.x + this.face * this.o.r), Math.floor(this.y)) || this.dist >= this.o.range) { this.end(world, true); return; }
    for (const f of world.fighters) if (f !== this.owner && !f.dead && overlap(r, f.rect())) { if (!this.owner.remote) f.hurt(this.o.dmg * this.owner.dmgMul, this.face, this.o.kb, this.owner); this.end(world, true); return; }
  }
  end(world, boom) { this.ending = true; if (boom) (world.effects ||= []).push(new Ring(this.owner.def, this.x, this.y, this.o.r * 1.2, this.o.r * 3.2, .25, this.o.pal === PAL.yellow ? '#ffd96a' : '#ff9bd8')); }
  draw(ctx) { ctx.save(); ctx.globalAlpha = this.ending ? Math.max(0, 1 - this.fade / .1) : 1; drawOrb(ctx, this.x, this.y, this.o.r, this.life, this.o.pal); ctx.restore(); }
}
/* Anel de choque que se expande (onda de impacto / explosão das esferas). */
class Ring {
  constructor(def, x, y, r0, r1, dur, color) { Object.assign(this, { def, x, y, r0, r1, dur, color, life: 0, dead: false }); }
  update(dt) { this.life += dt; if (this.life >= this.dur) this.dead = true; }
  draw(ctx) {
    const u = Math.min(1, this.life / this.dur), r = this.r0 + (this.r1 - this.r0) * u;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - u); ctx.strokeStyle = this.color; ctx.lineWidth = 3 * (1 - u) + 1; ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

/* Habilidades extras dos botões (valem para qualquer personagem: usam as animações padrão idle/run/charge/energy/attack). */
const ABIL = {
  transform: { cost: 30, cd: 2 }, burst: { cost: 25, cd: 3 }, barrage: { cost: 20, cd: 1 }, sun: { cost: 45, cd: 2.5 },
  big: { cost: 60, cd: 6 },   // PODER GRANDE: carrega (animação real do sheet), lança um projétil maior; recarga bem maior que o poder pequeno
  form: { dur: 25, dmg: 1.4, speed: 1.15, regen: 2 }, meditateRate: 40
};
const STATE_ANIM = { big: 'charge', transform: 'charge', meditate: 'charge', burst: 'energy', barrage: 'energy', sun: 'charge', hurt: 'hurt', hurtH: 'hurtH', guardhit: 'guardhit', intro: 'intro', dash: 'dash' };   // estados 'hurt/hurtH/guardhit/intro/dash' só existem para personagens que têm esses quadros
const animOf = (f, s) => (f.def.stateAnim && f.def.stateAnim[s]) || STATE_ANIM[s] || s;
const segAt = (seq, t) => { let i = 0; for (const s of seq) { if (t < s.dur) return { seg: s, ts: t, i }; t -= s.dur; i++; } return null; };   // etapa de uma sequência pelo tempo

/* PODER GRANDE: usa as etapas reais do sheet (def.cast.seqLento: carregar → preparar → segurar → lançar), um pouco aceleradas. */
const BIG_K = .62;
const bigSeq = def => def._bigSeq || (def._bigSeq = def.cast.seqLento.map(q => ({ ...q, dur: q.dur * BIG_K, fps: q.fps / BIG_K })));
const bigCfg = def => ({ ...def.cast, proj: def.proj.red ? 'red' : def.cast.proj, dmg: Math.round(def.cast.dmg * 2.1), speed: def.cast.speed * .9, range: def.cast.range * 1.15, kb: def.cast.kb * 1.7, size: 1.35 });
/* Efeito de Ki em volta do personagem enquanto ele CARREGA (botão CARREGAR KI): ondas no chão, coluna de luz e faíscas subindo. */
function drawKiFx(ctx, x, y, h, t) {
  x = Math.round(x); y = Math.round(y); ctx.save(); ctx.imageSmoothingEnabled = false;
  const g = ctx.createLinearGradient(0, y - h - 14, 0, y); g.addColorStop(0, 'rgba(120,220,255,0)'); g.addColorStop(1, 'rgba(120,220,255,.28)'); ctx.fillStyle = g; ctx.fillRect(x - 15, y - h - 14, 30, h + 14);
  for (let i = 0; i < 2; i++) { const u = (t * 1.5 + i * .5) % 1; ctx.globalAlpha = (1 - u) * .8; ctx.strokeStyle = i ? '#c9a2ff' : '#7fdcff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 2, 9 + 26 * u, 3 + 7 * u, 0, 0, 7); ctx.stroke(); }
  for (let i = 0; i < 12; i++) { const u = (t * .95 + i / 12) % 1, px = x + Math.round(Math.sin(i * 12.9 + t * 2.4) * (8 + 9 * u)), py = Math.round(y - 4 - u * (h + 8)), z = u < .5 ? 2 : 1;
    ctx.globalAlpha = Math.min(1, (1 - u) * 1.6); ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#7fdcff' : '#d9a8ff'; ctx.fillRect(px, py, z, z + 1); }
  ctx.restore();
}

class Fighter {
  constructor(body, player, me, spawn) {
    Object.assign(this, { body, player, me, spawn, def: SL.Characters.get(player.character), face: 1, state: 'idle', t: 0, hp: CFG.hp, energy: CFG.energy, cd: 0, pcd: 0,
      flash: 0, kb: 0, dead: false, rt: 0, fired: false, hits: new Set(), dbg: null, world: null, dummy: false, av: null, combo: 0, comboT: 0, dmgMul: 1, kiRate: 1, bot: false, brain: null, acd: {}, form: 0, sunFired: false, shots: 0, baseSpeed: body.speed });
    /* ATRIBUTOS do personagem (def.stats, 100 = base): poder → dano causado, defesa → dano recebido, energia → Ki máximo, velocidade → andar/voar, K → recuo causado */
    const st = this.def.stats || {}, r = k => Math.max(.25, (st[k] || 100) / 100);
    Object.assign(this, { maxEn: CFG.energy * r('energy'), defMul: r('defense'), kbMul: r('k') }); this.energy = this.maxEn; this.dmgMul = r('power');
    body.speed *= r('speed'); body.flySpeed *= r('speed'); this.baseSpeed = body.speed;
  }
  get busy() { return this.state === 'attack' || this.state === 'charge' || this.state === 'energy' || this.state === 'cast' || this.state in STATE_ANIM; }
  atkList() { const d = this.def; return (d.attacks || []).concat(d.attackUp || [], d.attackDown || []); }   // todas as variações de golpe (índice usado na rede)
  ready(a) { return !this.dead && this.energy >= ABIL[a].cost && !((this.acd[a] || 0) > 0); }   // pronto para o botão (só energia/recarga)
  can(a) { const A = ABIL[a]; return !this.dead && !this.busy && this.energy >= A.cost && !((this.acd[a] || 0) > 0); }
  muzzle() { const d = this.def, h = d.muzzle !== undefined ? this.hand(d.muzzle) : null; return h || this.chest(); }   // ponto de onde saem as esferas (mão do quadro de disparo, se o personagem definir)
  chest() { const f = this.def.frames[frameAt(this.def, 'idle', 0)]; return { x: this.body.x + this.face * 12, y: this.body.y - f.ay * .5 }; }
  endForm() { if (!this.form) return; this.form = 0; this.dmgMul /= ABIL.form.dmg; this.body.speed = this.baseSpeed; }
  get powerCost() { return this.def.cast ? this.def.cast.cost : CFG.powerCost; }
  get powerReady() { return !this.dead && !this.busy && this.energy >= this.powerCost && this.pcd <= 0; }
  /* ---- poder em etapas (STREET): carregar → preparar → segurar na mão → lançar. A etapa atual vem do tempo decorrido. ---- */
  castSeg() { return this.def.cast ? segAt(this.state === 'big' ? bigSeq(this.def) : this.def.cast.seq, this.t) : null; }
  /* Botões da tela: recarga (0..1, 1 = acabou de usar) de cada ação; HABILIDADE ÚNICA vem de def.unique (cada personagem define a sua) */
  get hasBig() { return !!(this.def.cast && this.def.cast.seqLento && this.def.proj); }
  get unique() { return this.def.unique || null; }
  cdFrac(a) { const f = (v, m) => Math.max(0, Math.min(1, (v || 0) / m)); return a === 'small' ? f(this.pcd, this.def.cast ? this.def.cast.cd : CFG.power.cd) : a === 'big' ? f(this.acd[this.hasBig ? 'big' : 'sun'], ABIL[this.hasBig ? 'big' : 'sun'].cd) : a === 'unique' ? f(this.acd.burst, ABIL.burst.cd) : 0; }
  castFrame(cs) { const s = cs.seg, n = s.f.length; return s.f[s.loop ? Math.floor(cs.ts * s.fps) % n : Math.min(Math.floor(cs.ts * s.fps), n - 1)]; }
  pickAttack(inp) { const A = this.def.attacks, d = this.def;
    if (inp && d.attackUp && inp.up && !inp.down) { this.comboT = .8; return d.attackUp; }       // ↑ + soco (golpe para cima)
    if (inp && d.attackDown && inp.down && !inp.up) { this.comboT = .8; return d.attackDown; }  // ↓ + soco (golpe para baixo)
    if (this.comboT <= 0) this.combo = 0; const v = A[this.combo % A.length]; this.combo++; this.comboT = .8; return v; }  // soco → chute → soco…
  /* Efeitos de energia do STREET durante a carga: chamas de aura atrás do corpo; faíscas elétricas por cima na etapa intensa. */
  castFx(ctx, img, cs, front) {
    const fx = this.def.fx, id = cs.seg.fx, b = this.body, t = this.t; if (!id || !fx) return;
    if (!front) { const a = (id === 'charge2' ? .95 : .6) * (.8 + .2 * Math.sin(t * 34)); ctx.save(); ctx.globalAlpha = a;
      drawFrame(ctx, img, this.def, fx.wingL, b.x - 21, b.y + 3, 1); drawFrame(ctx, img, this.def, fx.wingR, b.x + 21, b.y + 3, 1); ctx.restore(); }
    else if (id === 'charge2') { ctx.save(); drawFrame(ctx, img, this.def, fx.sparks[Math.floor(t * 14) % 2], b.x, b.y - 3, 1); ctx.restore(); }
  }
  rect() { const b = this.body; return { l: b.x - b.w / 2, r: b.x + b.w / 2, t: b.y - b.h, b: b.y }; }
  set(s) { this.state = s; this.t = 0; this.fired = false; }
  /* posição (mundo) da mão no frame fi, já considerando para onde ele olha */
  hand(fi) { const f = this.def.frames[fi], h = f.hand, b = this.body; return h ? { x: b.x + this.face * (h.x - f.ax), y: b.y - f.ay + h.y } : null; }
  /* Esfera de energia: presa à mão enquanto carrega/segura; no lançamento acompanha o braço até soltar. null = sem esfera. */
  ball() {
    if (this.def.cast) return null;
    const C = CFG.charge, P = CFG.power, A = this.def.anims, hold = this.hand(A.charge.f[0]);
    if (this.state === 'charge') {
      const r = this.t < C.form ? C.r0 + (C.r1 - C.r0) * this.t / C.form : C.r1 + (C.r2 - C.r1) * Math.min(1, (this.t - C.form) / (C.dur - C.form));
      const h = this.hand(frameAt(this.def, 'charge', this.t)); return { x: h.x - this.face * 3, y: h.y - (r - 2) - 1, r };   // pousada acima da palma, um pouco atrás da cabeça          // pousada acima da palma
    }
    if (this.state === 'energy' && !this.fired) {
      const u = Math.min(1, this.t / P.fireAt), e = u * u * (3 - 2 * u), to = this.hand(A.energy.f[A.energy.f.length - 1]);
      return { x: hold.x + (to.x - hold.x) * e, y: hold.y - (C.r2 - 2) + (to.y - (hold.y - (C.r2 - 2))) * e, r: C.r2 + (P.release - C.r2) * e };
    }
    return null;
  }
  hurt(dmg, dir, kb, by) {
    if (this.dead) return;
    if (by && by.kbMul) kb *= by.kbMul;
    if (by) { this.lastBy = by; this.lastByT = performance.now(); }                                   // quem causou o dano (recompensa de abate)
    if (this.state === 'intro') return;                                                              // durante a introdução ninguém consegue acertar
    if (this.remote) { this.flash = .25; if (this.world) { this.world.fx.push({ x: this.body.x, y: this.body.y - 52, txt: String(Math.round(dmg)), t: 0 }); if (this.world.net) this.world.net.hit(this, dmg, dir, kb); } return; }   // réplica de outro jogador: o dono aplica o dano
    if (this.state === 'meditate') this.set('idle');                                                 // levar dano interrompe a meditação
    if (this.state === 'big' && !this.fired) { this.acd.big = 1.5; this.set('idle'); }                  // levar dano interrompe o carregamento do PODER GRANDE
    dmg /= this.defMul || 1; const guarded = this.state === 'shield' && dir === -this.face; if (guarded) dmg *= 1 - CFG.shieldReduce;
    this.hp = Math.max(0, this.hp - dmg); this.flash = .25; this.kb = dir * kb * (guarded ? .3 : 1);
    if (this.world) this.world.fx.push({ x: this.body.x, y: this.body.y - 52, txt: String(Math.round(dmg)), t: 0 });
    if (this.hp <= 0) { this.dead = true; this.rt = CFG.respawn; this.endForm(); this.set('idle'); return; }
    const A = this.def.anims;                                                                          // reações com quadros próprios (prioridade: ataque em andamento > reação)
    if (guarded && A.guardhit) { if (this.state === 'shield') this.set('guardhit'); }
    else if (!guarded && A.hurt && (!this.busy || this.state === 'hurt')) this.set(dmg >= 20 && A.hurtH ? 'hurtH' : 'hurt');
  }
  launch(world, proj, d) { world.projectiles.push(proj); if (world.net && !this.remote) world.net.proj(this, { ...d, face: this.face }); }
  /* Multiplayer: estado enviado ao servidor (jogador local ou bot do host) e aplicado nas réplicas dos outros clientes. */
  netState() {
    const b = this.body, r = Math.round;
    return { id: this.player.id, x: r(b.x * 10) / 10, y: r(b.y * 10) / 10, vx: r(b.vx), vy: r(b.vy), fl: b.flying ? 1 : 0, f: this.face, st: this.state, hp: r(this.hp * 10) / 10, en: r(this.energy), d: this.dead ? 1 : 0, fm: this.form > 0 ? 1 : 0,
      ai: this.av && this.def.attacks ? this.atkList().indexOf(this.av) : -1 };
  }
  applyNet(s, first) {
    const b = this.body; this.net = s; this.netAge = 0;
    if (first || Math.abs(s.x - b.x) > 120 || Math.abs(s.y - b.y) > 120) { b.x = s.x; b.y = s.y; }
    b.vx = s.vx; b.vy = s.vy; b.flying = !!s.fl; this.face = s.f; this.hp = s.hp; this.energy = s.en; this.form = s.fm ? 1 : 0;
    if (s.d && !this.dead) { this.dead = true; this.set('idle'); } else if (!s.d && this.dead) { this.dead = false; this.set('idle'); b.x = s.x; b.y = s.y; }
    if (s.st !== this.state) { this.set(s.st); if (s.st === 'attack') this.av = s.ai >= 0 && this.def.attacks ? this.atkList()[s.ai] : null; }
  }
  /* Quadro de uma réplica: só anima e suaviza a posição (o dono simula a física, a colisão e os golpes). */
  replicate(dt, world) {
    const b = this.body, n = this.net; this.t += dt; this.flash = Math.max(0, this.flash - dt); if (this.dead || !n) return;
    this.netAge += dt; const age = Math.min(this.netAge, .12), tx = n.x + n.vx * age, ty = n.y + n.vy * age, k = 1 - Math.pow(.0004, dt);
    b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
    this.fired = this.state === 'sun' ? this.t >= .6 : this.fired;
    if (this.state === 'burst' && !this.fired && this.t >= .25) { this.fired = true; (world.effects ||= []).push(new Ring(this.def, b.x, this.chest().y, 10, 72, .3, '#9fd8ff')); }
  }
  respawn() { const b = this.body; Object.assign(b, { x: this.spawn.x, y: this.spawn.y, vx: 0, vy: 0, flying: false }); this.hp = CFG.hp; this.energy = this.maxEn; this.dead = false; this.endForm(); this.set('idle'); }
  update(dt, inp, world) {
    const b = this.body, p = inp.pressed || {}; this.t += dt; this.dbg = null;
    if (this.kiRate !== 1 && (this.state === 'charge' || this.state === 'cast')) this.t += dt * (this.kiRate - 1);   // bots: escala o tempo de carregar Ki
    this.comboT = Math.max(0, this.comboT - dt); this.cd = Math.max(0, this.cd - dt); this.pcd = Math.max(0, this.pcd - dt); this.flash = Math.max(0, this.flash - dt);
    if (this.dead) { this.rt -= dt; if (this.rt <= 0) this.respawn(); return; }
    if (this.bot || this.dummy) this.energy = Math.min(this.maxEn, this.energy + CFG.regen * (this.form ? ABIL.form.regen : 1) * dt);   // Ki NÃO recarrega sozinho: o jogador carrega na mão (botão MEDITAR / tecla M). Só bots e o boneco de treino recarregam sozinhos.
    for (const k in this.acd) if (this.acd[k] > 0) this.acd[k] -= dt;
    if (this.form > 0 && (this.form -= dt) <= 0) this.endForm();                                        // a transformação acaba sozinha
    if (Math.abs(this.kb) > 5) { b.moveX(this.kb * dt); this.kb *= Math.pow(.001, dt); } else this.kb = 0;   // recuo (respeita a colisão)
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (!this.busy) {
      if (dir) this.face = dir;
      if (p.fly) b.flying = !b.flying;                                                                      // VOAR liga/desliga; ao desligar a gravidade volta
      if (p.power && this.powerReady) { this.energy -= this.powerCost; this.set(this.def.cast ? 'cast' : 'charge'); }   // 1) CHARGE
      else if (p.big && this.hasBig && this.can('big')) { this.energy -= ABIL.big.cost; this.set('big'); }                                  // PODER GRANDE: carrega e lança
      else if (p.big && !this.hasBig && this.can('sun')) { this.energy -= ABIL.sun.cost; this.set('sun'); }                                // personagem sem etapas de carga: usa a esfera solar
      else if (p.transform && this.form) { this.endForm(); this.acd.transform = ABIL.transform.cd; }      // Z de novo: volta ao normal
      else if (p.transform && this.can('transform')) { this.energy -= ABIL.transform.cost; this.set('transform'); }
      else if (p.special && this.can('burst')) { this.energy -= ABIL.burst.cost; this.set(this.def.dash ? 'dash' : 'burst'); this.dashHit = new Set(); }   // personagens com def.dash usam o movimento especial no lugar da onda de impacto
      else if (p.barrage && this.can('barrage')) { this.energy -= ABIL.barrage.cost; this.set('barrage'); this.shots = 0; }
      else if (p.sun && this.can('sun')) { this.energy -= ABIL.sun.cost; this.set('sun'); }
      else if (inp.meditate && b.grounded && !b.flying && this.energy < this.maxEn) this.set('meditate');
      else if (p.attack && this.cd <= 0) { this.set('attack'); this.hits = new Set(); this.av = this.def.attacks ? this.pickAttack(inp) : null; }
    }
    const a = this.av ? { ...CFG.attack, dur: this.av.dur, from: this.av.from_, to: this.av.to, reach: this.av.reach, dmg: this.av.dmg, kb: this.av.kb, vt: this.av.vt, vb: this.av.vb } : CFG.attack;
    if (this.state === 'attack') {
      if (this.t >= a.dur) { this.cd = a.cd; this.set('idle'); }
      else if (this.t >= a.from && this.t <= a.to) {
        const x0 = b.x + this.face * (b.w / 2 - 2), l = this.face > 0 ? x0 : x0 - a.reach, box = { l, r: l + a.reach, t: b.y - (a.vt || 36), b: b.y - (a.vb === undefined ? 6 : a.vb) }; this.dbg = box;
        for (const f of world.fighters) if (f !== this && !f.dead && !this.hits.has(f) && overlap(box, f.rect())) { this.hits.add(f); f.hurt(a.dmg * this.dmgMul, this.face, a.kb, this); }
      }
    } else if (this.state === 'charge') { if (this.t >= CFG.charge.dur) this.set('energy'); }                 // 2) segura/carrega na mão → 3) ENERGY ATTACK (varre o braço e solta)
    else if (this.state === 'cast') {                                                                            // STREET: o projétil só nasce na etapa 'fire'
      const cs = this.castSeg();
      if (!cs) { this.pcd = this.def.cast.cd; this.set('idle'); }
      else if (cs.seg.fire && !this.fired) { this.fired = true; const h = this.hand(this.castFrame(cs)); this.launch(world, new Shot(this, this.def.cast, h.x, h.y, this.face), { t: 'shot', x: h.x, y: h.y }); }
    }
    else if (this.state === 'big') {                                                                           // carregar → preparar → segurar → lançar (quadros reais do sheet)
      const cs = this.castSeg();
      if (!cs) { this.acd.big = ABIL.big.cd; this.set('idle'); }
      else if (cs.seg.fire && !this.fired) { this.fired = true; const h = this.hand(this.castFrame(cs)) || this.chest(); this.launch(world, new Shot(this, bigCfg(this.def), h.x, h.y, this.face), { t: 'shot', x: h.x, y: h.y, big: 1 }); }
    }
    else if (this.state === 'transform') {                                                                       // Z: aura (anim. de carregar) → ganha a forma
      if (this.t >= .05) { this.form = ABIL.form.dur; this.dmgMul *= ABIL.form.dmg; b.speed = this.baseSpeed * ABIL.form.speed; this.acd.transform = ABIL.transform.cd; (world.effects ||= []).push(new Ring(this.def, b.x, b.y - 20, 8, 70, .4, '#ffd34d')); this.set('idle'); }
    }
    else if (this.state === 'meditate') {                                                                       // meditar: segura para recarregar Ki
      if (!inp.meditate || !b.grounded || this.energy >= this.maxEn) this.set('idle'); else this.energy = Math.min(this.maxEn, this.energy + ABIL.meditateRate * (this.form ? ABIL.form.regen : 1) * dt);
    }
    else if (this.state === 'hurt') { if (this.t >= .26) this.set('idle'); }                                     // reação ao golpe (só quem tem os quadros)
    else if (this.state === 'hurtH') { if (this.t >= .44) this.set('idle'); }
    else if (this.state === 'guardhit') { if (this.t >= .2) this.set('idle'); }                                 // golpe absorvido pela defesa
    else if (this.state === 'intro') { if (this.t >= this.def.anims.intro.f.length / this.def.anims.intro.fps) this.set('idle'); }   // introdução: toca uma vez, sem repetir
    else if (this.state === 'dash') {                                                                           // movimento especial: redemoinho → pose → rastro de energia → recuperação
      const D = this.def.dash, cs = segAt(D.seq, this.t);
      if (!cs) { this.acd.burst = ABIL.burst.cd; this.set('idle'); }
      else if (cs.seg.move) {
        b.vy = 0; b.moveX(this.face * D.speed * dt); const r = this.rect();
        for (const f of world.fighters) if (f !== this && !f.dead && !this.dashHit.has(f) && overlap(r, f.rect())) { this.dashHit.add(f); f.hurt(D.dmg * this.dmgMul, this.face, D.kb, this); }
      }
    }
    else if (this.state === 'burst') {                                                                          // botão sem símbolo: onda de impacto nos dois lados
      if (!this.fired) { this.fired = true; const c = this.chest(); (world.effects ||= []).push(new Ring(this.def, b.x, c.y, 10, 72, .3, '#9fd8ff'));
        for (const f of world.fighters) if (f !== this && !f.dead && Math.abs(f.body.x - b.x) <= 72 && Math.abs(f.body.y - b.y) <= 50) f.hurt(18 * this.dmgMul, f.body.x >= b.x ? 1 : -1, 320, this); }
      if (this.t >= .3) { this.acd.burst = ABIL.burst.cd; this.set('idle'); }
    }
    else if (this.state === 'barrage') {                                                                        // energia rosa: 3 esferas rápidas
      if (this.shots < 3 && this.t >= this.shots * .1) { this.shots++; const c = this.muzzle(); this.launch(world, new KiBall(this, c.x, c.y, this.face, { r: 4, speed: 520, range: 420, dmg: 8, kb: 90, pal: PAL.pink }), { t: 'ball', x: c.x, y: c.y, o: { r: 4, speed: 520, range: 420, dmg: 8, kb: 90, pal: 'pink' } }); }
      if (this.t >= .35) { this.acd.barrage = ABIL.barrage.cd; this.set('idle'); }
    }
    else if (this.state === 'sun') {                                                                            // energia amarela: carrega na mão e lança uma esfera grande
      if (!this.fired) { this.fired = true; const c = this.muzzle(); this.launch(world, new KiBall(this, c.x, c.y, this.face, { r: 10, speed: 340, range: 520, dmg: 38, kb: 300, pal: PAL.yellow }), { t: 'ball', x: c.x, y: c.y, o: { r: 10, speed: 340, range: 520, dmg: 38, kb: 300, pal: 'yellow' } }); }
      if (this.t >= .3) { this.acd.sun = ABIL.sun.cd; this.set('idle'); }
    }
    else if (this.state === 'energy') {
      if (!this.fired && this.t >= CFG.power.fireAt) { this.fired = true; const h = this.hand(frameAt(this.def, 'energy', this.t)); this.launch(world, new Beam(this, h.x, h.y, this.face), { t: 'beam', x: h.x, y: h.y }); } // solta da mão estendida // 4) projétil
      if (this.t >= CFG.power.dur) { this.pcd = CFG.power.cd; this.set('idle'); }
    }
    const free = !this.busy, shield = free && (inp.down || inp.guard) && b.grounded && !b.flying, mv = free && !shield;
    b.step(dt, { left: mv && inp.left, right: mv && inp.right, jump: mv && inp.up && !b.flying, up: mv && inp.up, down: mv && inp.down });
    if (!this.busy) {                                                                                       // animação conforme o estado atual
      const ns = shield ? 'shield' : b.flying ? 'fly' : !b.grounded ? (b.vy < 0 ? 'jump' : 'fall') : (mv && dir && b.vx ? 'run' : 'idle');
      if (ns !== this.state) this.set(ns);
    }
  }
  drawFly(ctx, img, fi, k) {   // animação procedural do voo (o sheet só tem 1 quadro de voo)
    const b = this.body, T = performance.now() / 1000, fs = b.flySpeed || 230, vx = b.vx || 0, vy = b.vy || 0, sp = Math.hypot(vx, vy);
    const bob = Math.sin(T * 7) * 2.2 + Math.sin(T * 3.1) * 1.2, lean = Math.max(-.4, Math.min(.4, vx / fs * .4)) + (vy / fs) * .1 * this.face;
    if (!this.def.bakedAura) drawAura(ctx, img, this.def, fi, b.x, b.y + bob, this.face, .4 + .15 * Math.sin(T * 10), T, '#7fdcff');
    if (sp > 25) for (let g = 3; g >= 1; g--) { ctx.save(); ctx.globalAlpha = .16 * (4 - g) / 3 * Math.min(1, sp / fs); drawFrame(ctx, img, this.def, fi, b.x - vx * .035 * g, b.y + bob - vy * .035 * g, this.face); ctx.restore(); }
    ctx.save(); ctx.translate(Math.round(b.x), Math.round(b.y - 20 + bob)); ctx.rotate(lean); drawFrame(ctx, img, this.def, fi, 0, 20, this.face); ctx.restore();
  }
  draw(ctx, img) {
    if (this.dead) {                                                                                   // K.O.: quadro 'ko' se o personagem tiver; senão cai para trás e some aos poucos até renascer
      const b = this.body, A = this.def.anims.ko; ctx.save();
      if (A) drawFrame(ctx, img, this.def, frameAt(this.def, 'ko', this.t), b.x, b.y, this.face);
      else {
        const now = performance.now(); if (!this._dAt) this._dAt = now; const e = (now - this._dAt) / 1000, k = Math.min(1, e / .32), ease = 1 - (1 - k) * (1 - k);
        ctx.globalAlpha = Math.max(0, Math.min(1, 1.6 - e)); ctx.translate(Math.round(b.x - this.face * 6 * ease), Math.round(b.y - 10 * ease)); ctx.rotate(-this.face * ease * Math.PI / 2);
        drawFrame(ctx, img, this.def, frameAt(this.def, 'hurt' in this.def.anims ? 'hurt' : 'fall', 0), 0, 0, this.face);
      }
      ctx.restore(); return;
    }
    this._dAt = 0;
    const b = this.body; let fi, cs = null;
    if (this.state === 'cast' || this.state === 'big') { const q = this.state === 'big' ? bigSeq(this.def) : this.def.cast.seq; cs = this.castSeg() || { seg: q[q.length - 1], ts: q[q.length - 1].dur - 1e-6, i: q.length - 1 }; fi = this.castFrame(cs); }
    else if (this.state === 'attack' && this.av) { const v = this.av; fi = v.f[Math.min(Math.floor(this.t * v.fps), v.f.length - 1)]; }
    else if (this.state === 'dash') { const D = segAt(this.def.dash.seq, this.t) || { seg: this.def.dash.seq[this.def.dash.seq.length - 1], ts: 1 }, s = D.seg; fi = s.f[Math.floor(D.ts * s.fps) % s.f.length]; }
    else fi = frameAt(this.def, animOf(this, this.state), this.t);
    const f = this.def.frames[fi];
    ctx.save(); if (this.flash > 0 && Math.floor(this.flash * 30) % 2) ctx.globalAlpha = .45;
    const k = this.state === 'charge' ? Math.min(1, this.t / CFG.charge.dur) : this.state === 'energy' ? Math.max(0, 1 - this.t / CFG.power.dur) : (this.state === 'transform' || this.state === 'meditate' || this.state === 'sun') ? Math.min(1, .35 + this.t) : 0;
    const sh = this.state === 'charge' && k > .6 ? (Math.floor(this.t * 30) % 2 ? 1 : -1) : 0;                     // tremor leve quando a carga está alta
    const bl = this.ball(), behind = false;                                               // segurando: esfera atrás da cabeça/mão
    if (cs) this.castFx(ctx, img, cs, false);
    if (!this.def.bakedAura) drawAura(ctx, img, this.def, fi, b.x + sh, b.y, this.face, k, this.t, this.state === 'meditate' ? '#4fd6ff' : '#c24bff');   // personagens com aura desenhada no próprio sheet não ganham contorno extra
    if (this.form > 0 && k === 0) drawAura(ctx, img, this.def, fi, b.x, b.y, this.face, .55, this.t, '#ffd34d');                                   // transformado: contorno dourado
    if (this.state === 'meditate') drawKiFx(ctx, b.x, b.y, f.ay, this.t);                                  // CARREGAR KI: ondas, coluna de luz e faíscas
    if (behind) drawOrb(ctx, bl.x + sh, bl.y, bl.r, this.t);
    if (b.flying && this.state === 'fly') this.drawFly(ctx, img, fi, k);   // voo: balanço, inclinação, rastro e aura pulsante
    else drawFrame(ctx, img, this.def, fi, b.x + sh, b.y, this.face);
    if (cs) this.castFx(ctx, img, cs, true); ctx.restore();
    if (this.state === 'big' && !this.fired) { const tot = bigSeq(this.def).reduce((a, q) => a + q.dur, 0) - bigSeq(this.def).slice(-1)[0].dur, u = Math.min(1, this.t / tot), h = this.hand(fi) || this.chest(); drawOrb(ctx, h.x, h.y - 4, 2 + 9 * u, this.t, PAL.pink); }   // esfera crescendo na mão enquanto carrega
    if (bl && !behind) drawOrb(ctx, bl.x + sh, bl.y, bl.r, this.t);
    if (this.state === 'sun' && !this.fired && !this.def.bakedAura) { const c = this.chest(); drawOrb(ctx, c.x + this.face * 4, c.y, 2 + 8 * Math.min(1, this.t / .6), this.t, PAL.yellow); }   // esfera solar crescendo na mão                                                 // lançando: esfera à frente do braço
    if (!this.me) {
      const top = b.y - f.ay - 6, w = 28; ctx.fillStyle = '#10042a'; ctx.fillRect(b.x - w / 2 - 1, top - 1, w + 2, 5);
      ctx.fillStyle = '#e0304f'; ctx.fillRect(b.x - w / 2, top, w * Math.max(0, this.hp / CFG.hp), 3);
      ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(this.player.name, b.x, top - 3);
    }
  }
}
SL.PAL = PAL;
Object.assign(SL, { bigCfg, Fighter, segAt, Beam, Shot, Effect, KiBall, Ring, ABILITIES: ABIL, CombatCFG: CFG, frameAt, drawFrame });
})();
