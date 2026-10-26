/* HUD do menu principal (camada em coordenadas da arte 1672×941): PERFIL (retrato do personagem selecionado, nome, nível, XP, poder),
 * MOEDAS (ouro, prata, diamantes) e CHAT GLOBAL. Tudo começa ZERADO / VAZIO.
 *  - Perfil e moedas: SL.Profile (js/characters.js). Ganhos: SL.Profile.addXp(n) / addCoins('gold'|'silver'|'gems', n); gastos: spend().
 *    Hoje se ganha XP e ouro derrotando oponentes; prata e diamantes já funcionam, mas nada os concede ainda.
 *  - Chat global: servidor (op "chat") para todos os jogadores online; sem servidor, a mensagem só aparece para você. */
(() => {
'use strict';
const M = SaiyanMenu, P = SL.Profile, G = SaiyanGame, svc = G.service, H = M.hud;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const at = (node, x, y, w) => { Object.assign(node.style, { left: x + 'px', top: y + 'px' }); if (w) node.style.width = w + 'px'; H.append(node); return node; };
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ── perfil ── */
const portrait = at(el('div', 'hp-portrait'), 44, 34); portrait.style.width = '104px'; portrait.style.height = '98px';
const nameEl = at(el('div', 'hp-name'), 192, 36, 230), lvEl = at(el('div', 'hp-lv'), 190, 82), xpFill = at(el('i', 'hp-xp'), 278, 90);
const powL = at(el('div', 'hp-powl', { textContent: 'Poder' }), 532, 60), powV = at(el('div', 'hp-powv'), 532, 80, 100);
const coins = { gold: at(el('div', 'hp-coin'), 1180, 44, 88), silver: at(el('div', 'hp-coin'), 1342, 44, 88), gems: at(el('div', 'hp-coin'), 1496, 44, 88) };
const myName = () => (SL.Auth && SL.Auth.user && SL.Auth.user.name) || G.rooms.me.name || 'Jogador';
let shown = '';
function paint() {
  const id = P.selected; if (shown !== id) { shown = id; const pt = SL.Characters.portrait(id, 2.3); portrait.replaceChildren(pt); }
  const n = myName(); nameEl.textContent = n; nameEl.style.fontSize = (n.length > 11 ? 24 : n.length > 8 ? 29 : 34) + 'px';
  lvEl.textContent = 'Lv. ' + P.level; xpFill.style.width = Math.round(P.levelProgress * 164) + 'px'; powV.textContent = fmt(P.power);
  for (const k in coins) coins[k].textContent = fmt(P[k]);
}
P.on(paint); M.on('screen:close', paint); setInterval(paint, 1000); paint();

/* ── chat global ── */
const online = at(el('div', 'hc-online'), 459, 699, 80), list = at(el('div', 'hc-msgs'), 42, 738, 504);
const input = at(el('input', 'hc-input', { type: 'text', maxLength: 120, placeholder: 'Digite sua mensagem...', autocomplete: 'off', enterKeyHint: 'send' }), 50, 845, 428);
input.setAttribute('aria-label', 'Mensagem do chat global');
const seen = new Set(); let status = null;
function setOnline(n) { online.textContent = (n == null ? 0 : n) + ' online'; }
setOnline(svc.mode === 'online' ? 1 : 0); svc.on('status', () => { if (svc.mode !== 'online') setOnline(0); });
svc.on('online', setOnline);
function add(m) {
  if (!m || seen.has(m.n)) return; seen.add(m.n);
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 30, row = el('div', 'hc-row');
  row.append(el('span', 'hc-lv', { textContent: Math.max(0, m.lv | 0) }), el('b', 'hc-nm', { textContent: String(m.name || 'Jogador').slice(0, 16) }), el('span', 'hc-tx', { textContent: String(m.text || '').slice(0, 120) }));
  list.append(row); while (list.children.length > 60) list.firstChild.remove();
  if (near || m.local || m.name === myName()) list.scrollTop = list.scrollHeight;
}
svc.on('chat', add);
function flash(txt) { clearTimeout(status); input.placeholder = txt; status = setTimeout(() => { input.placeholder = 'Digite sua mensagem...'; }, 2500); }
async function send() {
  const t = input.value.replace(/\s+/g, ' ').trim(); if (!t) return;
  input.value = '';
  try { await svc.sendChat(t, P.level, myName()); } catch (e) { input.value = t; flash(e.message); }
}
input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); send(); } });   // não deixa as teclas do jogo (WASD…) dispararem
input.addEventListener('keyup', e => e.stopPropagation());
M.on('chatsend', send);
})();
