/* Colisão por máscara de cor (fonte de verdade = imagem da máscara, 1:1 com o mapa).
 *   #EB1818 → BLOCKED (teto/área bloqueada)   #CA0186 → WALKABLE (chão/plataformas)
 *   #7D1379 → SUB (subcolisão/anti-stuck)     qualquer outra cor → NONE (ar/cenário, sem colisão)
 * Camadas independentes no mesmo grid (Uint8Array), consultadas por CollisionMask.at(x, y).
 * Regra física: o corpo nunca ocupa um pixel BLOCKED/WALKABLE/SUB; só se anda SOBRE o rosa (topo das superfícies). */
(() => {
'use strict';
const CLASS = Object.freeze({ NONE: 0, BLOCKED: 1, WALKABLE: 2, SUB: 3, EDGE: 4 }); // EDGE = limite do mapa (sólido)
const KEYS = [[CLASS.BLOCKED, 235, 24, 24], [CLASS.WALKABLE, 202, 1, 134], [CLASS.SUB, 125, 19, 121]]; // ordem = prioridade
const TOL = 10; // por canal; o cenário não tem nenhuma cor a menos de 24 de distância destas
const HOLE = { maxArea: 3000, maxSide: 80, purity: .9 };

const classify = (r, g, b, tol = TOL) => {
  for (const [c, R, G, B] of KEYS) if (Math.abs(r - R) <= tol && Math.abs(g - G) <= tol && Math.abs(b - B) <= tol) return c;
  return CLASS.NONE;
};

class CollisionMask {
  constructor(w, h, cls) { this.w = w; this.h = h; this.cls = cls; this.filled = []; }
  static fromRGBA(d, w, h) {
    const cls = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < cls.length; i++, p += 4) cls[i] = classify(d[p], d[p + 1], d[p + 2]);
    const m = new CollisionMask(w, h, cls); m._fillLabels(); return m;
  }
  /* Laterais e fundo do mapa são sólidos; acima do topo é céu aberto. */
  at(x, y) { if (x < 0 || x >= this.w || y >= this.h) return CLASS.EDGE; return y < 0 ? 0 : this.cls[y * this.w + x]; }
  surfaceY(x, y0 = 0) { for (let y = y0; y < this.h; y++) if (this.at(x, y)) return y; return this.h; }
  stats() { const s = [0, 0, 0, 0]; for (let i = 0; i < this.cls.length; i++) s[this.cls[i]]++; return s; }
  /* Os textos escritos na máscara ("TETO", "chão") são pixels de outra cor, ou seja, buracos de 'sem colisão'
     dentro de uma área pintada. Manchas pequenas, fechadas e cercadas por UMA só cor recebem essa cor.
     Bolsões de cenário maiores (poços etc.) e qualquer coisa encostada na borda da imagem ficam intactos. */
  _fillLabels() {
    const { w, h, cls } = this, n = w * h, seen = new Uint8Array(n), stack = new Int32Array(n), list = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (cls[s] || seen[s]) continue;
      let sp = 0, len = 0, minx = w, maxx = 0, miny = h, maxy = 0, border = false; const hist = [0, 0, 0, 0];
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const p = stack[--sp]; list[len++] = p; const x = p % w, y = (p / w) | 0;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (!x || !y || x === w - 1 || y === h - 1) border = true;
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx; if (cls[q]) hist[cls[q]]++; else if (!seen[q]) { seen[q] = 1; stack[sp++] = q; }
        }
      }
      if (border || len > HOLE.maxArea || maxx - minx >= HOLE.maxSide || maxy - miny >= HOLE.maxSide) continue;
      const tot = hist[1] + hist[2] + hist[3], best = hist[1] >= hist[2] && hist[1] >= hist[3] ? 1 : hist[2] >= hist[3] ? 2 : 3;
      if (tot && hist[best] / tot >= HOLE.purity) {
        for (let i = 0; i < len; i++) cls[list[i]] = best;
        this.filled.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, area: len, cls: best });
      }
    }
  }
}

