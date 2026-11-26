/* SELEÇÃO DE PERSONAGENS (nova interface). Substitui a tela 'characters' antiga.
 *  - Fundo = arte enviada (assets/ui/chars-bg.jpg, 1220×813) com as partes que mudam apagadas; por cima: moedas/diamantes, personagem animado no pedestal,
 *    nome, painel (nível, XP, frase, atributos), botão SELECIONAR/COMPRAR, cartões (5 por página), páginas e ordem — tudo VIVO.
 *  - Para um novo personagem basta registrá-lo em SL.Characters.all: ele aparece sozinho. Sobram vagas "Em breve" até completar a página. */
(() => {
'use strict';
const M = SaiyanMenu, P = SL.Profile, G = SaiyanGame, S = M.screens, C = SL.Characters;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const A = { w: 1220, h: 813 }, PER = 5;
const QUOTE = { felipedzn: 'A espada que corta o destino.', samulord: 'Da escuridão nasce a luz dourada.' };
const ROWS = [['⚔️', 'Ataque', 'power', '#ff3b3b'], ['🔥', 'Ki', 'energy', '#ff9a2e'], ['🛡️', 'Defesa', 'defense', '#2aa0ff'], ['👟', 'Velocidade', 'speed', '#3ddc4a']];
const ORDERS = [['Padrão', ids => ids], ['Nome', ids => ids.slice().sort((a, b) => String(C.get(a).name || a).localeCompare(String(C.get(b).name || b)))], ['Poder', ids => ids.slice().sort((a, b) => ((C.get(b).stats || {}).power || 0) - ((C.get(a).stats || {}).power || 0))]];
const idleH = d => Math.max(...d.anims.idle.f.map(i => d.frames[i].h));
const frameOf = (d, t) => d.frames[d.anims.idle.f[Math.floor(t * (d.anims.idle.fps || 6)) % d.anims.idle.f.length]];

/* desenha o sprite (ou só a silhueta preta, para "Em breve") */
const tmp = document.createElement('canvas');
function draw(ctx, d, t, cx, feetY, scale, sil) {
  if (!d || !d.img || !d.img.complete) return; const f = frameOf(d, t); ctx.imageSmoothingEnabled = false;
  const x = Math.round(cx - f.ax * scale), y = Math.round(feetY - f.ay * scale), w = f.w * scale, h = f.h * scale;
  if (!sil) { ctx.drawImage(d.img, f.x, f.y, f.w, f.h, x, y, w, h); return; }
  tmp.width = Math.ceil(w); tmp.height = Math.ceil(h); const c = tmp.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, tmp.width, tmp.height);
  c.drawImage(d.img, f.x, f.y, f.w, f.h, 0, 0, w, h); c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#02050c'; c.fillRect(0, 0, tmp.width, tmp.height); c.globalCompositeOperation = 'source-over';
  ctx.drawImage(tmp, x, y);
}

S.register('characters', { title: 'Personagem', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'csel');
  const wide = el('div', 'cs-wide'), st = el('div', 'cs-stage'); p.append(wide, st);
  const box = (cls, r, parent = st) => { const n = el('div', cls); n.style.cssText = `left:${r[0]}px;top:${r[1]}px;width:${r[2]}px;height:${r[3]}px`; parent.append(n); return n; };
  const hs = (r, label, fn) => { const b = box('cs-hs', r); b.tabIndex = 0; b.setAttribute('role', 'button'); b.setAttribute('aria-label', label); b.addEventListener('click', fn); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }); return b; };

  /* topo */
  const tGold = box('cs-t gold', [96, 12, 136, 34]), tGem = box('cs-t gem', [532, 12, 118, 34]);
  hs([954, 6, 86, 42], 'Configurações', () => S.open('options')); hs([1062, 6, 134, 42], 'Fechar', () => S.close()); hs([24, 722, 184, 48], 'Voltar', () => S.close());
  /* transformações (SamuLord): compra com moedas e escolha da forma em uso */
  const fbtn = el('button', 'cs-forms-btn', { type: 'button', textContent: '⚡ TRANSFORMAÇÕES' }); fbtn.style.cssText = 'left:96px;top:300px;width:250px;height:46px'; st.append(fbtn);
  const fov = el('div', 'cs-fov'); fov.style.cssText = 'left:400px;top:90px;width:420px;height:auto'; st.append(fov);
  const fmsg = { t: '' };
  function drawForms() {
    fov.replaceChildren(); const F = SL.Forms; if (!F) return;
    const head = el('div', 'cs-fh'); head.append(el('b', '', { textContent: 'TRANSFORMAÇÃO · SAMULORD' }), Object.assign(el('button', 'cs-fx', { type: 'button', textContent: '✕' }), { onclick: () => { fov.classList.remove('on'); } })); fov.append(head);
    const grid = el('div', 'cs-fg'); grid.style.gridTemplateColumns = F.list.length > 3 ? '1fr 1fr' : '1fr'; fov.append(grid);
    F.list.forEach(f => { const own = F.owned(f.id), cur = F.sel() === f, r = el('div', 'cs-fr' + (cur ? ' cur' : '')), c = el('canvas', '', { width: 44, height: 56 }), info = el('div', 'cs-fi');
      const dr = () => { const x = c.getContext('2d'), fr = SL.SAMULORD.frames[f.idle]; x.imageSmoothingEnabled = false; x.clearRect(0, 0, 44, 56); if (f.img.complete && f.img.naturalWidth) x.drawImage(f.img, fr.x, fr.y, fr.w, fr.h, 22 - fr.w * .5 | 0, 55 - fr.h * 1.0 | 0, fr.w, fr.h); }; dr(); if (!f.img.complete) f.img.addEventListener('load', dr, { once: true });
      info.append(el('b', '', { textContent: f.name }), el('span', '', { textContent: 'Dano ×' + String(f.dmg).replace('.', ',') + ' · Vel. ×' + String(f.speed).replace('.', ',') }));
      const bt = el('button', 'cs-fb' + (cur ? ' cur' : own ? ' own' : ''), { type: 'button', textContent: cur ? '✓ EM USO' : own ? 'USAR' : fmt(f.price) + ' ●', disabled: cur });
      bt.onclick = () => { if (own) { F.select(f.id); fmsg.t = f.name + ' em uso.'; } else { const res = F.buy(f.id); fmsg.t = res === 'ok' ? f.name + ' comprada!' : res === 'poor' ? 'Moedas insuficientes: faltam ' + fmt(f.price - P.gold) + '.' : 'Não foi possível comprar.'; } refresh(); };
      r.append(c, info, bt); grid.append(r); });
    fov.append(el('div', 'cs-fm', { textContent: fmsg.t || 'T (PC) ou botão TF (celular) assume a forma em uso por 25 s · custa 30 Ki.' }));
  }
  fbtn.addEventListener('click', () => { drawForms(); fov.classList.add('on'); });
  /* pedestal */
  const cv = el('canvas', 'cs-char'); cv.width = 420; cv.height = 340; cv.style.cssText = 'left:390px;top:66px;width:420px;height:340px'; st.append(cv);
  const q = box('cs-q', [560, 150, 80, 140]); q.textContent = '?';
  const tName = box('cs-name', [490, 422, 240, 30]);
  hs([424, 410, 44, 54], 'Personagem anterior', () => move(-1)); hs([758, 410, 44, 54], 'Próximo personagem', () => move(1));
  /* painel */
  const iName = box('cs-iname', [904, 90, 280, 44]), iLv = box('cs-ilv', [904, 134, 100, 26]), iXp = box('cs-ixp', [1000, 136, 180, 22]), bar = box('cs-bar', [904, 162, 276, 14]); const bi = el('i'); bar.append(bi);
  const iQuote = box('cs-quote', [904, 186, 280, 44]);
  box('cs-sep', [904, 236, 276, 2]);
  const rows = ROWS.map(([ic, lb, key, col], i) => { const y = 246 + i * 29; box('cs-ico', [904, y, 26, 26]).textContent = ic; box('cs-lbl', [940, y, 76, 26]).textContent = lb;
    const b = box('cs-sbar', [1018, y + 5, 112, 16]); const f = el('i'); f.style.background = col; b.append(f); const v = box('cs-sval', [1136, y, 48, 26]); return { f, v, key }; });
  box('cs-sep', [904, 408 - 6, 276, 0]);
  const act = el('button', 'cs-act', { type: 'button' }); act.style.cssText = 'left:899px;top:368px;width:283px;height:46px'; st.append(act);
  const toast = box('cs-toast', [380, 104, 460, 32]);
  /* cartões */
  const cards = [[103, 185], [299, 190], [500, 204], [715, 200], [929, 189]].map(([x, w]) => { const c = el('button', 'cs-card', { type: 'button' }); c.style.cssText = `left:${x}px;top:476px;width:${w}px;height:224px`;
    const cc = el('canvas'); cc.width = 190; cc.height = 150; const lock = el('b', 'cs-lock', { textContent: '🔒' }), nm = el('span', 'cs-cn'), sub = el('small', 'cs-cs'), tag = el('em', 'cs-diam', { textContent: '◆' }); c.append(cc, lock, tag, nm, sub); st.append(c); return { c, cc, lock, nm, sub, tag }; });
  const dots = box('cs-dots', [480, 726, 260, 20]);
  hs([22, 534, 58, 90], 'Página anterior', () => page(-1)); hs([1141, 534, 58, 90], 'Próxima página', () => page(1));
  const ord = hs([954, 722, 242, 46], 'Mudar ordem', () => { oi = (oi + 1) % ORDERS.length; list = build(); refresh(); }); ord.classList.add('cs-ord');

  let oi = 0, sel = 0, pg = 0, alive = true, raf = 0, tt = 0; const t0 = performance.now();
  const build = () => { const ids = ORDERS[oi][1](Object.keys(C.all)); const n = Math.max(PER, Math.ceil(ids.length / PER) * PER); return Array.from({ length: n }, (_, i) => ids[i] || null); };
  let list = build(); { const cur = list.indexOf(P.picked ? P.selected : C.DEFAULT); sel = Math.max(0, cur); pg = Math.floor(sel / PER); }
  const pages = () => Math.ceil(list.length / PER);
  function move(d) { const n = list.length; sel = (sel + d + n) % n; pg = Math.floor(sel / PER); refresh(); }
  function page(d) { pg = (pg + d + pages()) % pages(); sel = pg * PER; refresh(); }
  const say = (t, ok) => { toast.textContent = t; toast.style.color = ok ? '#7dffb0' : '#ffb3b3'; toast.style.opacity = 1; clearTimeout(tt); tt = setTimeout(() => { toast.style.opacity = 0; }, 2200); };

  function refresh() {
    tGold.textContent = fmt(P.gold); tGem.textContent = fmt(P.gems); ord.textContent = '⇄  Ordem: ' + ORDERS[oi][0];
    const id = list[sel], d = id && C.get(id), owned = !!id && P.isUnlocked(id), chosen = owned && P.picked && P.selected === id;
    tName.textContent = d ? String(d.name || id).toUpperCase() : '???'; q.style.display = d ? 'none' : '';
    iName.textContent = d ? String(d.name || id) : '???';
    const L = P.level, a = 100 * L * L, b = 100 * (L + 1) * (L + 1); iLv.textContent = d ? 'Nv. ' + Math.max(1, L) : 'Nv. -'; iXp.textContent = d ? Math.max(0, Math.floor(P.xp - a)) + ' / ' + (b - a) : '';
    bi.style.width = d ? 100 * P.levelProgress + '%' : '0%'; iQuote.textContent = d ? '“' + (QUOTE[id] || d.quote || 'Um guerreiro lendário.') + '”' : '“???”';
    rows.forEach(r => { const v = d && d.stats && d.stats[r.key]; r.f.style.width = v != null ? Math.min(100, v * 10) + '%' : '0%'; r.v.textContent = v != null ? Number(v).toFixed(1) : '???'; });
    act.className = 'cs-act ' + (!d ? 'soon' : chosen ? 'sel' : owned ? '' : 'buy'); act.disabled = !d || chosen;
    act.textContent = !d ? 'EM BREVE' : chosen ? '✓ SELECIONADO' : owned ? '▶  SELECIONAR' : 'COMPRAR · ' + fmt(d.price) + ' ●';
    cards.forEach((k, i) => { const idx = pg * PER + i, cid = list[idx], cd = cid && C.get(cid), ow = !!cid && P.isUnlocked(cid), ch = ow && P.picked && P.selected === cid;
      k.c.classList.toggle('on', idx === sel); k.c.classList.toggle('empty', !cd); k.c.classList.toggle('mine', ch); k.lock.style.display = !cd || !ow ? '' : 'none'; k.tag.style.display = ch ? '' : 'none';
      k.nm.textContent = cd ? String(cd.name || cid).toUpperCase() : '???'; k.sub.textContent = !cd ? 'Em breve' : ch ? 'Selecionado' : ow ? 'Nv. ' + Math.max(1, P.level) : '● ' + fmt(cd.price); k.c.setAttribute('aria-label', cd ? k.nm.textContent : 'Em breve'); k.c.onclick = () => { sel = idx; refresh(); }; });
    const hasF = id === 'samulord' && owned && !!SL.Forms; fbtn.style.display = hasF ? '' : 'none'; if (!hasF) fov.classList.remove('on'); else if (fov.classList.contains('on')) drawForms();
    drawCards();
    dots.replaceChildren(...Array.from({ length: pages() }, (_, i) => el('i', i === pg ? 'on' : '')));
  }
  function drawCards() { cards.forEach((k, i) => { const cid = list[pg * PER + i], d = C.get(cid || C.DEFAULT), x = k.cc.getContext('2d'); x.clearRect(0, 0, 190, 150); draw(x, d, 0, 95, 140, Math.min(3, 118 / idleH(d)), !cid || !P.isUnlocked(cid)); }); }
  const cardTimer = setInterval(() => alive && drawCards(), 500);
  act.addEventListener('click', () => { const id = list[sel]; if (!id) return; const d = C.get(id);
    if (P.isUnlocked(id)) { if (P.select(id)) { G.rooms.me.character = id; say((d.name || id) + ' selecionado!', true); } }
    else { const r = P.buy(id); say(r === 'ok' ? 'Compra feita! Personagem desbloqueado.' : r === 'poor' ? 'Moedas amarelas insuficientes.' : 'Item indisponível.', r === 'ok'); }
    refresh(); });

  function loop(now) { if (!alive) return; raf = requestAnimationFrame(loop); if (document.hidden) return;
    const id = list[sel], d = C.get(id || C.DEFAULT), ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 420, 340);
    draw(ctx, d, Math.max(0, performance.now() - t0) / 1000, 210, 332, 232 / idleH(d), !id); }
  const fit = () => { const W = p.clientWidth, H = p.clientHeight; if (!W || !H) return; const k = Math.min(W / A.w, H / A.h), l = (W - A.w * k) / 2, t = (H - A.h * k) / 2;
    st.style.transform = `translate(${l}px,${t}px) scale(${k})`; wide.style.cssText = `left:${l - 520 * k}px;top:${t}px;width:${2260 * k}px;height:${A.h * k}px`; };
  const ro = new ResizeObserver(fit); ro.observe(p); fit();
  const off = P.on(() => refresh()), key = e => { if (e.key === 'Escape') S.close(); else if (e.key === 'ArrowLeft') move(-1); else if (e.key === 'ArrowRight') move(1); }; addEventListener('keydown', key);
  C.all && Object.values(C.all).forEach(d => d.img && !d.img.complete && d.img.addEventListener('load', () => 0));
  refresh(); raf = requestAnimationFrame(loop);
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); off(); removeEventListener('keydown', key); clearTimeout(tt); clearInterval(cardTimer); };
} });
})();
