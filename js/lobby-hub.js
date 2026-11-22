/* LOBBY (hub) — cenário da cidade (assets/ui/lobby-city.png) com o seu personagem andando na rua.
 * Controles: setas / A D, ou toque/clique no cenário para andar até o ponto. Botão "Trocar personagem" abre a seleção. */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, P = SL.Profile, C = SL.Characters;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const bg = new Image(); bg.src = 'assets/ui/lobby-city.png';
const frameOf = (def, anim, t) => { const a = (def.anims && def.anims[anim]) || def.anims.idle; return def.frames[a.f[Math.floor(t * (a.fps || 8)) % a.f.length]]; };
const idleH = d => { try { return Math.max(...d.anims.idle.f.map(i => d.frames[i].h)); } catch (e) { return 60; } };
let pos = null;            // posição X (0..1) do personagem, mantida ao reabrir

S.register('hub', { title: 'Lobby', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'lobbywrap');
  const cv = el('canvas', 'lb-cv'), back = el('button', 'lb-btn lb-back', { type: 'button', textContent: '← VOLTAR' }), sw = el('button', 'lb-btn lb-sw', { type: 'button', textContent: 'TROCAR PERSONAGEM' }), hint = el('div', 'lb-hint', { textContent: 'Toque no chão ou use as setas para andar' });
  p.append(cv, back, sw, hint); back.addEventListener('click', () => S.close()); sw.addEventListener('click', () => S.open('characters'));
  if (pos == null) pos = .5; let tx = pos, face = 1, moving = false, raf = 0, last = performance.now(), t = 0; const keys = new Set();
  const fit = () => { const r = p.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); cv.width = Math.max(2, Math.round(r.width * d)); cv.height = Math.max(2, Math.round(r.height * d)); };
  const ro = new ResizeObserver(fit); ro.observe(p); fit();
  const geo = () => { const W = cv.width, H = cv.height, s = Math.max(W / bg.width, H / bg.height), dw = bg.width * s, dh = bg.height * s; return { W, H, s, dw, dh, ox: (W - dw) / 2, oy: H - dh }; };
  const pt = e => { const r = cv.getBoundingClientRect(); tx = Math.min(.96, Math.max(.04, (e.clientX - r.left) / r.width)); };
  cv.addEventListener('pointerdown', pt);
  const kd = e => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { keys.add(e.code); e.preventDefault(); } else if (e.key === 'Escape') S.close(); }, ku = e => keys.delete(e.code);
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    const k = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    if (k) { pos = Math.min(.96, Math.max(.04, pos + k * .28 * dt)); tx = pos; face = k; moving = true; }
    else if (Math.abs(tx - pos) > .006) { const dir = Math.sign(tx - pos); pos += dir * Math.min(Math.abs(tx - pos), .3 * dt); face = dir; moving = true; } else moving = false;
    const g = geo(), ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#10204a'; ctx.fillRect(0, 0, g.W, g.H);
    if (bg.complete && bg.width) ctx.drawImage(bg, g.ox, g.oy, g.dw, g.dh);
    const d = C.get(P.picked ? P.selected : Object.keys(C.all)[0]); if (!d || !d.img || !d.img.complete) return;
    const sc = Math.max(2, Math.round(g.dh * .3 / idleH(d))), f = frameOf(d, moving ? 'run' : 'idle', t), fy = g.oy + g.dh * .8, x = g.ox + g.dw * pos;
    ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(face < 0 ? -1 : 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, fy, f.w * sc * .35, 7 * (g.dh / 887) + 3, 0, 0, 7); ctx.fill();
    ctx.drawImage(d.img, f.x, f.y, f.w, f.h, Math.round(-f.ax * sc), Math.round(fy - f.ay * sc), f.w * sc, f.h * sc); ctx.restore();
    ctx.font = `bold ${Math.round(g.dh * .04)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000b'; ctx.fillStyle = '#fff';
    const nm = (SL.Auth && SL.Auth.user && SL.Auth.user.name) || 'Jogador', ny = fy - idleH(d) * sc - g.dh * .03; ctx.strokeText(nm, x, ny); ctx.fillText(nm, x, ny);
  }
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
} });
})();
