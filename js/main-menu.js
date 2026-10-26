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
const ART = { w: 1672, h: 941, src: 'assets/ui/menu-bg.jpg' };
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

/* ───────── Botões (áreas clicáveis sobre a arte do menu) ─────────
 * A arte (assets/ui/menu-bg.jpg, 1672×941) já traz os botões desenhados. Cada botão abaixo é um polígono SVG independente,
 * em coordenadas da arte, que cobre exatamente a forma angular do botão desenhado: tem área de toque própria, brilho ao passar
 * o mouse / focar e efeito de clique, e não desenha nenhum retângulo ou fundo sobre a arte. Ajuste `pts` para mover/redimensionar. */
const HOTSPOTS = [
  { id: 'play',      label: 'Jogar',          screen: 'connect',  pts: [[1176,432],[1245,300],[1560,244],[1648,222],[1622,402]] },
  { id: 'character', label: 'Personagem',     screen: 'store',    pts: [[1215,452],[1625,415],[1612,535],[1190,556]] },
  { id: 'shop',      label: 'Loja',           screen: 'shop',     pts: [[1212,575],[1612,558],[1603,660],[1190,672]] },
  { id: 'settings',  label: 'Configurações',  screen: 'options',  pts: [[1215,705],[1610,688],[1600,782],[1190,792]] },
  { id: 'missions',  label: 'Missões',        screen: 'missions', pts: [[38,180],[140,180],[140,278],[38,278]] },
  { id: 'ranking',   label: 'Ranking',        screen: 'rankings', pts: [[38,312],[140,312],[140,402],[38,402]] },
  { id: 'events',    label: 'Eventos',        screen: 'events',   pts: [[38,432],[140,432],[140,528],[38,528]] },
  { id: 'add',       label: 'Mais moedas',    screen: 'shop',     pts: [[1586,40],[1636,40],[1636,82],[1586,82]] },
  { id: 'chatsend',  label: 'Enviar mensagem', screen: null,      pts: [[492,844],[535,844],[535,882],[492,882]] },
  { id: 'pass',      label: 'Passe',          screen: 'pass',     pts: [[38,558],[140,558],[140,652],[38,652]] }
];
const SVGNS = 'http://www.w3.org/2000/svg';
class MenuButton {
  constructor(menu, h) {
    this.menu = menu; this.id = h.id; this.screen = h.screen;
    const g = this.el = document.createElementNS(SVGNS, 'polygon');
    g.setAttribute('points', h.pts.map(q => q.join(',')).join(' '));
    g.setAttribute('class', 'hs'); g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', h.label); g.dataset.id = h.id;
    const press = on => () => g.classList.toggle('is-pressed', on);
    g.addEventListener('pointerdown', press(true));
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(t => g.addEventListener(t, press(false)));
    g.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(true)(); } });
    g.addEventListener('keyup', e => { press(false)(); if (e.key === ' ' || e.key === 'Enter') this.activate(); });
    g.addEventListener('click', () => setTimeout(() => this.activate(), 110));      // deixa o brilho de clique aparecer
  }
  activate() { this.menu.emit(this.id, this); this.onActivate(); }                   // evento próprio + ação própria
  onActivate() { if (this.screen) this.menu.screens.open(this.screen, this.el); }
}
class MenuButtons {
  constructor(menu) {
    this.el = el('nav', 'buttons'); this.el.setAttribute('aria-label', 'Menu principal');
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${ART.w} ${ART.h}`); svg.setAttribute('class', 'hsvg');
    this.list = HOTSPOTS.map(h => new MenuButton(menu, h)); this.list.forEach(b => svg.append(b.el)); this.el.append(svg);
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
    const app = this.root.parentElement, r = this.background.fit(app.clientWidth, app.clientHeight);
    const s = this.background.art.style; s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
    this.buttons.place(r);
    const hs = this.hud.style, k = r.w / ART.w; hs.left = r.x + 'px'; hs.top = r.y + 'px'; hs.transform = `scale(${k})`;
  }
}

window.SaiyanMenu = new MainMenu(document.getElementById('app'));
})();
