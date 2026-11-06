/* Saiyan Legends Online — Tela inicial
 *
 * MainMenu
 *  ├── Background      arte de fundo (cover, sem deformar, atrás de tudo)
 *  └── MenuButtons     8 áreas clicáveis (polígonos SVG) sobre a arte: JOGAR, PERSONAGEM, LOJA, CONFIGURAÇÕES, MISSÕES, RANKING, EVENTOS, PASSE
 *
 * Eventos (um por botão): SaiyanMenu.on('play' | 'character' | 'shop' | 'settings' |
 *   'missions' | 'ranking' | 'events' | 'pass', fn) + 'screen:open' | 'screen:close' | 'screen:submit'.
 * Nova tela:  SaiyanMenu.screens.register('minhaTela', { title, text, input?, action? })
 *             e depois SaiyanMenu.screens.open('minhaTela').
 * Novo botão: crie uma subclasse de MenuButton, adicione o PNG em ASSETS e a classe em MenuButtons.
 */
(() => {
'use strict';

/* ───────── Configuração ───────── */
const ASSETS = {
  background: 'assets/background.png',
  buttons: {
    connect: 'assets/buttons/connect.png',
    createRoom: 'assets/buttons/create-room.png',
    store: 'assets/buttons/store.png',
    roomList: 'assets/buttons/room-list.png',
    code: 'assets/buttons/code.png',
    options: 'assets/buttons/options.png',
    rankings: 'assets/buttons/rankings.png',
    exit: 'assets/buttons/exit.png'
  }
};
const CONFIG = {
  art:  { w: 1536, h: 1024 },                       // tamanho da imagem de fundo
  logo: { bottom: 500, focusY: 455, focusAt: .42 }, // fim do logo na arte (px) e altura da tela onde ele deve ficar
  btn:  { aspect: 193 / 751, gap: .09, maxW: 360 }  // proporção do PNG, espaçamento (× largura), largura máx. (px)
};

/* Telas secundárias (placeholders funcionais) */
const SCREENS = {
  store:      { title: 'Loja', text: 'Espaço reservado para os itens da loja.' },
  options:    { title: 'Opções', text: 'Espaço reservado para som, vídeo e controles.' },
  rankings:   { title: 'Rankings', text: 'Aqui aparecerá o ranking dos jogadores.' },
  exit:       { title: 'Sair do jogo', text: 'Não foi possível fechar automaticamente nesta plataforma. Você pode fechar a aba ou a janela.' }
};

/* ───────── Utilidades ───────── */
const el = (tag, className = '', props = {}) => Object.assign(document.createElement(tag), { className, ...props });

class Emitter {
  #h = {};
  on(e, f) { (this.#h[e] ||= []).push(f); return this; }
  off(e, f) { this.#h[e] = (this.#h[e] || []).filter(x => x !== f); return this; }
  emit(e, d) { (this.#h[e] || []).forEach(f => f(d)); }
}

/* Sair de acordo com a plataforma; chama `fallback` se não der para fechar sozinho.
   (Se o jogo rodar dentro de um site, dá para trocar o fallback por history.back().) */
const Platform = {
  exit(fallback) {
    try {
      const w = window;
      if (w.Capacitor?.Plugins?.App?.exitApp) return w.Capacitor.Plugins.App.exitApp(); // app mobile (Capacitor)
      if (navigator.app?.exitApp) return navigator.app.exitApp();                        // Cordova
      if (w.electronAPI?.quit) return w.electronAPI.quit();                              // Electron (exposto no preload)
      w.close();                                                                         // janela aberta por script
    } catch (e) { /* segue para o fallback */ }
    setTimeout(() => { if (!window.closed) fallback(); }, 200);
  }
};

/* ───────── Background: arte inteira visível (sem cortar), com borda desfocada preenchendo o resto da tela ───────── */
const ART = { w: 1672, h: 940, src: 'assets/ui/menu-bg-temple.jpg' };
class Background {
  constructor() {
    this.el = el('div', 'bgwrap');
    this.fill = el('img', 'bg bgfill', { src: ART.src, alt: '', draggable: false });
    this.art = el('img', 'bg bgart', { src: ART.src, alt: '', draggable: false });
    this.el.append(this.fill, this.art);
  }
  /* retângulo (px) que a arte ocupa dentro de W×H, centralizado */
  fit(W, H) { const k = Math.min(W / ART.w, H / ART.h), w = ART.w * k, h = ART.h * k; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
}

/* ───────── Botões desenhados em SVG por cima do fundo ─────────
 * O fundo (assets/ui/menu-bg.jpg, 1672×940) NÃO tem botões: eles são criados aqui, um a um, em coordenadas da arte.
 * Para mover/redimensionar um botão, mude x/y/w (largura; a altura segue a proporção) ou cx/cy (círculos); para trocar a função, mude `screen`
 * (id de uma tela registrada em SaiyanMenu.screens) ou `url`. Nada disso exige editar a imagem. */
const SOCIAL = { discord: 'https://discord.gg/zpKjkbSCJ2', youtube: 'https://youtube.com/@felipedzn1?si=ACav6t_FE5HhAh7z', facebook: '' };    // cole aqui os links do seu servidor / canal: com link, o botão abre o site; sem link, mostra um aviso
const SVGNS = 'http://www.w3.org/2000/svg';
/* ── Botões grandes (direita) ── */
const BIG = [
  { id: 'play',      label: 'JOGAR',         sub: 'ENTRE NA BATALHA',  screen: 'play',       x: 1196, y: 326, w: 462, h: 136, pal: 'gold',   ico: 'play',  deco: 'ball' },
  { id: 'character', label: 'PERSONAGEM',    sub: 'ESCOLHA SEU HERÓI', screen: 'characters', x: 1198, y: 468, w: 458, h: 128, pal: 'purple', ico: 'group', deco: 'sil' },
  { id: 'shop',      label: 'LOJA',          sub: 'COMPRE E EVOLUA',   screen: 'store',      x: 1198, y: 600, w: 456, h: 132, pal: 'green',  ico: 'cart' },
  { id: 'settings',  label: 'CONFIGURAÇÕES', sub: 'AJUSTE SEU JOGO',   screen: 'options',    x: 1203, y: 736, w: 455, h: 130, pal: 'blue',   ico: 'gear' }
];
const PAL = { gold: ['#ffe27a', '#f4a712', '#c46a00'], purple: ['#9a62ff', '#5f27c4', '#35107e'], green: ['#5fe06e', '#22a83e', '#0e6b24'], blue: ['#48a8ff', '#1766dc', '#0b3f9a'] };
/* ── Menu lateral esquerdo (hexágonos) ── */
const SIDE = [
  { id: 'missions', label: 'MISSÕES',  screen: 'missions', icon: 'scroll',   x: 24, y: 176, w: 166, h: 142 },
  { id: 'ranking',  label: 'RANKING',  screen: 'rankings', icon: 'trophy',   x: 24, y: 332, w: 166, h: 116 },
  { id: 'events',   label: 'EVENTOS',  screen: 'events',   icon: 'calendar', x: 24, y: 468, w: 166, h: 114 },
  { id: 'pass',     label: 'PASSE',    screen: 'pass',     icon: 'ticket',   x: 24, y: 602, w: 166, h: 120 }
];
/* ── Atalhos do topo direito ── */
const TOP = [
  { id: 'discord',  label: 'DISCORD',  icon: 'discord', screen: 'social', x: 1350, y: 22, w: 94, h: 102, c: ['#7d89ff', '#4350d8'] },
  { id: 'youtube',  label: 'YOUTUBE',  icon: 'youtube', screen: 'social', x: 1458, y: 22, w: 97, h: 102, c: ['#ff6a5c', '#c40f0f'] },
  { id: 'config',   label: 'CONFIG',   icon: 'gear',    x: 1565, y: 22, w: 90, h: 102, c: ['#9a62ff', '#4a1aa8'], screen: 'options' }
];
/* ── Botões redondos "+" dos contadores e área do perfil ── */
const MISC = [
  { id: 'plusGold', label: 'Mais moedas',     screen: 'store', cx: 735,  cy: 64, plus: true },
  { id: 'plusGem',  label: 'Mais diamantes',  screen: 'store', cx: 1025, cy: 64, plus: true },
  { id: 'profile',  label: 'Perfil e conta',  screen: 'account', rect: [8, 8, 470, 152] }
];
const ICONS = {   // desenhados em um quadrado de -26..26
  play:     '<path d="M-14 -22L22 0L-14 22Z" fill="#fff3c0" stroke="#7a4300" stroke-width="4" stroke-linejoin="round"/>',
  group:    '<g fill="#efe6ff" stroke="#2a0a66" stroke-width="2.5"><circle cx="0" cy="-12" r="9"/><path d="M-14 22v-8a14 14 0 0 1 28 0v8z"/><circle cx="-20" cy="-4" r="6.5"/><path d="M-30 20v-5a10 10 0 0 1 14-9"/><circle cx="20" cy="-4" r="6.5"/><path d="M30 20v-5a10 10 0 0 0-14-9"/></g>',
  cart:     '<g fill="none" stroke="#eaffee" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M-28 -20h9l6 28h26l5-20h-34"/><path d="M-10 -4h26M-8 4h22" stroke-width="3"/></g><circle cx="-8" cy="20" r="4.5" fill="#eaffee"/><circle cx="16" cy="20" r="4.5" fill="#eaffee"/>',
  gear:     '<g fill="#eaf4ff" stroke="#0b2a66" stroke-width="2"><circle r="14"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="-5.5" y="-25" width="11" height="11" rx="2" transform="rotate(${a})"/>`).join('') + '</g><circle r="7" fill="#2a64c8"/>',
  scroll:   '<g stroke="#4a2a00" stroke-width="2.5" stroke-linejoin="round"><rect x="-17" y="-22" width="34" height="44" rx="4" fill="#ffe8b0"/><rect x="-22" y="-26" width="44" height="9" rx="4.5" fill="#c9462a"/><rect x="-22" y="17" width="44" height="9" rx="4.5" fill="#c9462a"/></g><path d="M-10 -8h20M-10 0h20M-10 8h13" stroke="#b07a3a" stroke-width="3" stroke-linecap="round"/>',
  trophy:   '<path d="M-14 -22h28v14c0 10-6 17-14 17s-14-7-14-17z" fill="#ffc933" stroke="#7a4300" stroke-width="2.5"/><path d="M-14 -17h-9c0 9 4 13 11 13M14 -17h9c0 9-4 13-11 13" fill="none" stroke="#ffc933" stroke-width="4"/><path d="M-4 8h8v8h-8zM-12 16h24v7h-24z" fill="#ffc933" stroke="#7a4300" stroke-width="2"/>',
  calendar: '<g stroke="#1a2a6a" stroke-width="2.5" stroke-linejoin="round"><rect x="-24" y="-20" width="48" height="44" rx="6" fill="#f4f7ff"/><rect x="-24" y="-20" width="48" height="14" rx="6" fill="#e0463a"/></g><path d="M-14 -26v10M14 -26v10" stroke="#3a1a8a" stroke-width="5" stroke-linecap="round"/><g fill="#5a7fe0"><rect x="-17" y="-1" width="9" height="7" rx="1.5"/><rect x="-4.5" y="-1" width="9" height="7" rx="1.5"/><rect x="8" y="-1" width="9" height="7" rx="1.5"/><rect x="-17" y="11" width="9" height="7" rx="1.5"/><rect x="-4.5" y="11" width="9" height="7" rx="1.5"/></g>',
  ticket:   '<g transform="rotate(-28)"><path d="M-26 -14h52v10a5 5 0 0 0 0 10v10h-52v-10a5 5 0 0 0 0-10z" fill="#e8a8ff" stroke="#3a0a70" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="3" r="9" fill="#7a2bd8" stroke="#3a0a70" stroke-width="2"/><path d="M-3 -2v10M3 -2v10" stroke="#fff" stroke-width="2.5"/></g>',
  discord:  '<path d="M-24 -14c6-5 12-8 24-8s18 3 24 8c4 10 5 20 3 30-6 4-10 6-15 7l-4-6c-5 1-11 1-16 0l-4 6c-5-1-9-3-15-7-2-10-1-20 3-30z" fill="#fff"/><ellipse cx="-9" cy="0" rx="5.5" ry="7" fill="#4350d8"/><ellipse cx="9" cy="0" rx="5.5" ry="7" fill="#4350d8"/>',
  youtube:  '<rect x="-27" y="-18" width="54" height="36" rx="11" fill="#fff"/><path d="M-6 -9L12 0L-6 9Z" fill="#d11414"/>',
  chat:     '<path d="M-22 -18h34a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-18l-12 10v-10h-4a6 6 0 0 1-6-6v-14a6 6 0 0 1 6-6z" fill="#f2e9ff"/><circle cx="-10" cy="-5" r="3" fill="#7a2bd8"/><circle cx="0" cy="-5" r="3" fill="#7a2bd8"/><circle cx="10" cy="-5" r="3" fill="#7a2bd8"/>'
};
const DEFS = `<defs>
  <linearGradient id="mbGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".35" stop-color="#ffc933"/><stop offset=".7" stop-color="#d98a0b"/><stop offset="1" stop-color="#ffd24f"/></linearGradient>
  <linearGradient id="mbDia" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffbf1f"/><stop offset="1" stop-color="#c77a05"/></linearGradient>
  <radialGradient id="hxFill" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#7a36e0"/><stop offset=".6" stop-color="#4a1a9e"/><stop offset="1" stop-color="#2a0a66"/></radialGradient>
  <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1580"/><stop offset="1" stop-color="#1c0650"/></linearGradient>
  <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="gemG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8f4ff"/><stop offset=".5" stop-color="#2fb6ff"/><stop offset="1" stop-color="#0a64d8"/></linearGradient>
  ${Object.entries(PAL).map(([k, c]) => `<linearGradient id="pal-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`).join('')}
</defs>`;
const chamfer = (w, h, i, c) => `M${i + c},${i} L${w - i - c},${i} L${w - i},${i + c} L${w - i},${h - i - c} L${w - i - c},${h - i} L${i + c},${h - i} L${i},${h - i - c} L${i},${i + c} Z`;
const hexP = (w, h, i, c) => `M${i},${h / 2} L${i + c},${i} L${w - i - c},${i} L${w - i},${h / 2} L${w - i - c},${h - i} L${i + c},${h - i} Z`;
const stars = (cx, cy, n) => Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2 + .6, x = cx + Math.cos(a) * 17, y = cy + Math.sin(a) * 17; return `<path d="M${x},${y - 6} l1.8,4.2 4.4.4 -3.3,3 1,4.4 -3.9-2.3 -3.9,2.3 1-4.4 -3.3-3 4.4-.4z" fill="#d11414" stroke="#7a0000" stroke-width=".8"/>`; }).join('');
const DECO = {
  ball: (w, h) => `<g transform="translate(${w - 60},${h / 2})"><circle r="40" fill="#1b0a3a"/><circle r="37" fill="url(#pal-gold)" stroke="#fff3b0" stroke-width="3"/><ellipse cx="-12" cy="-18" rx="18" ry="9" fill="#fff" opacity=".35"/>${stars(0, 0, 4)}</g>`,
  sil: (w, h) => `<g transform="translate(${w - 84},${h - 14})" opacity=".42" fill="#10032e"><circle cy="-70" r="23"/><path d="M-46 0v-22c0-18 16-30 46-30s46 12 46 30v22z"/><path d="M-20 -88l8-20 6 12 6-16 6 16 6-12 8 20z"/></g>`
};
function bigSvg(b) {
  const { w, h } = b, avail = w - (h + 40) - (b.deco ? 96 : 30), tl = Math.min(b.label.length * 36, avail), fs = Math.min(64, Math.round(tl / b.label.length * 1.85)), sl = Math.min(b.sub.length * 15.5, w - (h + 40) - 28);
  return `<g class="mb mb-big" data-id="${b.id}" role="button" tabindex="0" aria-label="${b.label}" transform="translate(${b.x},${b.y})">
    <path class="mb-hit" d="${chamfer(w, h, 0, 22)}" fill="#000" fill-opacity="0"/><g class="mbi">
    <path d="${chamfer(w, h, 2, 22)}" fill="#12052b" stroke="#12052b" stroke-width="10" stroke-linejoin="round"/>
    <path d="${chamfer(w, h, 6, 20)}" fill="none" stroke="url(#mbGold)" stroke-width="7" stroke-linejoin="round"/>
    <path d="${chamfer(w, h, 13, 16)}" fill="url(#pal-${b.pal})" stroke="#1b0a3a" stroke-width="3" stroke-linejoin="round"/>
    <path d="${chamfer(w, h * .52, 15, 14)}" fill="url(#shine)" opacity=".5"/>
    ${DECO[b.deco] ? DECO[b.deco](w, h) : ''}
    <g transform="translate(${h * .5 + 22},${h / 2}) scale(1.35)">${ICONS[b.ico]}</g>
    <text x="${h + 38}" y="${h / 2 - 2}" class="mb-t big-t" style="font-size:${fs}px" textLength="${tl}" lengthAdjust="spacingAndGlyphs">${b.label}</text>
    <text x="${h + 40}" y="${h / 2 + 34}" class="mb-t big-s" textLength="${sl}" lengthAdjust="spacingAndGlyphs">${b.sub}</text></g></g>`;
}
function sideSvg(b) {
  const { w, h } = b, k = 1.35;
  return `<g class="mb mb-side" data-id="${b.id}" role="button" tabindex="0" aria-label="${b.label}" transform="translate(${b.x},${b.y})">
    <path class="mb-hit" d="${hexP(w, h, 0, 28)}" fill="#000" fill-opacity="0"/><g class="mbi">
    <path d="${hexP(w, h, 2, 28)}" fill="#12052b" stroke="#12052b" stroke-width="9" stroke-linejoin="round"/>
    <path d="${hexP(w, h, 6, 27)}" fill="none" stroke="url(#mbGold)" stroke-width="7" stroke-linejoin="round"/>
    <path d="${hexP(w, h, 12, 24)}" fill="url(#hxFill)" stroke="#a46cff" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="${w / 2}" cy="${h * .2}" rx="${w * .3}" ry="${h * .09}" fill="#fff" opacity=".12"/>
    <g transform="translate(${w / 2},${h * .4}) scale(${k})">${ICONS[b.icon]}</g>
    <text x="${w / 2}" y="${h - 20}" text-anchor="middle" class="mb-t side-t" textLength="${Math.min(w - 40, b.label.length * 19)}" lengthAdjust="spacingAndGlyphs">${b.label}</text></g>
    ${b.id === 'missions' ? `<g class="badge" data-badge="missions" transform="translate(${w - 14},14)" opacity="0"><circle r="20" fill="#e5231b" stroke="#fff" stroke-width="3"/><text y="9" text-anchor="middle" font-size="26" font-weight="900" fill="#fff" font-family="Arial Black,Impact,sans-serif">!</text></g>` : ''}</g>`;
}
function topSvg(b) {
  const { w, h } = b, ph = h - 30;
  return `<g class="mb mb-top" data-id="${b.id}" role="button" tabindex="0" aria-label="${b.label}" transform="translate(${b.x},${b.y})">
    <rect class="mb-hit" width="${w}" height="${h}" rx="22" fill="#000" fill-opacity="0"/><g class="mbi">
    <rect x="1" y="1" width="${w - 2}" height="${ph}" rx="20" fill="#12052b" stroke="#12052b" stroke-width="8"/>
    <rect x="5" y="5" width="${w - 10}" height="${ph - 8}" rx="17" fill="none" stroke="url(#mbGold)" stroke-width="6"/>
    <rect x="11" y="11" width="${w - 22}" height="${ph - 20}" rx="13" fill="url(#tp-${b.id})" stroke="#1b0a3a" stroke-width="2"/>
    <rect x="14" y="13" width="${w - 28}" height="${(ph - 20) * .42}" rx="10" fill="url(#shine)" opacity=".55"/>
    <g transform="translate(${w / 2},${ph / 2 + 1}) scale(.9)">${ICONS[b.icon]}</g>
    <text x="${w / 2}" y="${h - 4}" text-anchor="middle" class="mb-t top-t" textLength="${Math.min(w - 6, b.label.length * 14)}" lengthAdjust="spacingAndGlyphs">${b.label}</text></g></g>`;
}
function miscSvg(b) {
  if (b.rect) { const [x, y, w, h] = b.rect; return `<g class="mb mb-prof" data-id="${b.id}" role="button" tabindex="0" aria-label="${b.label}"><rect class="mb-hit" x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="#000" fill-opacity="0"/></g>`; }
  return `<g class="mb mb-plus" data-id="${b.id}" role="button" tabindex="0" aria-label="${b.label}" transform="translate(${b.cx},${b.cy})"><circle class="mb-hit" r="36" fill="#000" fill-opacity="0"/><g class="mbi">
    <circle r="33" fill="#12052b"/><circle r="30" fill="none" stroke="url(#mbGold)" stroke-width="6"/><circle r="24" fill="url(#hxFill)" stroke="#a46cff" stroke-width="2"/>
    <path d="M-12 0H12M0 -12V12" stroke="#ffd34d" stroke-width="7" stroke-linecap="round"/></g></g>`;
}
/* Peças fixas (sem clique): perfil, contadores. Os textos/barras com data-bind são atualizados por js/menu-home.js */
const gemIcon = `<g transform="translate(830,60)"><path d="M0 -38L30 -14L0 38L-30 -14Z" fill="url(#gemG)" stroke="#06306e" stroke-width="3.5" stroke-linejoin="round"/><path d="M-30 -14H30M-12 -14L0 -38L12 -14M-12 -14L0 38M12 -14L0 38" fill="none" stroke="#e9fbff" stroke-width="2" opacity=".75"/></g>`;
const STATIC = `
  <g class="hm-profile">
    <circle cx="92" cy="82" r="80" fill="#12052b"/><circle cx="92" cy="82" r="75" fill="none" stroke="url(#mbGold)" stroke-width="9"/><circle cx="92" cy="82" r="66" fill="#171049" stroke="#0a0222" stroke-width="3"/>
    <path d="M158 34L474 38L438 132L158 132Z" fill="#12052b" stroke="#12052b" stroke-width="9" stroke-linejoin="round"/>
    <path d="M158 34L474 38L438 132L158 132Z" fill="none" stroke="url(#mbGold)" stroke-width="5" stroke-linejoin="round"/>
    <path d="M164 40L466 43L432 126L164 126Z" fill="url(#hxFill)"/>
    <text data-bind="name" x="184" y="78" class="hm-name">Jogador</text>
    <text data-bind="lv" x="184" y="116" class="hm-lv">Lv. --</text>
    <path d="M296 96H438L432 118H290Z" fill="#12052b" stroke="#0a0222" stroke-width="3"/><path data-bind="xp" d="M296 96H296L290 118H290Z" fill="#a259ff"/>
  </g>
  <g class="hm-counters">
    <path d="M540 36H758a22 22 0 0 1 22 22v12a22 22 0 0 1-22 22H540z" fill="#12052b" stroke="#12052b" stroke-width="6" transform="translate(-10 0)"/>
    <path d="M540 38H756a20 20 0 0 1 20 20v12a20 20 0 0 1-20 20H540z" fill="url(#barFill)" stroke="url(#mbGold)" stroke-width="4" transform="translate(-10 0)"/>
    <g transform="translate(538,64)"><circle r="35" fill="#12052b"/><circle r="31" fill="url(#mbDia)" stroke="#7a4300" stroke-width="3"/><circle r="22" fill="none" stroke="#fff4b8" stroke-width="3" opacity=".8"/><path d="M-7 -10c10 -7 18 3 7 8s-4 8 8 4" fill="none" stroke="#a85a00" stroke-width="5" stroke-linecap="round"/></g>
    <text data-bind="gold" x="640" y="80" class="hm-num">1.500</text>
    <path d="M866 36H1048a22 22 0 0 1 22 22v12a22 22 0 0 1-22 22H866z" fill="#12052b" stroke="#12052b" stroke-width="6" transform="translate(-24 0)"/>
    <path d="M866 38H1046a20 20 0 0 1 20 20v12a20 20 0 0 1-20 20H866z" fill="url(#barFill)" stroke="url(#mbGold)" stroke-width="4" transform="translate(-24 0)"/>
    ${gemIcon}
    <text data-bind="gems" x="930" y="80" class="hm-num">0</text>
  </g>`;
const ALL = [...BIG, ...SIDE, ...TOP, ...MISC];
class MenuButton {
  constructor(menu, h, el) {
    this.menu = menu; this.id = h.id; this.h = h; this.el = el;
    const press = on => () => el.classList.toggle('is-pressed', on);
    el.addEventListener('pointerdown', press(true));
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(t => el.addEventListener(t, press(false)));
    el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(true)(); } });
    el.addEventListener('keyup', e => { press(false)(); if (e.key === ' ' || e.key === 'Enter') this.activate(); });
    el.addEventListener('click', () => setTimeout(() => this.activate(), 110));      // deixa o efeito de clique aparecer
  }
  activate() { this.menu.emit(this.id, this); this.onActivate(); }                   // evento próprio + ação própria
  onActivate() {
    const h = this.h;
    if (h.id === 'youtube' || h.id === 'discord') { this.menu.social = h.id; if (SOCIAL[h.id]) { window.open(SOCIAL[h.id], '_blank', 'noopener'); return; } }
    if (h.screen) this.menu.screens.open(h.screen, this.el);
    else if (h.id === 'chat') this.menu.screens.open('chat', this.el);
  }
}
class MenuButtons {
  constructor(menu) {
    this.el = el('nav', 'buttons'); this.el.setAttribute('aria-label', 'Menu principal');
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${ART.w} ${ART.h}`); svg.setAttribute('class', 'hsvg');
    const tpDefs = `<defs>${TOP.map(b => `<linearGradient id="tp-${b.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.c[0]}"/><stop offset="1" stop-color="${b.c[1]}"/></linearGradient>`).join('')}</defs>`;
    const grp = (a, s) => `<g data-a="${a}">${s}</g>`;   // âncora: l = canto esquerdo, r = canto direito, c = centro (em telas mais largas que a arte, cada grupo gruda na sua borda)
    svg.innerHTML = DEFS + tpDefs + grp('l', STATIC) + grp('r', BIG.map(bigSvg).join('')) + grp('l', SIDE.map(sideSvg).join('')) + grp('r', TOP.map(topSvg).join('')) + grp('l', MISC.map(miscSvg).join(''));
    this.svg = svg;
    this.list = ALL.map(h => new MenuButton(menu, h, svg.querySelector(`.mb[data-id="${h.id}"]`)));
    this.el.append(svg);
  }
  /* a camada cobre a tela inteira; o SVG estica junto com o cenário (preserveAspectRatio="none") */
  place(W, H) { const s = this.el.style; s.left = '0'; s.top = '0'; s.width = W + 'px'; s.height = H + 'px'; this.svg.setAttribute('preserveAspectRatio', 'none'); }
}

/* ───────── Telas secundárias ───────── */
class ScreenManager {
  constructor(menu) {
    this.menu = menu; this.defs = {}; this.from = null; this.id = null; this.sticky = false; this.stop = null;
    this.el = el('div', 'screen');
    this.el.addEventListener('pointerdown', e => { if (e.target === this.el && !this.sticky) this.close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen && !this.sticky) this.close(); });
  }
  get isOpen() { return this.el.classList.contains('is-open'); }
  /* def = placeholder { title, text, input?, action? }  ou  tela com lógica { build(panel, manager) -> cleanup?, sticky? } */
  register(id, def) { this.defs[id] = def; return this; }
  btn(label, fn, ghost) { return el('button', 'pbtn' + (ghost ? ' ghost' : ''), { type: 'button', textContent: label, onclick: fn }); }
  open(id, from) {
    const d = this.defs[id]; if (!d) return;
    this.stop?.(); this.stop = null;
    this.id = id; if (from) this.from = from; this.sticky = !!d.sticky;
    const p = el('section', 'panel', { innerHTML: d.build ? '' : `<h2>${d.title}</h2><p>${d.text}</p>` });
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', d.title || id);
    if (d.build) this.stop = d.build(p, this) || null;
    else {
      const input = d.input ? el('input', '', d.input) : null;
      if (input) p.append(input);
      const row = el('div', 'row');
      if (d.action) row.append(this.btn(d.action, () => {
        this.menu.emit('screen:submit', { id, value: input ? input.value.trim() : '' });
        p.querySelector('p').textContent = 'Evento "screen:submit" enviado ao jogo. A lógica real entra aqui.';
      }));
      row.append(this.btn('Voltar', () => this.close(), true)); p.append(row);
    }
    this.el.replaceChildren(p);
    this.el.classList.add('is-open');
    this.menu.buttons.el.inert = true; this.menu.hud.inert = true;
    if (!d.noFocus) (p.querySelector('input') || p.querySelector('button'))?.focus({ preventScroll: true });
    this.menu.emit('screen:open', id);
  }
  close() {
    if (!this.isOpen) return;
    this.stop?.(); this.stop = null;
    this.el.classList.remove('is-open');
    this.menu.buttons.el.inert = false; this.menu.hud.inert = false;
    if (this.from) this.from.focus({ preventScroll: true });
    this.menu.emit('screen:close', this.id);
  }
}

/* ───────── MainMenu ───────── */
class MainMenu extends Emitter {
  constructor(app) {
    super();
    this.root = el('main', 'mm');
    this.background = new Background();
    this.buttons = new MenuButtons(this);
    this.screens = new ScreenManager(this);
    Object.entries(SCREENS).forEach(([id, d]) => this.screens.register(id, d));
    this.hud = el('div', 'hudart');   // camada em coordenadas da arte (1672×941): perfil, moedas e chat (js/menu-hud.js)
    this.root.append(this.background.el, this.buttons.el, this.hud, this.screens.el);
    app.append(this.root);
    new ResizeObserver(() => this.layout()).observe(app);
    this.layout();
  }
  exit() { Platform.exit(() => this.screens.open('exit')); }   // sair do jogo (usado em Configurações)
  /* A arte e as áreas clicáveis ocupam sempre o mesmo retângulo, então ficam alinhadas em qualquer resolução. */
  layout() {
    if (document.body.classList.contains('kb')) return;   // teclado aberto: não encolhe o menu junto com a janela
    const app = this.root.parentElement, W = app.clientWidth, H = app.clientHeight; if (!W || !H) return;
    /* TELA CHEIA: cenário, botões e textos são esticados juntos até as bordas (sem faixas pretas, sem desfoque). Como tudo usa a mesma
       escala (W/1672 × H/940), os botões continuam exatamente sobre o cenário em qualquer proporção de tela. */
    const sx = W / ART.w, sy = H / ART.h, s = this.background.art.style;
    s.left = '0px'; s.top = '0px'; s.width = W + 'px'; s.height = H + 'px';
    this.buttons.place(W, H);
    const hs = this.hud.style; hs.left = '0px'; hs.top = '0px'; hs.transform = `scale(${sx},${sy})`;
  }
}

window.SaiyanMenu = new MainMenu(document.getElementById('app'));
})();
