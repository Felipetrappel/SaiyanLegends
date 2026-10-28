/* Dados sociais do menu: PERFIL (nível, XP, moedas — SL.Profile) e CHAT GLOBAL (servidor, op "chat"). Registra as telas
 * CHAT (botão de balão), PRESENTES (botão de presente), AJUDA (?) e REDES (YouTube/Facebook) e acrescenta o resumo de nível/moedas à loja.
 *  - Moedas/XP: SL.Profile.addXp(n) / addCoins('gold'|'silver'|'gems', n) / spend(). Hoje se ganha XP e ouro derrotando oponentes.
 *  - Chat: todos os jogadores conectados ao servidor veem as mesmas mensagens; sem servidor, só você vê as suas. */
(() => {
'use strict';
const M = SaiyanMenu, P = SL.Profile, G = SaiyanGame, svc = G.service, S = M.screens;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const myName = () => (SL.Auth && SL.Auth.user && SL.Auth.user.name) || G.rooms.me.name || 'Jogador';
const summary = () => `Nível ${P.level} · XP ${fmt(P.xp)} · Poder ${fmt(P.power)} · Ouro ${fmt(P.gold)} · Rubis ${fmt(P.silver)} · Diamantes ${fmt(P.gems)}`;

/* ── chat (dados) ── */
const log = [], seen = new Set(), ls = new Set(); let online = svc.mode === 'online' ? 1 : 0;
const note = () => ls.forEach(f => f());
svc.on('chat', m => { if (!m || seen.has(m.n)) return; seen.add(m.n); log.push(m); if (log.length > 60) log.shift(); note(); });
svc.on('online', n => { online = n == null ? 0 : n; note(); });
svc.on('status', () => { if (svc.mode !== 'online') { online = 0; note(); } });
const rowOf = m => { const r = el('div', 'hc-row'); r.append(el('span', 'hc-lv', { textContent: Math.max(0, m.lv | 0) }), el('b', 'hc-nm', { textContent: String(m.name || 'Jogador').slice(0, 16) }), el('span', 'hc-tx', { textContent: String(m.text || '').slice(0, 120) })); return r; };
window.SL.Social = { log, send: t => svc.sendChat(t, P.level, myName()), get online() { return online; }, summary };

S.register('chat', { title: 'Chat global', build(p) {
  p.classList.add('chat');
  const h = el('h2', '', { textContent: 'Chat global' }), st = el('p', 'hint'), list = el('div', 'clist'), err = el('div', 'msg'), row = el('div', 'crow');
  const inp = el('input', '', { type: 'text', maxLength: 120, placeholder: 'Digite sua mensagem...', autocomplete: 'off', enterKeyHint: 'send' });
  inp.setAttribute('aria-label', 'Mensagem do chat global');
  const paint = () => {
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    st.textContent = svc.mode === 'online' ? '● ' + online + ' online' : '○ Sem servidor: só você vê as mensagens'; st.style.color = svc.mode === 'online' ? '#7dffb0' : '#ffb36b';
    list.replaceChildren(...(log.length ? log.map(rowOf) : [el('p', 'empty', { textContent: 'Nenhuma mensagem ainda. Escreva a primeira!' })]));
    if (near) list.scrollTop = list.scrollHeight;
  };
  const go = async () => { const t = inp.value.replace(/\s+/g, ' ').trim(); if (!t) return; err.textContent = ''; try { await window.SL.Social.send(t); inp.value = ''; list.scrollTop = list.scrollHeight; } catch (e) { err.textContent = e.message; } };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } }); inp.addEventListener('keyup', e => e.stopPropagation());
  row.append(inp, S.btn('Enviar', go)); p.append(h, st, list, err, row, el('div', 'row', {}));
  p.lastChild.append(S.btn('Voltar', () => S.close(), true));
  ls.add(paint); paint(); list.scrollTop = list.scrollHeight; setTimeout(() => inp.focus({ preventScroll: true }), 50);
  return () => ls.delete(paint);
} });

/* ── presentes e recompensas ── */
S.register('rewards', { title: 'Presentes', build(p) {
  p.classList.add('wide'); p.append(el('h2', '', { textContent: 'Presentes e recompensas' }), el('p', 'sumline', { textContent: summary() }),
    el('p', '', { textContent: 'Presentes diários e baús ainda não existem no jogo. Por enquanto, a recompensa é: derrotar um oponente que você acertou rende +25 XP e +10 de ouro.' }));
  const r = el('div', 'row'); r.append(S.btn('Missões', () => S.open('missions')), S.btn('Eventos', () => S.open('events')), S.btn('Passe', () => S.open('pass')), S.btn('Loja', () => S.open('store')), S.btn('Voltar', () => S.close(), true)); p.append(r);
} });

/* ── ajuda ── */
S.register('help', { title: 'Ajuda', build(p) {
  p.classList.add('wide'); p.append(el('h2', '', { textContent: 'Como jogar' }));
  const t = el('table', 'keys'); [['Mover', '← → ou A D  ·  botões ◀ ▶ na tela'], ['Pular', 'W, ↑ ou Espaço  ·  botão da bota'], ['Voar', 'F liga/desliga  ·  toque duplo na bota; sobe W/↑, desce S/↓'], ['Soco', 'J ou Z  ·  botão do punho'],
    ['Poder de Ki', 'K, X ou E'], ['Transformar', 'T'], ['Especial', 'R'], ['Rajada', 'Q'], ['Esfera', 'C'], ['Defender', 'S, ↓ ou botão do escudo'], ['Carregar Ki', 'M (segure) — o Ki só recarrega assim'],
    ['Som', 'M liga/desliga fora da partida']].forEach(([a, b]) => { const tr = el('tr'); tr.append(el('td', '', { textContent: a }), el('td', '', { textContent: b })); t.append(tr); });
  p.append(t, el('div', 'row')); p.lastChild.append(S.btn('Voltar', () => S.close(), true));
} });

/* ── YouTube / Facebook ── */
S.register('social', { title: 'Redes', build(p) {
  const n = M.social === 'facebook' ? 'Facebook' : 'YouTube';
  p.append(el('h2', '', { textContent: n }), el('p', '', { textContent: `O link do ${n} ainda não foi configurado. Cole o endereço em SOCIAL, no começo de js/main-menu.js, e o botão passa a abrir o site.` }), el('div', 'row'));
  p.lastChild.append(S.btn('Voltar', () => S.close(), true));
} });

})();
