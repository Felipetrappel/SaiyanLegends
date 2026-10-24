/* IA dos bots. Cada bot tem um BotBrain que, a cada frame, devolve um "input" (esquerda/direita/pular/defender + toques de
   ataque/poder/voar) — o MESMO formato que o teclado gera. Quem executa movimento, colisão, animação, dano, HP e EN é o
   Fighter de sempre; a IA nunca mexe em posição/HP e não teleporta: ela só "aperta botões".
   Autoridade: só roda no cliente que é a autoridade da sala (o host, em GameScene `authority`); os demais clientes recebem
   o resultado (num servidor real, o servidor chama BotBrain.think e replica o estado).

   Máquina de estados (entrada → saída):
     IDLE      sem alvo; patrulha curta.                         → DETECT quando há jogador dentro de detectRange (ou ao levar dano)
     DETECT    vira para o alvo e "reage" (reactTime).           → CHASE ao fim do tempo | IDLE se perder o alvo
     CHASE     corre/pula/voa até o alvo.                        → APPROACH perto o bastante | IDLE se perder o alvo (loseRange/loseTime)
     APPROACH  ajusta a distância e escolhe soco ou poder.       → ATTACK ao alcance | RETREAT (perto demais p/ poder) | CHASE se o alvo fugiu
     ATTACK    1 toque de ataque/poder + espera a animação.      → RECOVER ao terminar (ou APPROACH se o alvo saiu do alcance antes do golpe)
     DEFEND    escudo (ou pulo) contra golpe/projétil.           → RECOVER quando a ameaça passa (ou após defendMax)
     RETREAT   recua do alvo.                                    → APPROACH após o tempo, ao ganhar distância ou ao bater em parede/buraco
     RECOVER   fica parado (janela para o jogador reagir).       → APPROACH/CHASE ao fim; RETREAT se o alvo colou nele
     DEAD      derrotado: sem input; volta a IDLE ao renascer.
   Tempos mínimos em cada estado + cooldowns (retreatCd, defendLock, flyCd, jumpCd) evitam trocas de estado em todo frame. */
