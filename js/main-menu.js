/* Saiyan Legends Online — Tela inicial
 *
 * MainMenu
 *  ├── Background      arte de fundo (cover, sem deformar, atrás de tudo)
 *  ├── Logo            o logo já está na arte; a classe só mede/reserva a área dele
 *  └── MenuButtons     grade 2×4 com os PNGs originais
 *       ├── ConnectButton   ├── CreateRoomButton  ├── StoreButton    ├── RoomListButton
 *       └── CodeButton      └── OptionsButton     └── RankingsButton └── ExitButton
 *
 * Eventos (um por botão): SaiyanMenu.on('connect' | 'createRoom' | 'store' | 'roomList' |
 *   'code' | 'options' | 'rankings' | 'exit', fn) + 'screen:open' | 'screen:close' | 'screen:submit'.
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

/* ───────── Background ───────── */
class Background {
  constructor() { this.el = el('img', 'bg', { src: ASSETS.background, alt: '', draggable: false }); }
  /* "cover" sem deformar; escolhe o recorte vertical que mantém o logo em foco. */
  fit(W, H) {
    const { art, logo } = CONFIG, scale = Math.max(W / art.w, H / art.h), visH = H / scale, maxTop = art.h - visH;
    const top = maxTop > .5 ? Math.min(Math.max(logo.focusY - logo.focusAt * visH, 0), maxTop) : 0;
    this.el.style.objectPosition = `50% ${maxTop > .5 ? top / maxTop * 100 : 50}%`;
    return { scale, top };
  }
}

/* ───────── Logo (já faz parte da arte do fundo) ───────── */
class Logo {
  constructor() {
    this.el = el('div', 'logo');
    this.el.setAttribute('role', 'img');
    this.el.setAttribute('aria-label', 'Saiyan Legends Online');
  }
  bottom(fit) { return (CONFIG.logo.bottom - fit.top) * fit.scale; } // px na tela onde o logo termina
  place(fit) { this.el.style.height = this.bottom(fit) + 'px'; }
}

/* ───────── Botões ───────── */
class MenuButton {
  constructor(menu, id, label) {
    this.menu = menu; this.id = id;
    const b = this.el = el('button', 'menu-btn', { type: 'button' });
    b.dataset.id = id; b.setAttribute('aria-label', label);
    b.append(el('img', '', { src: ASSETS.buttons[id], alt: '', draggable: false }));
    const press = on => () => b.classList.toggle('is-pressed', on);
    b.addEventListener('pointerdown', press(true));
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(t => b.addEventListener(t, press(false)));
    b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') press(true)(); });
    b.addEventListener('keyup', press(false));
    b.addEventListener('click', () => setTimeout(() => this.activate(), 110)); // deixa a animação de clique aparecer
  }
  activate() { this.menu.emit(this.id, this); this.onActivate(); }  // evento próprio + ação própria
  onActivate() { this.menu.screens.open(this.id, this.el); }        // padrão: abre a tela de mesmo id
}
class ConnectButton    extends MenuButton { constructor(m) { super(m, 'connect', 'Connect'); } }
class CreateRoomButton extends MenuButton { constructor(m) { super(m, 'createRoom', 'Create room'); } }
class StoreButton      extends MenuButton { constructor(m) { super(m, 'store', 'Store'); } }
class RoomListButton   extends MenuButton { constructor(m) { super(m, 'roomList', 'Room list'); } }
class CodeButton       extends MenuButton { constructor(m) { super(m, 'code', 'Code'); } }
class OptionsButton    extends MenuButton { constructor(m) { super(m, 'options', 'Options'); } }
class RankingsButton   extends MenuButton { constructor(m) { super(m, 'rankings', 'Rankings'); } }
class ExitButton       extends MenuButton {
  constructor(m) { super(m, 'exit', 'Exit'); }
  onActivate() { Platform.exit(() => this.menu.screens.open('exit', this.el)); }
}

class MenuButtons {
  constructor(menu) {
    this.el = el('nav', 'buttons');
    this.el.setAttribute('aria-label', 'Menu principal');
    // ordem = leitura da grade 2 colunas: CONNECT|CREATE ROOM, STORE|ROOM LIST, CODE|OPTIONS, RANKINGS|EXIT
    this.list = [ConnectButton, CreateRoomButton, StoreButton, RoomListButton, CodeButton, OptionsButton, RankingsButton, ExitButton].map(C => new C(menu));
    this.list.forEach(b => this.el.append(b.el));
  }
  place(top, w, gap) {
    const s = this.el.style;
    s.setProperty('--menu-top', top + 'px'); s.setProperty('--btn-w', w + 'px'); s.setProperty('--gap', gap + 'px');
  }
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
    this.menu.buttons.el.inert = true;
    if (!d.noFocus) (p.querySelector('input') || p.querySelector('button'))?.focus({ preventScroll: true });
    this.menu.emit('screen:open', id);
  }
  close() {
    if (!this.isOpen) return;
    this.stop?.(); this.stop = null;
    this.el.classList.remove('is-open');
    this.menu.buttons.el.inert = false;
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
    this.logo = new Logo();
    this.buttons = new MenuButtons(this);
    this.screens = new ScreenManager(this);
    Object.entries(SCREENS).forEach(([id, d]) => this.screens.register(id, d));
    this.root.append(this.background.el, this.logo.el, this.buttons.el, this.screens.el);
    app.append(this.root);
    new ResizeObserver(() => this.layout()).observe(app);
    this.layout();
  }
  /* Posiciona a grade na área livre entre o logo e a borda inferior, sempre inteira na tela. */
  layout() {
    const app = this.root.parentElement, cs = getComputedStyle(app), pad = s => parseFloat(cs['padding' + s]) || 0;
    const W = app.clientWidth, H = app.clientHeight;
    const fit = this.background.fit(W, H);
    this.logo.place(fit);
    const { aspect, gap, maxW } = CONFIG.btn;
    const y0 = Math.max(this.logo.bottom(fit), pad('Top')) + H * .02;
    const y1 = H - Math.max(pad('Bottom'), H * .03);
    const aw = W - pad('Left') - pad('Right') - 2 * Math.max(W * .03, 8);
    const w = Math.max(48, Math.min(aw / (2 + gap), (y1 - y0) / (4 * aspect + 3 * gap), maxW));
    const gridH = w * (4 * aspect + 3 * gap);
    this.buttons.place(y0 + Math.max(0, (y1 - y0 - gridH) / 2), w, w * gap);
  }
}

window.SaiyanMenu = new MainMenu(document.getElementById('app'));
})();
