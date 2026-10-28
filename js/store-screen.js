/* LOJA (tela cheia): arte roxa/dourada de fundo (assets/ui/store-bg.jpg, 1672×941) + elementos criados por cima, em coordenadas da arte.
 *  - Centro: o personagem selecionado (sprite real, animação idle) dentro do círculo; setas ◀ ▶ trocam de personagem.
 *  - Direita: ATRIBUTOS reais do personagem (def.stats em js/characters.js: poder, defesa, energia, velocidade, K) e DIAMANTES.
 *  - Topo: moedas amarelas (ouro), rubis e diamantes do perfil (SL.Profile, salvo no navegador/aparelho).
 *  - Abas: COMPRAR (personagem: selecionar/comprar com ouro), PACOTES, ITENS, OFERTAS (catálogos: ver SL.Shop.catalog).
 *  - Compras: só acontecem se houver o que entregar. Hoje só existem personagens; pacotes/itens/ofertas dependem de inventário (ainda não existe).
 * Para mover/redimensionar um botão, mude os números em HS / TABS abaixo (nada disso exige editar a imagem). */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, P = SL.Profile, ART = { w: 1672, h: 941, src: 'assets/ui/store-bg.jpg' };
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const SVGNS = 'http://www.w3.org/2000/svg', fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const hex = (cx, cy, w, h, c = .28) => [[cx - w / 2, cy], [cx - w / 2 + w * c, cy - h / 2], [cx + w / 2 - w * c, cy - h / 2], [cx + w / 2, cy], [cx + w / 2 - w * c, cy + h / 2], [cx - w / 2 + w * c, cy + h / 2]];

/* Catálogo. type 'character' é entregue de verdade (libera o personagem no perfil). Pacotes/itens/ofertas dependem de um sistema de inventário que ainda NÃO existe: ficam vazios até ele existir. */
const catalog = { packs: [], items: [], offers: [] };
SL.Shop = { catalog, characters: () => Object.keys(SL.Characters.all), buy: id => P.buy(id) };

const ATTR = [['power', 340], ['defense', 392], ['energy', 445], ['speed', 498]];
const HS = [   // áreas de toque (polígonos em coordenadas da arte)
  { id: 'prev',  label: 'Personagem anterior', pts: hex(365, 438, 112, 104) }, { id: 'next', label: 'Próximo personagem', pts: hex(821, 438, 112, 104) },
  { id: 'close', label: 'Fechar loja', pts: [[0, 772], [100, 772], [146, 830], [100, 890], [0, 890]] },
  { id: 'cart',  label: 'Loja (seção atual)', pts: hex(80, 205, 160, 112) }, { id: 'gift', label: 'Presentes', pts: hex(85, 335, 124, 104) },
  { id: 'pass',  label: 'Passe', pts: hex(85, 455, 124, 104) }, { id: 'gear', label: 'Configurações', pts: hex(85, 572, 124, 104) },
  { id: 'addGold', label: 'Mais moedas', pts: hex(365, 65, 84, 78) }, { id: 'addRuby', label: 'Mais rubis', pts: hex(663, 65, 84, 78) }, { id: 'addGem', label: 'Mais diamantes', pts: hex(1432, 65, 84, 78) },
  { id: 'gemShop', label: 'Comprar diamantes', pts: [[1400, 462], [1616, 462], [1616, 654], [1400, 654]] }
];
const TABS = [['buy', 'COMPRAR', 228, 578], ['packs', 'PACOTES', 580, 858], ['items', 'ITENS', 862, 1152], ['offers', 'OFERTAS', 1156, 1488]];
const TAB_CY = 819, TAB_H = 100;
const NOTE = {
  packs: ['Pacotes', 'Nenhum pacote disponível ainda.', 'Os pacotes (vários itens por um preço) dependem de um sistema de inventário, que ainda não existe no jogo.'],
  items: ['Itens', 'Nenhum item disponível ainda.', 'Itens (poções, auras, acessórios) dependem de um sistema de inventário, que ainda não existe no jogo.'],
  offers: ['Ofertas', 'Nenhuma oferta no momento.', 'As ofertas especiais precisam de um catálogo com preços e prazos, que ainda não existe.']
};

