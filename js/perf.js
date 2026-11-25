/* Taxa de quadros: limitador opcional (30/45/60/90/120) e contador de FPS — ambos ligam/desligam em Configurações › Vídeo. */
(() => {
'use strict';
const K = 'sl.perf', D = { fps: false, limit: false, max: 60 }, LIMITS = [30, 45, 60, 90, 120];
let S = { ...D }; try { Object.assign(S, JSON.parse(localStorage.getItem(K) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) {} };
let box = null, n = 0, t0 = 0, last = 0;
const mount = () => { if (box) return; box = document.createElement('div'); box.className = 'sl-fps'; box.textContent = 'FPS --'; document.body.append(box); };
const P = window.SLPerf = {
  LIMITS,
  get showFps() { return !!S.fps; }, get limitOn() { return !!S.limit; }, get max() { return S.max; },
  setShowFps(v) { S.fps = !!v; save(); if (v) mount(); if (box) box.style.display = v ? '' : 'none'; n = 0; t0 = 0; },
  setLimitOn(v) { S.limit = !!v; save(); last = 0; },
  setMax(v) { S.max = LIMITS.includes(+v) ? +v : 60; save(); },
  /* o jogo pergunta antes de desenhar cada quadro: false = pula este desenho (a simulação continua a 60 Hz) */
  due(t) { if (!S.limit) return true; const iv = 1000 / S.max; if (t - last < iv - 2) return false; last = t; return true; },
  tick(t) { if (!S.fps) return; mount(); if (!t0) { t0 = t; n = 0; } n++; last2 = t; if (t - t0 >= 500) { const f = Math.round(n * 1000 / (t - t0)); box.textContent = 'FPS ' + f; box.className = 'sl-fps' + (f < 30 ? ' lo' : f < 50 ? ' mid' : ''); t0 = t; n = 0; } }
}; let last2 = 0;
if (S.fps) addEventListener('DOMContentLoaded', () => { mount(); });
setInterval(() => { if (S.fps && box && performance.now() - last2 > 1200) box.textContent = 'FPS --'; }, 1000);
})();