(() => {
'use strict';
const CC = SL.CombatCFG;

/* ---- parâmetros de balanceamento (todos ajustáveis; pode-se passar um objeto próprio por bot) ---- */
const BOT = {
  detectRange: 650,            // px: distância para notar um jogador
  loseRange: 950, loseTime: 2.5, // px/s: além disso por loseTime segundos o bot desiste do alvo
  alertTime: 4,                // s com alcance de detecção ampliado depois de levar dano
  reactTime: [.25, .5],        // s entre notar o alvo e correr atrás
  moveSpeed: .85,              // × velocidade de corrida do jogador (perseguição)
  flySpeed: .85,               // × velocidade de voo do jogador
  approachDist: 90,            // px: a partir daqui deixa de correr e começa a ajustar o espaçamento
  attackSlack: 12,             // px: folga além do alcance do golpe para iniciar o soco
  meleeInterval: [.45, 1.0],   // s de recuperação depois de uma sequência de socos (intervalo entre golpes)
  comboMax: 2, comboGap: [.08, .22], // nº máx. de golpes seguidos e pausa entre eles
  damageMul: .8,               // × o dano dos ataques do personagem (golpes e poderes)
  powerChance: .35,            // chance (por aproximação) de preferir o poder à distância
  powerMinDist: 150, powerMaxDist: 400, powerRecover: [.7, 1.2], // faixa de distância do poder e recuperação após ele
  kiTimeScale: 1,              // × duração do carregamento de Ki (2 = carrega em metade da velocidade; .5 = carrega rápido)
  defendChance: { melee: .35, proj: .6 }, jumpDodgeChance: .35, // chance de reagir a golpe corpo a corpo / projétil; pular em vez de defender
  defendReact: { melee: .03, proj: .14 }, defendMin: .35, defendMax: 1.0, defendLock: .9,
  retreatDist: 28,             // px: perto demais → recua
  retreatTime: [.4, .8], retreatChance: .35, retreatChanceLowHp: .75, retreatHp: .3, retreatCooldown: 1.8,
  threatDist: 260,             // px: distância em que um projétil conta como ameaça
  fightBots: false,            // false = só enfrenta jogadores humanos (bots não brigam entre si)
  wander: true
};

const S = Object.freeze({ IDLE: 'IDLE', DETECT: 'DETECT', CHASE: 'CHASE', APPROACH: 'APPROACH', ATTACK: 'ATTACK', DEFEND: 'DEFEND', RETREAT: 'RETREAT', RECOVER: 'RECOVER', DEAD: 'DEAD' });
const R = (a, b) => a + Math.random() * (b - a), rr = r => R(r[0], r[1]), sgn = v => (v < 0 ? -1 : 1);

class BotBrain {
  constructor(f, cfg = BOT) {
    this.f = f; this.c = Object.create(cfg); this.state = S.IDLE;   // c herda de BOT (ajuste ao vivo) e aceita override por bot this.t = 0; this.target = null; this.lost = 0; this.alert = 0; this.lastHp = f.hp;
    this.jit = R(-6, 10); this.plan = null; this.stuck = 0; this.sT = 0; this.sTry = 0; this.sX = f.body.x;
    this.ignore = null; this.side = null; this.stuckT = 0; this.flyCd = 0; this.jumpCd = 0; this.retreatCd = 0; this.defendLock = 0; this.threatT = 0; this.threatGone = 1; this.roll = false; this.idleDir = 0; this.idleT = 0;
    this.log = []; this.stats = { attacks: 0, powers: 0, defends: 0, retreats: 0, transitions: 0 };
    f.bot = true; f.brain = this; f.body.speed *= cfg.moveSpeed; f.body.flySpeed *= cfg.flySpeed; f.dmgMul = cfg.damageMul; f.kiRate = 1 / cfg.kiTimeScale;   // (aplicados na criação)
  }
  go(s, a) {
    if (s === this.state) return; this.state = s; this.t = 0; this.stats.transitions++; this.log.push(s); if (this.log.length > 40) this.log.shift();
    if (s === S.IDLE) { this.idleT = R(.4, 1.2); this.idleDir = 0; }
    else if (s === S.DETECT) this.wait = rr(this.c.reactTime);
    else if (s === S.APPROACH) this.plan = a || this.decidePlan();
    else if (s === S.CHASE) this.plan = this.decidePlan();                 // já decide aqui se vai querer poder à distância
    else if (s === S.ATTACK) { this.plan = a; this.pressed = false; this.seenBusy = false; this.gap = 0; this.hits = a.type === 'melee' ? 1 + Math.floor(Math.random() * this.c.comboMax) : 1; }
    else if (s === S.RECOVER) this.recT = a;
    else if (s === S.RETREAT) { this.retT = rr(this.c.retreatTime); this.stats.retreats++; }
    else if (s === S.DEFEND) { this.def = a; this.stats.defends++; this.defT = 0; this.free = 0; }
  }

  /* ---------- percepção ---------- */
  candidates(w) { const f = this.f; return w.fighters.filter(o => o !== f && !o.dead && (this.c.fightBots || !o.bot)); }
  pickTarget(w, dt) {
    const f = this.f, b = f.body, c = this.c, list = this.candidates(w).filter(o => !(this.ignore && this.ignore.who === o && this.ignore.t > 0)), d = o => Math.hypot(o.body.x - b.x, (o.body.y - b.y) * 1.5);
    if (this.target && (this.target.dead || !list.includes(this.target))) this.target = null;
    if (this.target) {
      this.lost = d(this.target) > c.loseRange ? this.lost + dt : 0; if (this.lost > c.loseTime) { this.target = null; this.lost = 0; }
    }
    const reach = this.alert > 0 ? c.loseRange : c.detectRange; let best = this.target, bd = best ? d(best) : 1e9;
    for (const o of list) { const k = d(o); if (k < reach && k < bd * (best ? .6 : 1)) { best = o; bd = k; } }   // só troca de alvo se o novo estiver bem mais perto
    this.target = best;
  }
  /* golpe corpo a corpo ou projétil vindo na minha direção */
  findThreat(w) {
    const f = this.f, b = f.body, c = this.c; let best = null;
    for (const o of w.fighters) {
      if (o === f || o.dead || (o.bot && !c.fightBots)) continue;
      if (o.state === 'attack' && o.t < (o.av ? o.av.to : CC.attack.to)) {
        const reach = o.av ? o.av.reach : CC.attack.reach, dx = (b.x - o.body.x) * o.face, dy = Math.abs(b.y - o.body.y);
        if (dx > -4 && dx < reach + 22 && dy < 40) { const t = { kind: 'melee', dir: -o.face, dist: Math.abs(dx) }; if (!best || t.dist < best.dist) best = t; }
      }
    }
    for (const p of w.projectiles) {
      if (p.owner === f || p.dead || p.ending || (p.owner.bot && !c.fightBots)) continue;
      const rel = (b.x - p.head) * p.face; if (rel < 0 || rel > c.threatDist || Math.abs(p.yc - (b.y - 19)) > 36) continue;
      if (!best || rel < best.dist) best = { kind: 'proj', dir: -p.face, dist: rel };
    }
    return best;
  }
  /* o terreno entre mim e o alvo está livre para um projétil? */
  clearLine(w, tx, ty) {
    const b = this.f.body, x0 = b.x, y0 = b.y - 24, n = Math.max(1, Math.ceil(Math.abs(tx - x0) / 8));
    for (let i = 1; i < n; i++) if (w.mask.at(Math.floor(x0 + (tx - x0) * i / n), Math.floor(y0 + (ty - 24 - y0) * i / n))) return false;
    return true;
  }
  obstacleAhead(dir) { const b = this.f.body; for (let k = 0; k <= b.stepUp; k++) if (b.free(b.x + dir * 3, b.y - k)) return false; return true; }
  pitAhead(dir) { const b = this.f.body, m = b.mask; return m.surfaceY(Math.floor(b.x + dir * 18), Math.floor(b.y - 10)) - b.y > 100; }
  meleeReach() { const f = this.f, A = f.def.attacks; return A ? (f.comboT > 0 ? A[f.combo % A.length] : A[0]).reach : CC.attack.reach; }
  rangedMax() { const f = this.f; return Math.min(this.c.powerMaxDist, (f.def.cast ? f.def.cast.range : CC.power.range) - 60); }

  decidePlan() {
    const f = this.f, c = this.c, t = this.target; if (!t) return { type: 'melee' };
    const dx = Math.abs(t.body.x - f.body.x), punish = (t.state === 'charge' || t.state === 'cast') && dx < 300;     // alvo carregando poder: parte pra cima
    if (!punish && f.powerReady && Math.abs(t.body.y - f.body.y) < 60 && dx <= this.rangedMax() + 60 && Math.random() < c.powerChance * (dx > 200 ? 1.6 : 1))
      return { type: 'ranged', dist: R(c.powerMinDist + 20, this.rangedMax() - 20) };
    return { type: 'melee' };
  }

  /* ---------- movimento (só gera input; colisão/gravidade são do Body) ---------- */
  turn(inp, dir) { // vira sem andar: o escudo trava o movimento mas a direção do input ainda atualiza o "face"
    const f = this.f; if (f.face === dir) return false;
    if (f.body.grounded && !f.body.flying && !f.busy) inp.guard = true; inp[dir > 0 ? 'right' : 'left'] = true; return true;
  }
  nav(inp, tx, ty, stopDx = 0) {
    const f = this.f, b = f.body, dx = tx - b.x, dy = ty - b.y, dir = sgn(dx), t = this.target, tFly = t && t.body.flying;
    if (this.side && b0free(this.f)) this.side.t = Math.min(this.side.t, .2);
    if (this.side && this.side.t > 0) { if (this.obstacleAhead(this.side.dir)) this.side.dir = -this.side.dir; inp[this.side.dir > 0 ? 'right' : 'left'] = true; }   // desvia para o lado quando a cabeça bate numa plataforma
    const climb = dy < -55, below = dy > 45, moving = Math.abs(dx) > (climb || below ? 6 : stopDx);   // alvo em outro nível: chega até a borda/embaixo da plataforma em vez de parar ao lado
    if (!b.flying) {
      if (this.flyCd <= 0 && ((climb && (dy < -125 || tFly || this.stuck >= 1)) || (moving && b.grounded && !below && this.pitAhead(dir) && Math.abs(dx) > 60) || this.stuck >= 2)) { inp.pressed.fly = true; this.flyCd = 1; }
      if (moving) inp[dir > 0 ? 'right' : 'left'] = true;
      if (climb && b.grounded && Math.abs(dx) < 40 && !b.free(b.x, b.y - 24)) this.side = { dir: (this.side && this.side.dir) || (Math.random() < .5 ? -1 : 1), t: .9 };
      if (b.grounded && this.jumpCd <= 0 && ((moving && this.obstacleAhead(dir)) || (climb && Math.abs(dx) < 130 && dy > -125) || (this.stuck >= 1 && moving))) { inp.up = true; this.jumpCd = .5; }
    } else {
      const headOk = dy >= -20 || b.free(b.x + dir * 16, b.y - 50);        // voando para cima: não anda para debaixo de uma plataforma; sobe ao lado e só depois avança
      if (moving && headOk) inp[dir > 0 ? 'right' : 'left'] = true;
      if (dy < -10 && !b.free(b.x, b.y - 3)) this.side = { dir: (this.side && this.side.dir) || (dir ? -dir : 1), t: 1.6 };
      if ((dy < -10 || (moving && this.obstacleAhead(dir)) || this.stuck >= 2) && b.y > 70) inp.up = true; else if (dy > 10) inp.down = true;   // (b.y > 70: não sai pelo topo do mapa)
      if (this.flyCd <= 0 && !climb && !tFly && Math.abs(dy) <= 14 && this.stuck < 2) { inp.pressed.fly = true; this.flyCd = .8; }   // alvo no chão e ao alcance: pousa
    }
  }
  watchStuck(dt, inp) {
    const b = this.f.body; if ((inp.left || inp.right) && !this.f.busy) this.sTry += dt; this.sT += dt;
    if (this.sT >= .5) {
      if (this.sTry >= .4 && Math.abs(b.x - this.sX) < 4 && !(inp.guard)) this.stuck = Math.min(6, this.stuck + 1); else if (this.sTry >= .3) this.stuck = Math.max(0, this.stuck - 1);
      this.sT = 0; this.sTry = 0; this.sX = b.x;
    }
  }

  /* ---------- ciclo principal ---------- */
  think(dt, w) {
    const f = this.f, b = f.body, c = this.c, inp = { left: false, right: false, up: false, down: false, guard: false, pressed: {} };
    this.t += dt; this.flyCd -= dt; this.jumpCd -= dt; this.retreatCd -= dt; this.defendLock -= dt; this.alert -= dt; if (this.ignore) this.ignore.t -= dt; if (this.side) this.side.t -= dt;
    if (f.dead) { this.go(S.DEAD); this.target = null; return inp; }
    if (this.state === S.DEAD) { this.go(S.IDLE); this.lastHp = f.hp; this.stuck = 0; }
    if (f.hp < this.lastHp - .01) this.alert = c.alertTime; this.lastHp = f.hp;
    this.stuckT = this.stuck >= 4 ? this.stuckT + dt : 0;                      // preso há muito tempo (alvo inalcançável): desiste dele por um tempo
    if (this.stuckT > 3 && this.target) { this.ignore = { who: this.target, t: 5 }; this.target = null; this.stuck = 0; this.stuckT = 0; this.go(S.IDLE); }
    this.pickTarget(w, dt);
    const t = this.target, dx = t ? t.body.x - b.x : 0, dy = t ? t.body.y - b.y : 0, dist = Math.abs(dx), dirT = sgn(dx);
    if (!t && this.state !== S.IDLE && this.state !== S.ATTACK && this.state !== S.DEFEND) this.go(S.IDLE);

    /* reação a ameaças (golpe/projétil), em qualquer estado em que o bot esteja livre */
    if (!f.busy && this.state !== S.DEFEND && this.state !== S.ATTACK) {
      const th = this.findThreat(w);
      if (th) {
        if (this.threatGone > .2) { this.roll = Math.random() < c.defendChance[th.kind]; this.threatT = 0; this.threatGone = 0; }
        this.threatT += dt; this.threatGone = 0;
        if (this.roll && this.threatT >= c.defendReact[th.kind] && this.defendLock <= 0 && b.grounded && !b.flying) {
          const jump = th.kind === 'proj' && th.dist > 90 && Math.random() < c.jumpDodgeChance;
          this.go(S.DEFEND, { ...th, jump }); this.roll = false;
        }
      } else this.threatGone += dt;
    }

    switch (this.state) {
      case S.IDLE: {
        if (t) { this.go(S.DETECT); break; }
        if (b.flying && this.flyCd <= 0) { inp.pressed.fly = true; this.flyCd = 1; }          // sem alvo: pousa
        if (!c.wander) break;
        this.idleT -= dt; if (this.idleT <= 0) { this.idleDir = this.idleDir ? 0 : (Math.random() < .5 ? -1 : 1); this.idleT = this.idleDir ? R(.5, 1.2) : R(.6, 1.6); }
        if (this.idleDir) { if (this.obstacleAhead(this.idleDir) || this.pitAhead(this.idleDir)) this.idleDir = -this.idleDir; inp[this.idleDir > 0 ? 'right' : 'left'] = true; }
        break;
      }
      case S.DETECT: {
        this.turn(inp, dirT); if (this.t >= this.wait) this.go(dist <= c.approachDist && Math.abs(dy) <= 50 ? S.APPROACH : S.CHASE);
        break;
      }
      case S.CHASE: {
        const pl = this.plan;
        if (pl && pl.type === 'ranged' && f.powerReady && dist <= pl.dist + 40 && dist >= c.powerMinDist && Math.abs(dy) <= 60 && this.clearLine(w, t.body.x, t.body.y)) { this.go(S.APPROACH, pl); break; }
        if (dist <= c.approachDist && Math.abs(dy) <= 50) { this.go(S.APPROACH); break; }
        this.nav(inp, t.body.x, t.body.y, c.approachDist * .6); break;
      }
      case S.APPROACH: {
        const p = this.plan || { type: 'melee' }, reach = this.meleeReach();
        if (dist > (p.type === 'ranged' ? this.rangedMax() + 60 : c.approachDist + 70) || Math.abs(dy) > 90) { this.go(S.CHASE); break; }
        if (this.t > 3.5) { this.go(S.CHASE); this.retreatCd = Math.max(this.retreatCd, .5); break; }
        if (p.type === 'ranged') {
          if (!f.powerReady) { this.plan = { type: 'melee' }; break; }
          if (dist < c.powerMinDist) { if (this.retreatCd <= 0) this.go(S.RETREAT); else this.plan = { type: 'melee' }; break; }
          if (dist > p.dist + 40) { this.nav(inp, t.body.x, t.body.y, p.dist); break; }
          if (Math.abs(dy) > 24) { if (b.flying) this.nav(inp, b.x, t.body.y, 1e9); else this.plan = { type: 'melee' }; break; }
          if (!this.clearLine(w, t.body.x, t.body.y)) { this.plan = { type: 'melee' }; break; }
          if (this.turn(inp, dirT)) break;
          this.go(S.ATTACK, { type: 'ranged' }); break;
        }
        const stand = reach + 8 + this.jit * .5;
        if (dist > stand + 4 || Math.abs(dy) > 28) { this.nav(inp, t.body.x, t.body.y, stand); if (dist <= reach + c.attackSlack && Math.abs(dy) <= 28 && f.face === dirT) this.go(S.ATTACK, { type: 'melee' }); break; }
        if (this.turn(inp, dirT)) break;
        if (dist < c.retreatDist && this.retreatCd <= 0 && Math.random() < .02) { this.go(S.RETREAT); break; }
        if (f.cd <= 0) this.go(S.ATTACK, { type: 'melee' });
        break;
      }
      case S.ATTACK: {
        const p = this.plan;
        if (!t && !f.busy) { this.go(S.RECOVER, .3); break; }
        if (this.t > 5) { this.go(S.RECOVER, 1); break; }
        if (!this.pressed) {                                                // antes do toque: vira, alinha, confere o alcance
          if (!t) { this.go(S.IDLE); break; }
          if (p.type === 'melee' && (dist > this.meleeReach() + c.attackSlack + 14 || Math.abs(dy) > 34)) { this.go(S.APPROACH); break; }
          if (this.turn(inp, dirT)) break;
          if (b.flying && Math.abs(dy) > 10 && p.type === 'melee') { inp[dy < 0 ? 'up' : 'down'] = true; break; }
          if (this.gap > 0) { this.gap -= dt; break; }
          if (p.type === 'melee' ? f.cd <= 0 : f.powerReady) { inp.pressed[p.type === 'melee' ? 'attack' : 'power'] = true; this.pressed = true; this.seenBusy = false; this.pt = 0; p.type === 'melee' ? this.stats.attacks++ : this.stats.powers++; }
          break;
        }
        this.pt += dt;                                                      // depois do toque: espera a animação terminar
        if (f.busy) this.seenBusy = true;
        else if (this.seenBusy) {
          this.hits--; this.pressed = false;
          if (p.type === 'melee' && this.hits > 0 && t && dist <= this.meleeReach() + c.attackSlack + 14) { this.gap = rr(c.comboGap); break; }
          this.go(S.RECOVER, p.type === 'melee' ? rr(c.meleeInterval) : rr(c.powerRecover));
        } else if (this.pt > .4) this.pressed = false;                      // o toque não pegou (cooldown etc.): tenta de novo
        break;
      }
      case S.DEFEND: {
        const d = this.def; this.defT += dt;
        if (!findAny(this, w, d)) this.free += dt; else this.free = 0;
        if (d.jump) { if (this.defT < .05 && b.grounded) inp.up = true; if (this.defT > .55 || (this.defT > .1 && b.grounded)) { this.defendLock = c.defendLock * .5; this.go(S.RECOVER, .15); } break; }
        inp.guard = true; inp[d.dir > 0 ? 'right' : 'left'] = true;           // escudo virado para a ameaça (sem andar)
        if ((this.defT >= c.defendMin && this.free > .25) || this.defT >= c.defendMax || !b.grounded) { this.defendLock = c.defendLock; this.go(S.RECOVER, .12); }
        break;
      }
      case S.RETREAT: {
        const dir = -dirT, goal = (this.plan && this.plan.type === 'ranged' ? c.powerMinDist + 30 : c.retreatDist + 70);
        if (this.t >= this.retT || dist >= goal || this.obstacleAhead(dir) || (b.grounded && this.pitAhead(dir))) { this.retreatCd = c.retreatCooldown; this.go(S.APPROACH); break; }
        inp[dir > 0 ? 'right' : 'left'] = true; break;
      }
      case S.RECOVER: {
        if (t) this.turn(inp, dirT);
        if (this.t < this.recT) break;
        const low = f.hp / CC.hp < c.retreatHp;
        if (t && dist < c.retreatDist + 6 && this.retreatCd <= 0 && Math.random() < (low ? c.retreatChanceLowHp : c.retreatChance)) { this.go(S.RETREAT); break; }
        this.go(t && dist <= c.approachDist && Math.abs(dy) <= 50 ? S.APPROACH : S.CHASE); break;
      }
    }
    if (inp.pressed.fly && f.busy) delete inp.pressed.fly;
    this.watchStuck(dt, inp);
    return inp;
  }
}
const b0free = f => f.body.flying && f.body.free(f.body.x, f.body.y - 60);
/* a ameaça que originou o DEFEND ainda existe? */
function findAny(brain, w, d) { const th = brain.findThreat(w); return !!th && th.kind === d.kind; }

/* Personagem de cada bot: alterna entre os personagens existentes (determinístico, igual em todos os clientes). */
const characterFor = n => { const ids = Object.keys(SL.Characters.all); return ids[n % ids.length]; };
SL.BotAI = { BotBrain, CFG: BOT, States: S, characterFor };
})();