S.register('store', { title: 'Loja', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap');
  const fill = el('img', 'shop-fill', { src: ART.src, alt: '', draggable: false }), art = el('div', 'shopart');
  art.append(el('img', 'shop-bg', { src: ART.src, alt: '', draggable: false }));
  /* personagem (sprite real, idle) dentro do círculo */
  const cv = el('canvas', 'shop-char'); cv.width = 420; cv.height = 430; cv.style.left = '385px'; cv.style.top = '215px'; art.append(cv);
  const nameEl = el('div', 'shop-name'), act = el('button', 'shop-act', { type: 'button' }), toast = el('div', 'shop-toast'), panel = el('div', 'shop-panel');
  const vals = { gold: el('div', 'shop-num'), silver: el('div', 'shop-num'), gems: el('div', 'shop-num'), gems2: el('div', 'shop-num big') };
  const place = (n, x, y, w = 120) => { n.style.left = (x - w / 2) + 'px'; n.style.top = y + 'px'; n.style.width = w + 'px'; art.append(n); };
  place(vals.gold, 282, 44); place(vals.silver, 579, 44); place(vals.gems, 1285, 44); place(vals.gems2, 1507, 380, 100);
  const av = {}; ATTR.forEach(([k, y]) => { av[k] = el('div', 'shop-val'); av[k].style.top = (y - 20) + 'px'; art.append(av[k]); });
  av.k = el('div', 'shop-val'); av.k.style.top = '612px'; art.append(av.k);
  nameEl.style.left = '395px'; nameEl.style.top = '655px'; act.style.left = '485px'; act.style.top = '708px';
  art.append(nameEl, act, panel, toast);
  /* SVG: abas (desenhadas aqui) + áreas de toque */
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${ART.w} ${ART.h}`); svg.setAttribute('class', 'hsvg shop-svg');
  svg.innerHTML = `<defs><linearGradient id="tbOn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a52ff"/><stop offset=".55" stop-color="#6a2bd8"/><stop offset="1" stop-color="#4a1aa8"/></linearGradient>
    <linearGradient id="tbOff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a1a96"/><stop offset="1" stop-color="#26085e"/></linearGradient></defs>` + TABS.map(([id, label, x0, x1]) => {
      const w = x1 - x0, pts = hex((x0 + x1) / 2, TAB_CY, w, TAB_H, 90 / w).map(q => q.join(',')).join(' '), ins = hex((x0 + x1) / 2, TAB_CY, w - 26, TAB_H - 24, 78 / w).map(q => q.join(',')).join(' ');
      return `<g class="tab" data-tab="${id}" role="button" tabindex="0" aria-label="${label}"><polygon class="hit" points="${pts}" fill="#000" fill-opacity="0"/><g class="mbi">
        <polygon points="${pts}" fill="#190733" stroke="#190733" stroke-width="9" stroke-linejoin="round"/><polygon class="tb-edge" points="${pts}" fill="none" stroke="url(#mbGoldShop)" stroke-width="7" stroke-linejoin="round"/>
        <polygon class="tb-fill" points="${ins}" stroke="#b985ff" stroke-width="2" stroke-linejoin="round"/>
        <text x="${(x0 + x1) / 2}" y="${TAB_CY + 17}" text-anchor="middle" class="mb-t tab-t" textLength="${label.length * 25}" lengthAdjust="spacingAndGlyphs">${label}</text></g></g>`; }).join('') +
    `<defs><linearGradient id="mbGoldShop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".35" stop-color="#ffc933"/><stop offset=".7" stop-color="#d98a0b"/><stop offset="1" stop-color="#ffd24f"/></linearGradient></defs>` +
    HS.map(h => `<polygon class="hs" data-id="${h.id}" role="button" tabindex="0" aria-label="${h.label}" points="${h.pts.map(q => q.join(',')).join(' ')}"/>`).join('');
  art.append(svg); p.append(fill, art);

  /* ── estado ── */
  const ids = () => SL.Shop.characters(); let cur = Math.max(0, ids().indexOf(P.selected)), tab = 'buy', tt = 0;
  const def = () => SL.Characters.get(ids()[cur]);
  const say = m => { toast.textContent = m; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), 2600); };
  function refresh() {
    const id = ids()[cur], d = def(), st = d.stats || {};
    vals.gold.textContent = fmt(P.gold); vals.silver.textContent = fmt(P.silver); vals.gems.textContent = fmt(P.gems); vals.gems2.textContent = fmt(P.gems);
    ATTR.forEach(([k]) => { av[k].textContent = st[k] != null ? st[k] : '-'; }); av.k.textContent = st.k != null ? st.k : '-';
    nameEl.textContent = (d.name || id).toUpperCase();
    const owned = P.isUnlocked(id), sel = P.selected === id;
    act.className = 'shop-act ' + (sel ? 'sel' : owned ? 'own' : 'buy'); act.disabled = sel;
    act.textContent = sel ? '✓ SELECIONADO' : owned ? 'SELECIONAR' : 'COMPRAR · ' + fmt(d.price) + ' ●';
    svg.querySelectorAll('.tab').forEach(g => g.classList.toggle('on', g.dataset.tab === tab));
    svg.querySelectorAll('.hs').forEach(h => h.classList.toggle('off', tab !== 'buy' && ['prev', 'next'].includes(h.dataset.id)));
    art.classList.toggle('cat', tab !== 'buy');
    panel.replaceChildren();
    if (tab !== 'buy') { const n = NOTE[tab], list = catalog[tab]; panel.append(el('h3', '', { textContent: n[0] }));
      if (!list.length) panel.append(el('p', 'big', { textContent: n[1] }), el('p', '', { textContent: n[2] }), el('p', 'hint2', { textContent: 'Toque em COMPRAR para ver os personagens.' })); }
  }
  act.addEventListener('click', () => {
    const id = ids()[cur]; if (P.isUnlocked(id)) { if (P.select(id)) { SaiyanGame.rooms.me.character = id; say('Personagem selecionado!'); } return; }
    const r = P.buy(id); say(r === 'ok' ? 'Compra feita! Personagem desbloqueado.' : r === 'poor' ? 'Moedas amarelas insuficientes.' : 'Item indisponível.');
  });
  const go = {
    prev: () => { if (ids().length < 2) return say('Só há um personagem disponível por enquanto.'); cur = (cur + ids().length - 1) % ids().length; refresh(); },
    next: () => { if (ids().length < 2) return say('Só há um personagem disponível por enquanto.'); cur = (cur + 1) % ids().length; refresh(); },
    close: () => S.close(), cart: () => { tab = 'buy'; refresh(); say('Loja · COMPRAR'); }, gift: () => S.open('rewards'), pass: () => S.open('pass'), gear: () => S.open('options'),
    addGold: () => say('Comprar moedas com dinheiro real ainda não existe no jogo. Você ganha ouro derrotando oponentes.'), addRuby: () => say('Rubis ainda não podem ser obtidos nem comprados.'),
    addGem: () => say('Comprar diamantes ainda não existe no jogo (não há sistema de pagamento).'), gemShop: () => say('Comprar diamantes ainda não existe no jogo (não há sistema de pagamento).')
  };
  const press = (n, fn) => {
    const on = v => () => n.classList.toggle('is-pressed', v);
    n.addEventListener('pointerdown', on(true)); ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(t => n.addEventListener(t, on(false)));
    n.addEventListener('click', () => setTimeout(fn, 90)); n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  };
  svg.querySelectorAll('.hs').forEach(h => press(h, go[h.dataset.id]));
  svg.querySelectorAll('.tab').forEach(g => press(g, () => { tab = g.dataset.tab; refresh(); }));

  /* ── desenho do personagem (idle em loop) ── */
  const ctx = cv.getContext('2d'); let raf = 0, t0 = performance.now(), alive = true;
  function draw(now) {
    if (!alive) return; raf = requestAnimationFrame(draw);
    const d = def(), f = d.frames[SL.frameAt(d, 'idle', Math.max(0, now - t0) / 1000)], img = d.img; ctx.clearRect(0, 0, cv.width, cv.height);
    if (!img || !img.complete || !img.naturalWidth) return;
    const sc = Math.max(1, Math.min(5, Math.floor(300 / Math.max(...d.frames.slice(0, 5).map(q => q.h))))), cx = 210, feet = 392;   // escala inteira (pixel art nítida); cabe sem cortar cabeça/pés
    ctx.fillStyle = 'rgba(10,0,30,.45)'; ctx.beginPath(); ctx.ellipse(cx, feet + 2, 46 * sc / 3, 8, 0, 0, 7); ctx.fill();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(cx - f.ax * sc), Math.round(feet - f.ay * sc), f.w * sc, f.h * sc);
  }
  raf = requestAnimationFrame(draw);

  /* ── layout: a arte inteira cabe na tela (sem cortar); a camada de elementos acompanha ── */
  const fit = () => { const W = p.clientWidth, H = p.clientHeight; if (!W || !H) return; const k = Math.min(W / ART.w, H / ART.h); art.style.transform = `translate(${(W - ART.w * k) / 2}px,${(H - ART.h * k) / 2}px) scale(${k})`; };
  const ro = new ResizeObserver(fit); ro.observe(p); fit();
  const off = P.on(refresh), key = e => { if (e.key === 'Escape') S.close(); }; addEventListener('keydown', key);
  SL.frameAt || (SL.frameAt = (d, n, t) => { const a = d.anims[n], i = a.loop ? Math.floor(t * a.fps) % a.f.length : Math.min(Math.floor(t * a.fps), a.f.length - 1); return a.f[i]; });
  refresh(); p.dataset.ready = '1';
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); off(); removeEventListener('keydown', key); clearTimeout(tt); };
} });
})();
