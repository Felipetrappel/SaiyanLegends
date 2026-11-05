/* Menu principal (templo): parte VIVA do HUD e as telas JOGAR e PERSONAGEM.
 *  - Perfil (nome, nível "--" até ganhar XP, barra de XP), moedas amarelas e diamantes: SL.Profile (mesma economia da loja e das partidas).
 *  - Círculo roxo do centro: fica VAZIO até o jogador escolher um personagem (SL.Profile.picked); depois mostra o sprite real dele (animação idle)
 *    e troca sozinho quando outro personagem é selecionado.
 *  - Chat global (embaixo à esquerda): usa o chat que já existe (SL.Social / servidor). Tocar no campo abre o editor de mensagem no topo da tela (o teclado do celular não empurra o menu).
 *  - Selo "!" em MISSÕES: aparece quando uma missão é concluída e some ao abrir a tela de missões.
 *  - Telas: 'play' (abre as telas de salas que já existem) e 'characters' (seleção de personagem; a LOJA continua sendo a tela 'store'). */
(() => {
'use strict';
const M = SaiyanMenu, P = SL.Profile, G = SaiyanGame, S = M.screens, C = SL.Characters, svc = G.service, svg = M.buttons.svg;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const bind = k => svg.querySelector(`[data-bind="${k}"]`);
const myName = () => (SL.Auth && SL.Auth.user && SL.Auth.user.name) || 'Jogador';   // sem conta: "Jogador"

/* ── desenho de um frame de personagem (sprite real) ── */
function frameOf(def, anim, t) { const a = def.anims && def.anims[anim] || def.anims.idle; return def.frames[a.f[Math.floor(t * (a.fps || 6)) % a.f.length]]; }
function drawChar(ctx, def, t, cx, feetY, scale) {
  const f = frameOf(def, 'idle', t); if (!f || !def.img || !def.img.complete) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(def.img, f.x, f.y, f.w, f.h, Math.round(cx - f.ax * scale), Math.round(feetY - f.ay * scale), f.w * scale, f.h * scale);
}
const idleH = def => Math.max(...def.anims.idle.f.map(i => def.frames[i].h));
window.SL.drawCharIdle = drawChar;

/* ── perfil e contadores ── */
const photo = el('div', 'hm-photo'), pcv = el('canvas'); pcv.width = pcv.height = 132; photo.append(pcv);
Object.assign(photo.style, { left: '26px', top: '16px', width: '132px', height: '132px' });
function paintPhoto() {
  const ctx = pcv.getContext('2d'); ctx.clearRect(0, 0, 132, 132); ctx.imageSmoothingEnabled = false;
  if (!P.picked) return;   // sem personagem escolhido: o círculo da foto fica vazio
  const d = C.get(P.selected), r = d.portrait, s = Math.max(132 / r.w, 132 / r.h);
  if (!d.img.complete) { d.img.addEventListener('load', paintPhoto, { once: true }); return; }
  ctx.drawImage(d.img, r.x, r.y, r.w, r.h, (132 - r.w * s) / 2, 0, r.w * s, r.h * s);
}
function paint() {
  bind('gold').textContent = fmt(P.gold); bind('gems').textContent = fmt(P.gems);
  bind('name').textContent = String(myName()).slice(0, 14);
  bind('lv').textContent = 'Lv. ' + (P.level > 0 ? P.level : '--');
  const W = 142 * Math.max(0, Math.min(1, P.levelProgress)); bind('xp').setAttribute('d', `M296 96H${296 + W}L${290 + W} 118H290Z`);
  paintPhoto();
}
P.on(why => { if (why === 'missionDone') flagMissions(true); paint(); });
M.on('screen:close', paint);

/* ── selo de missão concluída ── */
const BK = 'sl.missionBadge', badge = svg.querySelector('[data-badge="missions"]');
const flagMissions = on => { try { on ? localStorage.setItem(BK, '1') : localStorage.removeItem(BK); } catch (e) {} badge.setAttribute('opacity', on ? 1 : 0); };
try { badge.setAttribute('opacity', localStorage.getItem(BK) ? 1 : 0); } catch (e) {}
M.on('screen:open', id => { if (id === 'missions') flagMissions(false); });

/* ── personagem no círculo central ── */
const cc = el('canvas', 'hm-char'); cc.width = 340; cc.height = 300; Object.assign(cc.style, { left: '665px', top: '505px', width: '340px', height: '300px' });
let tPrev = 0, shown = null, t0 = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  if (now - tPrev < 80 || document.hidden || S.isOpen) return; tPrev = now;
  const ctx = cc.getContext('2d');
  if (!P.picked) { if (shown) { ctx.clearRect(0, 0, 340, 300); shown = null; } return; }   // círculo vazio enquanto ninguém foi escolhido
  const d = C.get(P.selected); shown = d.id; ctx.clearRect(0, 0, 340, 300);
  drawChar(ctx, d, (now - t0) / 1000, 170, 276, Math.max(3, Math.min(6, Math.round(268 / idleH(d)))));
}
requestAnimationFrame(loop);

/* ── chat global (miniatura) ── */
const chat = el('div', 'hm-chat'), msgs = el('div', 'hm-msgs');
Object.assign(chat.style, { left: '20px', top: '808px', width: '560px', height: '110px' });
Object.assign(msgs.style, { left: '30px', top: '690px', width: '540px', height: '112px' });
const head = el('div', 'hm-chat-h'), onl = el('span', 'hm-on'), field = el('div', 'hm-field', { textContent: 'Digite sua mensagem...', role: 'button', tabIndex: 0 }), send = el('button', 'hm-send', { type: 'button' });
head.innerHTML = '<svg viewBox="-30 -26 60 56"><g>' + `<path d="M-22 -18h34a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-18l-12 10v-10h-4a6 6 0 0 1-6-6v-14a6 6 0 0 1 6-6z" fill="#f2e9ff" transform="translate(2 -2)"/><circle cx="-7" cy="-7" r="3" fill="#7a2bd8"/><circle cx="2" cy="-7" r="3" fill="#7a2bd8"/><circle cx="11" cy="-7" r="3" fill="#7a2bd8"/>` + '</g></svg><b>CHAT GLOBAL</b>';
onl.innerHTML = '<i></i><span></span>'; head.append(onl);
send.setAttribute('aria-label', 'Enviar mensagem'); field.setAttribute('aria-label', 'Escrever no chat global');
send.innerHTML = '<svg viewBox="0 0 30 30"><path d="M6 15h17M15 6l9 9-9 9" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const crow = el('div', 'hm-chat-r'); crow.append(field, send); chat.append(head, crow);
const rowOf = m => { const r = el('div', 'hc-row'); r.append(el('span', 'hc-lv', { textContent: Math.max(0, m.lv | 0) }), el('b', 'hc-nm', { textContent: String(m.name || 'Jogador').slice(0, 16) }), el('span', 'hc-tx', { textContent: String(m.text || '').slice(0, 90) })); return r; };
function paintChat() {
  const online = svc.mode === 'online'; onl.classList.toggle('off', !online);
  onl.lastChild.textContent = online ? Math.max(1, SL.Social.online) + ' online' : 'Offline';
  msgs.replaceChildren(...SL.Social.log.slice(-3).map(rowOf));
}
['chat', 'online', 'status'].forEach(e => svc.on(e, paintChat));
function composer() {
  if (document.querySelector('.composer')) return;
  document.body.classList.add('kb');
  const box = el('div', 'composer'), list = el('div', 'cmp-list'), row = el('div', 'cmp-row'), err = el('div', 'cmp-err');
  const inp = el('input', 'cmp-input', { type: 'text', maxLength: 120, placeholder: 'Digite sua mensagem...', autocomplete: 'off', enterKeyHint: 'send' });
  const ok = el('button', 'cmp-btn', { type: 'button', textContent: 'Enviar' }), x = el('button', 'cmp-btn ghost', { type: 'button', textContent: 'Fechar' });
  const draw = () => { list.replaceChildren(...SL.Social.log.slice(-8).map(rowOf)); list.scrollTop = list.scrollHeight; };
  const close = () => { svc.off && svc.off('chat', draw); box.remove(); document.body.classList.remove('kb'); M.layout(); paintChat(); };
  const go = async () => { const t = inp.value.replace(/\s+/g, ' ').trim(); if (!t) return; err.textContent = ''; try { await SL.Social.send(t); inp.value = ''; draw(); } catch (e) { err.textContent = e.message || 'Não foi possível enviar.'; } };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') close(); }); inp.addEventListener('keyup', e => e.stopPropagation());
  ok.onclick = go; x.onclick = close; row.append(inp, ok, x); box.append(list, row, err); document.body.append(box); draw(); svc.on('chat', draw);
  setTimeout(() => inp.focus(), 30);
}
field.addEventListener('click', composer); field.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); composer(); } });
send.addEventListener('click', composer);
M.hud.append(photo, cc, msgs, chat); paintChat(); paint();

