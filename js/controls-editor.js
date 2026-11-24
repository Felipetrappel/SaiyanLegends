/* Personalizar controles na tela: arrastar cada botão, mudar o tamanho de cada um (ou de todos) e a transparência.
 * Salvo no aparelho (localStorage 'sl.controls'); posições em % da área de jogo, então valem em qualquer tamanho de tela.
 * Abre pelo botão CONTROLES do HUD da partida. Sem layout salvo, vale o layout padrão (grade 3×3 + setas). */
(() => {
'use strict';
const KEY = SL.ControlType.get() === 'joystick' ? 'sl.controls.joy' : 'sl.controls', BASE_MOVE = 'min(28vh,12.6vw)', BASE_ACT = 'min(22vh,10vw)';
/* Layout padrão (HUD novo): centros em fração da tela e tamanho relativo (k) */
const DEF = { v: 4, scale: 1, op: 1, b: { joy: { x: .153, y: .695, k: 1 }, l: { x: .075, y: .71, k: .6 }, r: { x: .175, y: .71, k: .6 }, guard: { x: .53, y: .88, k: .72 }, tp: { x: .452, y: .88, k: .72 },
  pk: { x: .826, y: .608, k: 1 }, atk: { x: .938, y: .608, k: 1 }, sp: { x: .615, y: .844, k: 1 }, power: { x: .714, y: .844, k: 1 }, md: { x: .826, y: .861, k: 1 }, bt: { x: .938, y: .861, k: 1 } } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (t, c, o) => Object.assign(document.createElement(t), c ? { className: c } : {}, o || {});
const G = SL.GameScene.prototype;

G.initCustomize = function (root, host) {
  this.ctlRoot = root; this.ctlHost = host; this.btns = [...root.querySelectorAll('.cbtn')]; this.editing = false; this.selId = null;
  this.btns.forEach(b => { b.dataset.id = [...b.classList].find(c => c !== 'cbtn' && c !== 'on'); this._wireEdit(b); });
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.v === 4 && d.b) this.layout = d; } catch (e) { /* sem storage */ }
  this.applyLayout();
};
G.saveLayout = function () { try { if (this.layout) localStorage.setItem(KEY, JSON.stringify(this.layout)); else localStorage.removeItem(KEY); } catch (e) {} };
G.snapshotLayout = function () {
  const R = this.ctlHost.getBoundingClientRect(), b = {};   // medido na área inteira do jogo (a mesma que o modo personalizado ocupa)
  this.btns.forEach(x => { const r = x.getBoundingClientRect(); b[x.dataset.id] = { x: (r.left + r.width / 2 - R.left) / R.width, y: (r.top + r.height / 2 - R.top) / R.height, k: (DEF.b[x.dataset.id] || { k: 1 }).k }; });
  return { v: 4, scale: 1, op: 1, b };
};
G.applyLayout = function () {
  const L = this.layout || DEF; this.ctlRoot.classList.add('custom');
  for (const b of this.btns) {
    const c = L.b[b.dataset.id]; if (!c) continue;
    const base = b.dataset.id === 'l' || b.dataset.id === 'r' || b.dataset.id === 'joy' ? BASE_MOVE : BASE_ACT;
    b.style.left = (c.x * 100) + '%'; b.style.top = (c.y * 100) + '%'; b.style.setProperty('--s', `calc(${base} * ${(c.k * L.scale).toFixed(3)})`);
  }
  this.ctlRoot.style.setProperty('--op', L.op);
};
/* arrastar (só no modo edição); o listener do jogo ignora toques enquanto `editing` */
G._wireEdit = function (b) {
  let drag = null;
  b.addEventListener('pointerdown', e => { if (!this.editing) return; e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (_) {} this.select(b.dataset.id); drag = e.pointerId; });
  b.addEventListener('pointermove', e => {
    if (!this.editing || drag !== e.pointerId) return; const R = this.ctlRoot.getBoundingClientRect(), c = this.layout.b[b.dataset.id];
    c.x = clamp((e.clientX - R.left) / R.width, .02, .98); c.y = clamp((e.clientY - R.top) / R.height, .04, .96); this.applyLayout();
  });
  ['pointerup', 'pointercancel'].forEach(n => b.addEventListener(n, e => { if (drag === e.pointerId) { drag = null; this.saveLayout(); } }));
};
G.select = function (id) {
  this.selId = id; this.btns.forEach(b => b.classList.toggle('sel', b.dataset.id === id));
  const P = this.editUI; if (!P) return; const b = this.btns.find(x => x.dataset.id === id), c = this.layout.b[id];
  P.name.textContent = b ? b.title.split(':')[0].split('·')[0].trim() : '—'; P.size.disabled = !c; if (c) { P.size.value = Math.round(c.k * 100); P.sizeV.textContent = Math.round(c.k * 100) + '%'; }
};
G.toggleEdit = function () { this.editing ? this.endEdit() : this.startEdit(); };
G.startEdit = function () {
  if (this.editing) return; for (const k in this.pad) this.pad[k] = false; this.pend = {};
  if (!this.layout) { this.layout = this.snapshotLayout(); this.applyLayout(); }
  this.editing = true; this.ctlRoot.classList.add('editing');
  const L = this.layout, P = el('div', 'cedit'), row = (label, ...kids) => { const r = el('label', 'crow'); r.append(el('span', '', { textContent: label }), ...kids); return r; };
  const rng = (min, max, val) => Object.assign(el('input'), { type: 'range', min, max, value: val, step: 1 });
  const size = rng(40, 250, 100), all = rng(50, 200, Math.round(L.scale * 100)), op = rng(25, 100, Math.round(L.op * 100));
  const name = el('b', '', { textContent: '—' }), sizeV = el('em', '', { textContent: '100%' }), allV = el('em', '', { textContent: Math.round(L.scale * 100) + '%' }), opV = el('em', '', { textContent: Math.round(L.op * 100) + '%' });
  size.disabled = true;
  size.oninput = () => { if (!this.selId) return; this.layout.b[this.selId].k = size.value / 100; sizeV.textContent = size.value + '%'; this.applyLayout(); };
  size.onchange = () => this.saveLayout();
  all.oninput = () => { this.layout.scale = all.value / 100; allV.textContent = all.value + '%'; this.applyLayout(); }; all.onchange = () => this.saveLayout();
  op.oninput = () => { this.layout.op = op.value / 100; opV.textContent = op.value + '%'; this.applyLayout(); }; op.onchange = () => this.saveLayout();
  const reset = el('button', 'pbtn', { type: 'button', textContent: 'RESTAURAR PADRÃO' }), done = el('button', 'pbtn', { type: 'button', textContent: 'CONCLUÍDO' });
  reset.onclick = () => { this.layout = null; this.saveLayout(); this.applyLayout(); this.layout = this.snapshotLayout(); this.applyLayout(); all.value = 100; allV.textContent = '100%'; op.value = 100; opV.textContent = '100%'; size.value = 100; sizeV.textContent = '100%'; this.select(this.selId); };
  done.onclick = () => this.endEdit();
  const head = el('div', 'chead'); head.append(el('strong', '', { textContent: 'EDITAR CONTROLES' }), done);
  P.append(head, el('p', 'chint', { textContent: 'Arraste um botão para mover. Toque nele para mudar o tamanho.' }),
    row('Botão', name), row('Tamanho do botão', size, sizeV), row('Tamanho de todos', all, allV), row('Transparência', op, opV), reset);
  ['pointerdown', 'pointerup'].forEach(n => P.addEventListener(n, e => e.stopPropagation()));
  this.ctlHost.append(P); this.editUI = { el: P, name, size, sizeV };
};
G.endEdit = function () {
  if (!this.editing) return; this.editing = false; this.ctlRoot.classList.remove('editing'); this.btns.forEach(b => b.classList.remove('sel'));
  if (this.editUI) { this.editUI.el.remove(); this.editUI = null; } this.selId = null;
  const L = this.layout; if (L && L.scale === 1 && L.op === .9 && Object.values(L.b).every(c => c.k === 1)) { /* mantém: posições podem ter mudado */ } this.saveLayout();
};
})();
