/* MENU PRINCIPAL (nova interface). Substitui o menu antigo (templo + botões em SVG) pela arte "cidade" em assets/ui/menu-v2.jpg (1870×841).
 *  - A arte traz o desenho dos botões; por cima dela ficam áreas clicáveis (<button>) com brilho ao passar o mouse / tocar, e os textos VIVOS:
 *    moedas, diamantes e "Nível N (xp/total)" (o jogador com 0 mostra 0, etc.) e o ícone de som (liga/desliga de verdade).
 *  - Cada botão abre uma tela que já existe (JOGAR, PERSONAGENS, LOJA, CONFIGURAÇÕES, MISSÕES, RANKING, PASSE...). Para mudar a função de um botão, mude `go` em HS.
 *  - O menu antigo continua no código (escondido) para o jogo não perder nenhum sistema; o botão "?" abre ATALHOS com tudo que não tem botão próprio na arte (LOBBY, EVENTOS, MISSÕES...).
 *  - O personagem escolhido aparece na rua, no centro; tocar nele entra no LOBBY. */
(() => {
'use strict';
const M = SaiyanMenu, P = SL.Profile, C = SL.Characters, S = M.screens;
const ART = { w: 1870, h: 841, src: 'assets/ui/menu-v2.jpg' };
const SOCIAL = { discord: 'https://discord.gg/zpKjkbSCJ2', youtube: 'https://youtube.com/@felipedzn1?si=ACav6t_FE5HhAh7z' };
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* áreas clicáveis (coordenadas da arte): [x, y, w, h], raio do canto, texto para leitor de tela, ação */
const HS = [
  { id: 'rank',   r: [5, 12, 257, 123],    rad: 40, label: 'Ranking',               go: 'rankings' },
  { id: 'pcoin',  r: [1088, 30, 86, 72],   rad: 18, label: 'Mais moedas',           go: 'store' },
  { id: 'pgem',   r: [1672, 30, 92, 72],   rad: 18, label: 'Mais diamantes',        go: 'store' },
  { id: 'exit',   r: [1636, 138, 220, 84], rad: 34, label: 'Sair',                  go: () => M.exit() },
  { id: 'help',   r: [1570, 232, 82, 90],  rad: 16, label: 'Ajuda e atalhos',       go: 'shortcuts' },
  { id: 'sound',  r: [1662, 232, 90, 90],  rad: 16, label: 'Som',                   go: () => window.SaiyanAudio && SaiyanAudio.toggleMute() },
  { id: 'config', r: [1766, 232, 86, 90],  rad: 16, label: 'Configurações',         go: 'options' },
  { id: 'pass',   r: [16, 258, 138, 100],  rad: 12, label: 'Códigos',               go: 'codes' },
  { id: 'discord',r: [28, 512, 134, 110],  rad: 30, label: 'Discord',               go: () => window.open(SOCIAL.discord, '_blank', 'noopener') },
  { id: 'youtube',r: [22, 710, 172, 102],  rad: 26, label: 'YouTube',               go: () => window.open(SOCIAL.youtube, '_blank', 'noopener') },
  { id: 'level',  r: [545, 716, 752, 94],  rad: 40, label: 'Missões',               go: 'missions' },
  { id: 'chars',  r: [1338, 448, 522, 134],rad: 30, label: 'Personagens',           go: 'characters' },
  { id: 'play',   r: [1326, 598, 536, 208],rad: 40, label: 'Play',                  go: 'play' }
];

const root = el('div', 'mv2'), fill = el('img', 'mv2-fill', { src: ART.src, alt: '', draggable: false }), stage = el('div', 'mv2-stage');
const art = el('img', 'mv2-art', { src: ART.src, alt: '', draggable: false });
stage.append(art); root.append(stage);
const pos = (n, r) => { n.style.left = (r[0] / ART.w * 100) + '%'; n.style.top = (r[1] / ART.h * 100) + '%'; n.style.width = (r[2] / ART.w * 100) + '%'; n.style.height = (r[3] / ART.h * 100) + '%'; };

/* textos vivos */
const mkText = (cls, r) => { const n = el('div', 'mv2-t ' + cls); pos(n, r); const s = el('span'); n.append(s); stage.append(n); return s; };
const tGold = mkText('right', [790, 40, 290, 56]), tGem = mkText('right', [1376, 40, 290, 56]);
const bar = el('div', 'mv2-xp'); pos(bar, [640, 738, 556, 52]); const fillXp = el('i'); bar.append(fillXp); stage.append(bar);
const tLv = mkText('center lv', [640, 738, 556, 52]);

/* ícone de som (substitui o desenhado na arte, que vinha riscado) */
const snd = el('div', 'mv2-snd'); pos(snd, [1662, 232, 90, 90]); stage.append(snd);
const ICON_ON = '<svg viewBox="0 0 48 48"><path d="M7 19h8l10-9v28L15 29H7z" fill="#fff"/><path d="M31 17c4 4 4 10 0 14M36 12c7 7 7 17 0 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 48 48"><path d="M7 19h8l10-9v28L15 29H7z" fill="#fff"/><path d="M5 43L43 5" stroke="#e8283a" stroke-width="6" stroke-linecap="round"/></svg>';
const paintSound = () => { const m = window.SaiyanAudio && SaiyanAudio.state && SaiyanAudio.state.muted; snd.innerHTML = m ? ICON_OFF : ICON_ON; const b = stage.querySelector('[data-id=sound]'); if (b) b.setAttribute('aria-pressed', m ? 'true' : 'false'); };

/* personagem escolhido, na rua */
const cc = el('canvas', 'mv2-char'); cc.width = 360; cc.height = 450; pos(cc, [756, 230, 360, 450]); stage.append(cc);

/* botões */
HS.forEach(h => {
  const b = el('button', 'mv2-hs', { type: 'button' }); b.dataset.id = h.id; b.setAttribute('aria-label', h.label); pos(b, h.r); b.style.setProperty('--rad', (h.rad / h.r[3] * 100 * (h.r[3] / h.r[2])).toFixed(1) + '%');
  b.style.borderRadius = h.rad / ART.w * 100 + 'vmax';   // ajustado em layout()
  b.addEventListener('click', () => { if (typeof h.go === 'function') h.go(); else S.open(h.go, b); });
  stage.append(b); h.el = b;
});
cc.addEventListener('click', () => S.open('hub', cc)); cc.title = 'Lobby';

/* atalhos (tudo o que o menu antigo tinha e não ganhou botão na arte nova) */
S.register('shortcuts', { title: 'Atalhos', build(p) {
  p.append(el('h2', '', { textContent: 'ATALHOS' }), el('p', '', { textContent: 'Tudo do jogo em um só lugar.' }));
  const grid = el('div', 'mv2-grid');
  [['LOBBY', 'Entre na cidade e converse', 'hub'], ['LOJA', 'Compre e evolua', 'store'], ['MISSÕES', 'Ganhe diamantes', 'missions'], ['RANKING', 'Classificação', 'rankings'], ['EVENTOS', 'Eventos especiais', 'events'], ['PASSE', 'Recompensas por nível', 'pass']]
    .forEach(([t, s, id]) => { const b = S.btn(t, () => S.open(id), false); b.append(el('small', '', { textContent: s })); grid.append(b); });
  p.append(grid); const row = el('div', 'row'); row.append(S.btn('Voltar', () => S.close(), true)); p.append(row);
} });

/* tamanho: a arte inteira cabe na tela (sem cortar); o resto é preenchido com a própria arte desfocada */
function layout() {
  const app = root.parentElement; if (!app) return; const W = app.clientWidth, H = app.clientHeight; if (!W || !H) return;
  /* tela cheia: a arte preenche a tela inteira (sem barras, sem desfoque). Os textos e o personagem usam escala uniforme para não ficarem esticados. */
  const kx = W / ART.w, ky = H / ART.h, k = Math.min(kx, ky), s = stage.style;
  s.width = W + 'px'; s.height = H + 'px'; s.left = '0px'; s.top = '0px'; root.style.setProperty('--k', k);
  HS.forEach(x => { x.el.style.borderRadius = (x.rad * k) + 'px'; });
  const cs = cc.style; cs.width = 360 * k + 'px'; cs.height = 450 * k + 'px'; cs.left = (936 / ART.w * W - 180 * k) + 'px'; cs.top = (664 / ART.h * H - 434 * k) + 'px';
}

/* valores */
function paint() {
  tGold.textContent = fmt(P.gold); tGem.textContent = fmt(P.gems);
  const L = P.level, a = 100 * L * L, b = 100 * (L + 1) * (L + 1);
  tLv.textContent = 'Nível ' + Math.max(1, L) + ' (' + Math.max(0, Math.floor(P.xp - a)) + '/' + (b - a) + ')';
  fillXp.style.width = (100 * P.levelProgress) + '%'; paintSound();
}
P.on(() => paint()); M.on('screen:close', paint);
if (window.SaiyanAudio && SaiyanAudio.on) SaiyanAudio.on('change', paintSound);

/* animação do personagem */
let tPrev = 0; const t0 = performance.now();
function loop(now) {
  requestAnimationFrame(loop); if (now - tPrev < 80 || document.hidden || S.isOpen) return; tPrev = now;
  const ctx = cc.getContext('2d'), d = C.get(P.picked ? P.selected : C.DEFAULT); ctx.clearRect(0, 0, 360, 450);
  const f = d.anims.idle.f.map(i => d.frames[i].h), sc = 400 / Math.max(...f);   // altura fixa: ~47% da tela (como na referência)
  window.SL.drawCharIdle && window.SL.drawCharIdle(ctx, d, (now - t0) / 1000, 180, 434, sc);
}

/* liga */
[M.background.el, M.buttons.el, M.hud].forEach(n => { n.style.display = 'none'; });
M.root.insertBefore(root, S.el); M.root.classList.add('v2');
M.on('screen:open', () => { root.inert = true; }); M.on('screen:close', () => { root.inert = false; });
new ResizeObserver(layout).observe(root.parentElement); layout(); paint(); requestAnimationFrame(loop);
})();
