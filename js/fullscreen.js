/* TELA CHEIA: no primeiro toque/clique (os navegadores só permitem com um gesto do jogador) o jogo entra em tela cheia e, no celular,
   trava a orientação na horizontal. Se o jogador sair (Esc / gesto do sistema), não insistimos até recarregar a página.
   No app Android (APK) e no .exe isso já vem do próprio app (modo imersivo / janela em tela cheia). */
(() => {
'use strict';
const d = document, root = d.documentElement;
const can = !!(root.requestFullscreen || root.webkitRequestFullscreen);
const isFs = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
const standalone = (window.matchMedia && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches)) || navigator.standalone;
function enter() {
  if (!can || isFs()) return;
  try {
    const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' });
    const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} };
    p && p.then ? p.then(lock).catch(() => {}) : lock();
  } catch (e) {}
}
let done = false;
const first = () => { if (done) return; done = true; removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); enter(); };
if (can && !standalone) { addEventListener('pointerdown', first, true); addEventListener('keydown', first, true); }
/* F = liga/desliga a tela cheia (fora de campos de texto) */
addEventListener('keydown', e => { if (e.code === 'KeyF' && e.shiftKey && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName)) { isFs() ? (d.exitFullscreen || d.webkitExitFullscreen).call(d) : enter(); } });
window.SL = window.SL || {}; SL.fullscreen = { enter, exit: () => isFs() && (d.exitFullscreen || d.webkitExitFullscreen).call(d), get on() { return isFs(); } };
})();
