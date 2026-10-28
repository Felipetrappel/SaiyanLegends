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
const ART = { w: 1672, h: 940, src: 'assets/ui/menu-bg.jpg' };
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
const SOCIAL = { youtube: '', facebook: '' };    // cole aqui os links do seu canal / página: com link, o botão abre o site; sem link, mostra um aviso
const MAIN_BUTTONS = [
  { id: 'connect',    label: 'CONNECT',     screen: 'connect',    x: 340,  y: 397, w: 375 },
  { id: 'createRoom', label: 'CREATE ROOM', screen: 'createRoom', x: 960,  y: 397, w: 375 },
  { id: 'store',      label: 'STORE',       screen: 'store',      x: 335,  y: 526, w: 340 },
  { id: 'roomList',   label: 'ROOM LIST',   screen: 'roomList',   x: 1002, y: 526, w: 338 },
  { id: 'code',       label: 'CODE',        screen: 'code',       x: 334,  y: 654, w: 376 },
  { id: 'options',    label: 'OPTIONS',     screen: 'options',    x: 965,  y: 654, w: 375 }
];
const ROUND_BUTTONS = [
  { id: 'gift',     label: 'Presentes e recompensas', icon: 'gift',     screen: 'rewards',  cx: 75,   cy: 72 },
  { id: 'trophy',   label: 'Ranking',                 icon: 'trophy',   screen: 'rankings', cx: 75,   cy: 193 },
  { id: 'chat',     label: 'Chat global',             icon: 'chat',     screen: 'chat',     cx: 75,   cy: 313 },
  { id: 'youtube',  label: 'YouTube',                 icon: 'youtube',  screen: 'social',   cx: 1243, cy: 70 },
  { id: 'facebook', label: 'Facebook',                icon: 'facebook', screen: 'social',   cx: 1365, cy: 70 },
  { id: 'help',     label: 'Ajuda',                   icon: 'help',     screen: 'help',     cx: 1486, cy: 70 },
  { id: 'settings', label: 'Configurações',           icon: 'gear',     screen: 'options',  cx: 1607, cy: 70 }
];
const SVGNS = 'http://www.w3.org/2000/svg', BW = 380, BH = 112, R = 50;   // caixa de desenho do botão retangular e raio dos círculos
const ICONS = {   // desenhados em um quadrado de -26..26
  gift:     '<path d="M-20 -6h40v10h-40z M-16 4h32v18h-32z" fill="#e9dcff"/><path d="M0 -6v28" stroke="#6a2bd0" stroke-width="5"/><path d="M0 -8c-12-14-22-2-10 2zM0 -8c12-14 22-2 10 2z" fill="none" stroke="#e9dcff" stroke-width="4.5"/>',
  trophy:   '<path d="M-14 -22h28v14c0 10-6 17-14 17s-14-7-14-17z" fill="#ffc933"/><path d="M-14 -17h-9c0 9 4 13 11 13M14 -17h9c0 9-4 13-11 13" fill="none" stroke="#ffc933" stroke-width="4"/><path d="M-4 8h8v8h-8zM-12 16h24v7h-24z" fill="#ffc933"/>',
  chat:     '<path d="M-22 -18h34a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-18l-12 10v-10h-4a6 6 0 0 1-6-6v-14a6 6 0 0 1 6-6z" fill="#f2e9ff"/><circle cx="-10" cy="-5" r="3" fill="#7a2bd8"/><circle cx="0" cy="-5" r="3" fill="#7a2bd8"/><circle cx="10" cy="-5" r="3" fill="#7a2bd8"/>',
  youtube:  '<text x="0" y="17" text-anchor="middle" font-size="50" font-weight="900" fill="#e9dcff" font-family="Arial Black,Impact,sans-serif">Y</text>',
  facebook: '<text x="2" y="21" text-anchor="middle" font-size="58" font-weight="900" fill="#e9dcff" font-family="Arial Black,Impact,sans-serif">f</text>',
  help:     '<text x="0" y="19" text-anchor="middle" font-size="56" font-weight="900" fill="#ffc933" font-family="Arial Black,Impact,sans-serif">?</text>',
  gear:     '<g fill="#e9dcff"><circle r="15"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="-5" y="-25" width="10" height="11" rx="2" transform="rotate(${a})"/>`).join('') + '</g><circle r="7" fill="#4a1a98"/>'
};
const DEFS = `<defs>
  <linearGradient id="mbGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".35" stop-color="#ffc933"/><stop offset=".7" stop-color="#d98a0b"/><stop offset="1" stop-color="#ffd24f"/></linearGradient>
  <linearGradient id="mbPlate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a1db0"/><stop offset=".5" stop-color="#3c1086"/><stop offset="1" stop-color="#26065e"/></linearGradient>
  <linearGradient id="mbDia" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffbf1f"/><stop offset="1" stop-color="#c77a05"/></linearGradient>
  <radialGradient id="mbRound" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#6a2bd0"/><stop offset="1" stop-color="#2b0a66"/></radialGradient>
</defs>`;
function mainSvg(b) {
  const k = b.w / BW, H = BH * k;
  const hex = (i) => `M${i},56 L${i + 30},${i} L${BW - i - 30},${i} L${BW - i},56 L${BW - i - 30},${BH - i} L${i + 30},${BH - i} Z`;
  const dia = x => `<polygon points="${x},34 ${x + 14},56 ${x},78 ${x - 14},56" fill="url(#mbDia)" stroke="#7a4300" stroke-width="2"/><path d="M${x - 14},56H${x + 14}M${x},34V78" stroke="#fff4b8" stroke-width="1.2" opacity=".55"/>`;
  return `<g class="mb" data-id="${b.id}" role="button" tabindex="0" aria-label="${b.label}" transform="translate(${b.x},${b.y}) scale(${k})">
    <path class="mb-hit" d="${hex(0)}" fill="#000" fill-opacity="0"/><g class="mbi">
    <path d="${hex(1)}" fill="#190733" stroke="#190733" stroke-width="8" stroke-linejoin="round"/>
    <path d="${hex(5)}" fill="none" stroke="url(#mbGold)" stroke-width="7" stroke-linejoin="round"/>
    <path d="${hex(14)}" fill="url(#mbPlate)" stroke="#9a5cf0" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M44,22H336" stroke="#c9a2ff" stroke-width="2" opacity=".45"/>
    ${dia(34)}${dia(BW - 34)}
    <text x="${BW / 2}" y="${BH / 2 + 16}" text-anchor="middle" class="mb-t" textLength="${Math.max(110, Math.min(250, b.label.length * 24))}" lengthAdjust="spacingAndGlyphs">${b.label}</text></g></g>`;
}
function roundSvg(b) {
  return `<g class="mb mb-round" data-id="${b.id}" role="button" tabindex="0" aria-label="${b.label}" transform="translate(${b.cx},${b.cy})">
    <circle class="mb-hit" r="${R}" fill="#000" fill-opacity="0"/><g class="mbi">
    <circle r="${R - 1}" fill="#190733"/><circle r="${R - 4}" fill="none" stroke="url(#mbGold)" stroke-width="6"/>
    <circle r="${R - 10}" fill="url(#mbRound)" stroke="#9a5cf0" stroke-width="2"/>
    <ellipse cy="-20" rx="26" ry="11" fill="#fff" opacity=".10"/><g>${ICONS[b.icon]}</g></g></g>`;
}
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
    if (h.id === 'youtube' || h.id === 'facebook') { this.menu.social = h.id; if (SOCIAL[h.id]) { window.open(SOCIAL[h.id], '_blank', 'noopener'); return; } }
    if (h.screen) this.menu.screens.open(h.screen, this.el);
    else if (h.id === 'chat') this.menu.screens.open('chat', this.el);
  }
}
class MenuButtons {
  constructor(menu) {
    this.el = el('nav', 'buttons'); this.el.setAttribute('aria-label', 'Menu principal');
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${ART.w} ${ART.h}`); svg.setAttribute('class', 'hsvg');
    svg.innerHTML = DEFS + MAIN_BUTTONS.map(mainSvg).join('') + ROUND_BUTTONS.map(roundSvg).join('');
    this.list = [...MAIN_BUTTONS, ...ROUND_BUTTONS].map(h => new MenuButton(menu, h, svg.querySelector(`[data-id="${h.id}"]`)));
    this.el.append(svg);
  }
  place(r) { const s = this.el.style; s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px'; }
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
    const app = this.root.parentElement, r = this.background.fit(app.clientWidth, app.clientHeight);
    const s = this.background.art.style; s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
    this.buttons.place(r);
    const hs = this.hud.style, k = r.w / ART.w; hs.left = r.x + 'px'; hs.top = r.y + 'px'; hs.transform = `scale(${k})`;
  }
}

window.SaiyanMenu = new MainMenu(document.getElementById('app'));
})();
