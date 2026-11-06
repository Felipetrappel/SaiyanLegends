/* LOJA DE PERSONAGENS (tela cheia) — interface construída em HTML/CSS (nenhuma imagem de interface):
 *  - Palco de 1280×720 escalado para caber em qualquer tela (letterbox, sem cortes). Fundo = cenário do menu, escurecido.
 *  - Abas: PERSONAGEM · FORMAS · UPGRADE · TÉCNICAS. Lista de personagens à esquerda, visualização no centro, painel da aba à direita.
 *  - A visualização começa VAZIA (e com atributos 0) até um personagem ser escolhido na lista (ou já houver um selecionado no perfil).
 *  - Dados reais: SL.Characters (nome, preço, stats 0–10, habilidades) e SL.Profile (ouro/diamantes, compra, seleção). Nada inventado:
 *    FORMAS, UPGRADE e partes de TÉCNICAS mostram o que o jogo realmente tem; o que ainda não existe aparece como "indisponível".
 * Compat.: SL.Shop.{catalog,characters,buy} continuam existindo. */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, P = SL.Profile, C = SL.Characters;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const catalog = { packs: [], items: [], offers: [] };
SL.Shop = { catalog, characters: () => Object.keys(C.all), buy: id => P.buy(id) };

const STAGE = { w: 1280, h: 720 };
const TABS = [['char', 'PERSONAGEM'], ['forms', 'FORMAS'], ['upg', 'UPGRADE'], ['tech', 'TÉCNICAS']];
const ATTR = [['power', 'PODER', '👊', '#ff5a4a'], ['defense', 'DEFESA', '🛡️', '#4aa8ff'], ['energy', 'ENERGIA', '⚡', '#ffd23a'], ['speed', 'VELOCIDADE', '💨', '#7dffb0']];
const idleH = d => { try { return Math.max(...d.anims.idle.f.map(i => d.frames[i].h)); } catch (e) { return 60; } };
/* Valores reais usados pelo motor (fighter.js ABIL): custo de Ki / recarga */
const ABIL_TXT = { tp: 'Segure DEFESA e toque ← ou →. Custo 15 Ki · recarga 1,5 s.', carga: 'Segure CARREGAR para recuperar Ki.' };