/* Corpo com collider retangular (x = centro, y = pés). Colisão por eixo, pixel a pixel (sem túnel). */
class Body {
  constructor(mask, x, y, o = {}) {
    Object.assign(this, { mask, x, y, w: 20, h: 38, vx: 0, vy: 0, speed: 240, jumpV: 700, g: 2000, maxFall: 1200, stepUp: 6, flying: false, flySpeed: 170, grounded: false, hit: null, pushed: null }, o);
  }
  /* true se o retângulo inteiro do corpo (não só um ponto) cabe em (x, y). */
  free(x = this.x, y = this.y) {
    const m = this.mask, l = Math.floor(x - this.w / 2), r = Math.floor(x + this.w / 2 - 1e-6), t = Math.floor(y - this.h), b = Math.floor(y - 1e-6);
    for (let py = t; py <= b; py++) for (let px = l; px <= r; px++) { const c = m.at(px, py); if (c) { this._bad = { x: px, y: py, c }; return false; } }
    return true;
  }
  _blocked() { this.hit = { ...this._bad, age: 0 }; }
  moveX(dx) {
    const s = Math.sign(dx); let n = Math.abs(dx);
    while (n > 1e-9) {
      const st = Math.min(1, n), nx = this.x + s * st;
      if (this.free(nx, this.y)) this.x = nx;
      else if (this.grounded && this._stepUp(nx)) { /* degrau pequeno: sobe */ }
      else { this._blocked(); this.vx = 0; return false; }   // só o eixo X é cancelado
      n -= st;
    }
    return true;
  }
  _stepUp(nx) { for (let k = 1; k <= this.stepUp; k++) if (this.free(nx, this.y - k)) { this.x = nx; this.y -= k; return true; } return false; }
  moveY(dy) {
    const s = Math.sign(dy); let n = Math.abs(dy);
    while (n > 1e-9) {
      const st = Math.min(1, n), ny = this.y + s * st;
      if (this.free(this.x, ny)) this.y = ny;
      else {
        this._blocked();
        const yy = s > 0 ? Math.ceil(this.y - 1e-9) : Math.floor(this.y + 1e-9);       // encosta exatamente na borda do pixel
        if (yy !== this.y && this.free(this.x, yy)) this.y = yy;
        this.vy = 0; return false;
      }
      n -= st;
    }
    return true;
  }
  /* Se já estiver sobreposto (erro de movimento, spawn ruim), empurra para a posição livre MAIS PRÓXIMA (prefere subir). */
  depenetrate(max = 48) {
    if (this.free()) return false;
    for (let d = 1; d <= max; d++) {
      let best = null, bd = 1e9;
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const dist = dx * dx + dy * dy - (dy < 0 ? .5 : 0);
        if (dist < bd && this.free(this.x + dx, this.y + dy)) { best = [dx, dy]; bd = dist; }
      }
      if (best) { this.x += best[0]; this.y += best[1]; this.vy = 0; this.pushed = best; return true; }
    }
    return false;
  }
  step(dt, inp = {}) {
    if (this.hit) this.hit.age++;
    this.depenetrate();
    this.vx = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * this.speed;
    this.grounded = !this.free(this.x, this.y + 1);
    if (this.flying) this.vy = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * this.flySpeed;   // voo: sem gravidade, sobe/desce com input
    else {
      if (inp.jump && this.grounded) { this.vy = -this.jumpV; this.grounded = false; }
      this.vy = Math.min(this.vy + this.g * dt, this.maxFall);
    }
    this.moveX(this.vx * dt);
    this.moveY(this.vy * dt);
    this.grounded = !this.free(this.x, this.y + 1);
  }
}

const api = { CLASS, classify, CollisionMask, Body, TOL };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else (window.SL ||= {}).Collision = api;
})();