/* ── tela JOGAR: abre as telas de salas que já existem ── */
S.register('play', { title: 'Jogar', build(p) {
  p.classList.add('wide'); p.append(el('h2', '', { textContent: 'JOGAR' }), el('p', '', { textContent: 'Entre na batalha: conecte-se, crie uma sala, escolha uma da lista ou use um código.' }));
  const g = el('div', 'playgrid');
  [['CONECTAR', 'connect'], ['CRIAR SALA', 'createRoom'], ['LISTA DE SALAS', 'roomList'], ['ENTRAR COM CÓDIGO', 'code']].forEach(([l, id]) => g.append(S.btn(l, () => S.open(id))));
  const r = el('div', 'row'); r.append(S.btn('Voltar', () => S.close(), true)); p.append(g, r);
} });

/* ── tela PERSONAGEM: ver os personagens e selecionar ── */
S.register('characters', { title: 'Personagem', build(p) {
  p.classList.add('wide'); const msg = el('div', 'msg'), grid = el('div', 'chargrid');
  p.append(el('h2', '', { textContent: 'PERSONAGEM' }), el('p', '', { textContent: 'Escolha seu herói. Ele aparece no centro do menu.' }), grid, msg);
  const ids = () => Object.keys(C.all);
  function render() {
    grid.replaceChildren();
    for (const id of ids()) {
      const d = C.get(id), st = d.stats || {}, owned = P.isUnlocked(id), sel = P.picked && P.selected === id;
      const card = el('div', 'charcard' + (sel ? ' sel' : '')), cv = el('canvas'); cv.width = 104; cv.height = 112;
      const draw = () => { const c = cv.getContext('2d'); c.clearRect(0, 0, 104, 112); drawChar(c, d, 0, 52, 104, Math.max(1, Math.min(4, Math.floor(96 / idleH(d))))); };
      d.img.complete ? draw() : d.img.addEventListener('load', draw, { once: true });
      const b = S.btn(sel ? '✓ SELECIONADO' : owned ? 'SELECIONAR' : 'COMPRAR · ' + fmt(d.price) + ' ●', () => {
        if (owned) { if (P.select(id)) { G.rooms.me.character = id; msg.style.color = '#7dffb0'; msg.textContent = (d.name || id) + ' selecionado!'; } return; }
        const r = P.buy(id); msg.style.color = r === 'ok' ? '#7dffb0' : ''; msg.textContent = r === 'ok' ? 'Compra feita! Personagem desbloqueado.' : r === 'poor' ? 'Moedas amarelas insuficientes.' : 'Item indisponível.';
      }); b.disabled = sel;
      card.append(cv, el('b', '', { textContent: String(d.name || id).toUpperCase() }), el('small', '', { textContent: ['power', 'defense', 'energy', 'speed'].map(k => st[k] != null ? Number(st[k]).toFixed(1) : '-').join(' · ') }), b);
      grid.append(card);
    }
  }
  render(); const off = P.on(() => render());
  const r = el('div', 'row'); r.append(S.btn('Loja', () => S.open('store')), S.btn('Voltar', () => S.close(), true)); p.append(r);
  return off;
} });
})();
