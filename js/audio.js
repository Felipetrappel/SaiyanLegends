/* Trilha sonora: música do menu e música das partidas.
 *   - menu → toca em qualquer tela do menu (inclusive lobby, loja, opções…) e NÃO reinicia ao abrir/fechar telas ou clicar em botões;
 *   - game → toca em loop enquanto o jogador está dentro do mapa (tela "game").
 * Só uma música toca por vez: a atual some com fade e só depois a nova começa (sem sobreposição).
 * Autoplay: se o navegador bloquear o primeiro play(), a música começa no primeiro toque/clique/tecla.
 * Volume e "silenciar" ficam salvos (localStorage) e são controlados na tela Opções, no botão 🔊 do HUD da partida e na tecla M.
 * API (window.SaiyanAudio): play(track) · setVolume(0..1) · setMuted(bool) · toggleMute() · state · on('change', fn) · tracks */
(() => {
'use strict';
const TRACKS = {
  menu: 'assets/audio/M_sica_do_menu_principal___Saiyan_Legends_Online.mp3',
  game: 'assets/audio/M_sica_das_partidas___Saiyan_Legends.mp3'
};
const KEY = 'sl.audio', FADE = 450;
const clamp = v => Math.min(1, Math.max(0, +v || 0));
const state = { volume: .6, muted: false };
try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); if ('volume' in d) state.volume = clamp(d.volume); state.muted = !!d.muted; } catch (e) { /* sem storage: valores padrão */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

const listeners = [];
const changed = () => listeners.forEach(f => f({ ...state }));

const audio = {};                                         // uma <audio> por faixa, em loop
for (const [name, src] of Object.entries(TRACKS)) {
  const a = Object.assign(new Audio(), { src, loop: true, preload: 'auto' }); a.volume = 0; a._fade = 0; a._name = name; audio[name] = a;
}
const level = a => { a.volume = clamp(state.volume * a._fade); a.muted = state.muted; };

let want = 'menu', current = null, token = 0, blocked = false;

/* fade até `to` (0..1); resolve ao terminar ou se algo mais novo (token) assumiu */
const fade = (a, to, ms, my) => new Promise(res => {
  const from = a._fade, t0 = performance.now();
  const tick = () => {
    if (my !== token && to > 0) return res(false);
    const k = Math.min(1, (performance.now() - t0) / ms); a._fade = from + (to - from) * k; level(a);
    k < 1 ? setTimeout(tick, 30) : res(true);
  };
  tick();
});

async function switchTo(track) {
  want = track;
  const a = audio[track];
  if (current === track && !a.paused) { level(a); return; }            // já tocando: não reinicia
  const my = ++token; current = track;
  const others = Object.values(audio).filter(x => x !== a && !x.paused);
  await Promise.all(others.map(async x => { await fade(x, 0, FADE, my); if (current !== x._name) x.pause(); }));   // a anterior some primeiro
  if (my !== token) return;
  if (a.paused) { try { a.currentTime = 0; } catch (e) {} a._fade = 0; level(a); }
  try { await a.play(); blocked = false; }
  catch (e) { if (e && e.name === 'NotAllowedError') blocked = true; return; }   // autoplay bloqueado: tenta de novo no 1º gesto
  if (my === token) fade(a, 1, FADE, my);
}

/* 1º gesto do usuário libera o áudio */
const unlock = () => { if (blocked || audio[want].paused) switchTo(want); if (!blocked && !audio[want].paused) ['pointerdown', 'keydown', 'touchend'].forEach(t => removeEventListener(t, unlock, true)); };
['pointerdown', 'keydown', 'touchend'].forEach(t => addEventListener(t, unlock, true));

/* aba escondida: pausa; ao voltar, retoma a música atual */
document.addEventListener('visibilitychange', () => {
  const a = audio[current || want]; if (!a) return;
  if (document.hidden) a.pause(); else if (current) a.play().catch(() => { blocked = true; });
});

const api = window.SaiyanAudio = {
  tracks: TRACKS, audio, get state() { return { ...state }; }, get current() { return current; }, get blocked() { return blocked; },
  play: switchTo,
  setVolume(v) { state.volume = clamp(v); Object.values(audio).forEach(level); save(); changed(); },
  setMuted(m) { state.muted = !!m; Object.values(audio).forEach(level); save(); changed(); },
  toggleMute() { api.setMuted(!state.muted); },
  on(ev, fn) { if (ev === 'change') listeners.push(fn); return api; },
  off(ev, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); return api; }
};

/* ---- ligação com o menu: tela "game" = partida; qualquer outra coisa = menu ---- */
const M = window.SaiyanMenu;
if (M) {
  M.on('screen:open', id => {
    switchTo(id === 'game' ? 'game' : 'menu');
    if (id === 'game') setTimeout(addHudButton, 0);
  });
  M.on('screen:close', () => switchTo('menu'));

  /* tela Opções (antes era um espaço reservado) */
  const S = M.screens, el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
  S.register('options', { title: 'Opções', build(p) {
    const vol = el('input', '', { type: 'range', min: 0, max: 100, step: 1 }), val = el('span', 'optval'), mute = S.btn('', () => api.toggleMute(), true);
    vol.setAttribute('aria-label', 'Volume da música');
    const sync = () => { vol.value = Math.round(state.volume * 100); val.textContent = vol.value + '%'; mute.textContent = state.muted ? '🔇 Ativar som' : '🔊 Silenciar'; };
    vol.addEventListener('input', () => { api.setVolume(vol.value / 100); if (state.muted && vol.value > 0) api.setMuted(false); });
    p.append(el('h2', '', { textContent: 'Opções' }), el('div', 'optrow', { innerHTML: '<span>Música</span>' }), vol, val,
      el('div', 'row', {}), );
    p.lastChild.append(mute, ...(window.SL && SL.Auth ? [S.btn(SL.Auth.user ? '👤 ' + SL.Auth.user.name : '👤 Conta', () => S.open('account'), true)] : []), S.btn('Voltar', () => S.close(), true));
    api.on('change', sync); sync();
    return () => api.off('change', sync);
  } });
}

/* botão 🔊 no HUD da partida (os controles de toque ficam livres) */
function addHudButton() {
  const hud = document.querySelector('.stage .gbtns') || document.querySelector('.stage .hud'); if (!hud || hud.querySelector('.hudmute')) return;
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'pbtn ghost hudmute' });
  const sync = () => { b.textContent = state.muted ? '🔇 SOM DESLIGADO' : '🔊 SOM LIGADO'; b.setAttribute('aria-label', state.muted ? 'Ativar som' : 'Silenciar'); };
  b.onclick = e => { api.toggleMute(); e.currentTarget.blur(); }; sync(); api.on('change', sync);
  hud.insertBefore(b, hud.children[0] || null);
}

/* tecla M liga/desliga o som */
addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) api.toggleMute(); });

switchTo('menu');   // tenta tocar já; se o navegador bloquear, começa no primeiro toque
})();