S.register('store', { title: 'Loja', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'nshop');
  const fill = el('div', 'ns-fill'), stage = el('div', 'ns-stage');
  p.append(fill, stage);

  /* ── topo: título, moedas, fechar ── */
  const title = el('div', 'ns-title'); title.append(el('span', '', { textContent: 'LOJA DE PERSONAGENS' }));
  const close = el('button', 'ns-close', { type: 'button', textContent: '✕' }); close.setAttribute('aria-label', 'Fechar loja');
  const counter = (ico, cls, add) => { const b = el('div', 'ns-cnt ' + cls), v = el('span', 'ns-cv'), a = el('button', 'ns-plus', { type: 'button', textContent: '+' }); a.setAttribute('aria-label', add);
    b.append(el('i', 'ns-ci', { textContent: ico }), v, a); return { b, v, a }; };
  const cg = counter('●', 'gold', 'Mais moedas'), cd = counter('◆', 'gem', 'Mais diamantes');
  const top = el('div', 'ns-top'); top.append(cg.b, cd.b);
  /* ── abas ── */
  const tabs = el('div', 'ns-tabs'); const tabEls = {};
  TABS.forEach(([id, label]) => { const b = el('button', 'ns-tab', { type: 'button', textContent: label }); b.dataset.tab = id; tabEls[id] = b; tabs.append(b); });
  /* ── painel principal ── */
  const main = el('div', 'ns-main'), list = el('div', 'ns-list'), view = el('div', 'ns-view'), side = el('div', 'ns-side');
  const plaque = el('div', 'ns-plaque'), stageBg = el('div', 'ns-vbg'), cv = el('canvas', 'ns-char'), ped = el('div', 'ns-ped'), empty = el('div', 'ns-empty');
  cv.width = 420; cv.height = 340; empty.textContent = 'Escolha um personagem na lista';
  const prev = el('button', 'ns-arrow l', { type: 'button', textContent: '‹' }), next = el('button', 'ns-arrow r', { type: 'button', textContent: '›' });
  prev.setAttribute('aria-label', 'Personagem anterior'); next.setAttribute('aria-label', 'Próximo personagem');
  const act = el('button', 'ns-act', { type: 'button' }), toast = el('div', 'ns-toast');
  view.append(stageBg, plaque, ped, cv, empty, prev, next, act);
  main.append(list, view, side); stage.append(title, top, close, tabs, main, toast);

  /* ── estado ── */
  const ids = () => SL.Shop.characters();
  let seen = P.picked && ids().includes(P.selected) ? P.selected : null, tab = 'char', tt = 0;
  const def = () => (seen ? C.get(seen) : null);
  const say = m => { toast.textContent = m; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), 2600); };
  const thumbs = {};

  function buildList() {
    list.replaceChildren(); Object.keys(thumbs).forEach(k => delete thumbs[k]);
    ids().forEach(id => { const d = C.get(id), owned = P.isUnlocked(id), b = el('button', 'ns-card' + (owned ? '' : ' locked') + (id === seen ? ' on' : ''), { type: 'button' });
      b.dataset.id = id; b.setAttribute('aria-label', d.name || id);
      const c = el('canvas', 'ns-th'); c.width = 96; c.height = 96; thumbs[id] = c;
      b.append(c, el('span', 'ns-cn', { textContent: (d.name || id).toUpperCase() }), el('span', 'ns-cp', { textContent: owned ? (P.picked && P.selected === id ? '✓ EM USO' : 'DESBLOQUEADO') : fmt(d.price) + ' ●' }));
      if (!owned) b.append(el('i', 'ns-lock', { textContent: '🔒' }));
      b.addEventListener('click', () => { seen = id; refresh(); }); list.append(b); });
  }
  function drawThumb(id) { const c = thumbs[id]; if (!c) return; const d = C.get(id), x = c.getContext('2d'); x.clearRect(0, 0, 96, 96);
    if (!d.img || !d.img.complete) return; SL.drawCharIdle(x, d, 0, 48, 88, Math.max(1, Math.min(4, Math.floor(80 / idleH(d))))); }

  function bars(d) {
    const st = (d && d.stats) || {}, w = el('div', 'ns-attrs'); w.append(el('h3', 'ns-h', { textContent: 'ATRIBUTOS' }));
    ATTR.forEach(([k, label, ico, col]) => { const v = d ? Number(st[k]) || 0 : 0, r = el('div', 'ns-row');
      const bar = el('div', 'ns-bar'), f = el('i'); f.style.width = (Math.max(0, Math.min(10, v)) * 10) + '%'; f.style.background = col; bar.append(f);
      r.append(el('span', 'ns-ai', { textContent: ico }), el('span', 'ns-al', { textContent: label + ':' }), el('b', 'ns-av', { textContent: v ? v.toFixed(1) : '0' }), bar); w.append(r); });
    return w;
  }
  const note = (h, a, b) => { const w = el('div', 'ns-note'); w.append(el('h3', 'ns-h', { textContent: h }), el('p', 'big', { textContent: a })); if (b) w.append(el('p', '', { textContent: b })); return w; };

  function sidePanel() {
    side.replaceChildren(); const d = def();
    if (tab === 'char') { side.append(bars(d));
      const info = el('div', 'ns-info');
      if (d) { const owned = P.isUnlocked(seen); info.append(el('b', '', { textContent: (d.name || seen).toUpperCase() }), el('span', '', { textContent: owned ? 'Personagem desbloqueado.' : 'Preço: ' + fmt(d.price) + ' moedas amarelas.' }),
        el('span', 'dim', { textContent: d.unique ? 'Habilidade única: ' + d.unique.name : 'Sem habilidade única.' })); }
      else info.append(el('span', 'dim', { textContent: 'Selecione um personagem para ver os dados dele.' }));
      side.append(info); return; }
    if (!d) { side.append(note(TABS.find(t => t[0] === tab)[1], 'Nenhum personagem escolhido.', 'Toque em um personagem da lista para ver esta seção.')); return; }
    if (tab === 'forms') { side.append(note('FORMAS', 'Nenhuma forma disponível.', 'O jogo ainda não tem transformações ativas: o sistema existe no motor, mas não tem botão nem tecla. Quando for liberado, as formas de ' + (d.name || seen) + ' aparecem aqui.')); return; }
    if (tab === 'upg') { const w = bars(d); w.firstChild.textContent = 'UPGRADE'; w.querySelectorAll('.ns-row').forEach(r => { const b = el('button', 'ns-up', { type: 'button', textContent: '+', disabled: true }); b.title = 'Melhorias ainda não existem no jogo'; r.append(b); });
      side.append(w, el('p', 'ns-small', { textContent: 'As melhorias de atributo ainda não existem no jogo. Os valores acima são os atuais de ' + (d.name || seen) + '.' })); return; }
    /* TÉCNICAS: slots reais do personagem (botões do combate) */
    const big = d.big, un = d.ice || d.dash, w = el('div', 'ns-tech'); w.append(el('h3', 'ns-h', { textContent: 'TÉCNICAS' }));
    const slot = (tag, name, txt, ico) => { const s = el('div', 'ns-slot'); s.append(el('i', '', { textContent: ico }), el('div', '', {}), el('em', '', { textContent: tag })); s.children[1].append(el('b', '', { textContent: name }), el('span', '', { textContent: txt })); w.append(s); };
    slot('PEQUENO', 'Poder pequeno', 'Projétil rápido' + (d.cast && d.cast.cd ? ' · recarga ' + String(d.cast.cd).replace('.', ',') + ' s' : '') + '.', '✨');
    slot('GRANDE', big ? big.name : 'Poder grande', big ? 'Custo ' + big.cost + ' Ki · recarga ' + String(big.cd).replace('.', ',') + ' s' + (big.volley ? ' · ' + big.volley + ' disparos' : '') + '.' : 'Esfera de Ki carregada · custo 45 Ki · recarga 2,5 s.', '🔥');
    slot('ÚNICA', d.unique ? d.unique.name : 'Sem habilidade única', d.unique ? 'Custo ' + (un && un.cost != null ? un.cost : 25) + ' Ki' + (un && un.cd != null ? ' · recarga ' + String(un.cd).replace('.', ',') + ' s' : '') + '.' : 'Este personagem ainda não tem.', d.unique ? '⭐' : '🔒');
    slot('TELEPORTE', 'Teleporte', ABIL_TXT.tp, '🌀'); slot('CARREGAR', 'Carregar Ki', ABIL_TXT.carga, '🔋');
    side.append(w);
  }

  function refresh() {
    const d = def(), owned = d && P.isUnlocked(seen), sel = d && P.picked && P.selected === seen;
    cg.v.textContent = fmt(P.gold); cd.v.textContent = fmt(P.gems);
    Object.entries(tabEls).forEach(([k, b]) => b.classList.toggle('on', k === tab));
    plaque.textContent = d ? (d.name || seen).toUpperCase() : ''; plaque.classList.toggle('blank', !d);
    empty.style.display = d ? 'none' : ''; cv.style.display = d ? '' : 'none'; ped.classList.toggle('lit', !!d);
    act.style.visibility = d ? 'visible' : 'hidden'; act.className = 'ns-act ' + (sel ? 'sel' : owned ? 'own' : 'buy'); act.disabled = !!sel;
    act.textContent = !d ? '' : sel ? '✓ SELECIONADO' : owned ? 'SELECIONAR' : 'COMPRAR · ' + fmt(d.price) + ' ●';
    buildList(); ids().forEach(drawThumb); sidePanel();
  }
  act.addEventListener('click', () => {
    if (!seen) return; if (P.isUnlocked(seen)) { if (P.select(seen)) { SaiyanGame.rooms.me.character = seen; say('Personagem selecionado!'); } return; }
    const r = P.buy(seen); say(r === 'ok' ? 'Compra feita! Personagem desbloqueado.' : r === 'poor' ? 'Moedas amarelas insuficientes.' : 'Item indisponível.');
  });
  const step = n => { const a = ids(); if (!seen) return say('Escolha um personagem na lista primeiro.'); if (a.length < 2) return say('Só há um personagem disponível por enquanto.'); seen = a[(a.indexOf(seen) + n + a.length) % a.length]; refresh(); };
  prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
  Object.entries(tabEls).forEach(([k, b]) => b.addEventListener('click', () => { tab = k; refresh(); }));
  close.addEventListener('click', () => S.close());
  cg.a.addEventListener('click', () => say('Comprar moedas com dinheiro real ainda não existe no jogo. Você ganha ouro derrotando oponentes.'));
  cd.a.addEventListener('click', () => say('Comprar diamantes ainda não existe no jogo (não há sistema de pagamento).'));

  /* ── desenho do personagem (idle em loop) ── */
  const ctx = cv.getContext('2d'); let raf = 0, t0 = performance.now(), alive = true;
  function draw(now) {
    if (!alive) return; raf = requestAnimationFrame(draw); const d = def(); ctx.clearRect(0, 0, cv.width, cv.height);
    if (!d || !d.img || !d.img.complete) return;
    SL.drawCharIdle(ctx, d, (now - t0) / 1000, 210, 320, Math.max(2, Math.min(6, Math.floor(270 / idleH(d)))));
  }
  raf = requestAnimationFrame(draw);
  const redrawThumbs = () => ids().forEach(id => { const d = C.get(id); if (d.img && !d.img.complete) d.img.addEventListener('load', () => drawThumb(id), { once: true }); });

  /* ── layout: o palco inteiro cabe na tela ── */
  const fit = () => { const W = p.clientWidth, H = p.clientHeight; if (!W || !H) return; const k = Math.min(W / STAGE.w, H / STAGE.h); stage.style.transform = `translate(${(W - STAGE.w * k) / 2}px,${(H - STAGE.h * k) / 2}px) scale(${k})`; };
  const ro = new ResizeObserver(fit); ro.observe(p); fit();
  const off = P.on(() => { refresh(); }), key = e => { if (e.key === 'Escape') S.close(); }; addEventListener('keydown', key);
  refresh(); redrawThumbs(); p.dataset.ready = '1';
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); off(); removeEventListener('keydown', key); clearTimeout(tt); };
} });
})();
