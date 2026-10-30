/* CRIAR SALA — fluxo de 4 telas (arte roxa/dourada, em coordenadas 1672×941 como a loja):
 *   createRoom  → escolha do MODO (PVP · BOTS · 2v2 · CUSTOM)
 *   createMap   → escolha do MAPA (só existem mapas com arte no jogo: hoje, FLORESTA = SL.MAPS / SL.MAP_DATA)
 *   createConfig→ nome, senha (opcional), jogadores (limites do modo), resumo, CRIAR SALA (validado)
 *   lobby       → SALA CRIADA / aguardando jogadores (salas com modo). Salas antigas (sem modo) continuam no lobby antigo.
 * A lógica de salas é a de sempre (SaiyanGame.rooms): servidor online quando houver; senão modo offline (aviso na tela).
 * A partida NUNCA começa sozinha: só o anfitrião inicia, e só quando o modo permite (mínimo de jogadores). */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, G = () => window.SaiyanGame, rooms = () => G().rooms, service = () => G().service;
const { MODES, MAPS, LIMITS } = SL, ART = { w: 1672, h: 941, src: 'assets/ui/room-bg.jpg' };
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const MODE_ORDER = ['pvp', 'bots', '2v2', 'custom'];
/* Mapas disponíveis na interface = só os que têm arte e colisão no projeto (SL.MAP_DATA). Textos/prévia por mapa: */
const MAP_INFO = { forest: { name: 'FLORESTA', desc: 'Um mapa clássico, com muitas árvores e plataformas.', img: 'assets/maps/forest.png', pos: '9% 50%' } };
const maps = () => MAPS.filter(m => SL.MAP_DATA && SL.MAP_DATA[m.id] && MAP_INFO[m.id]);

/* Rascunho da sala em criação (vale só durante o fluxo; ao abrir CREATE ROOM do menu ele recomeça) */
let draft = null;
const fresh = () => { draft = { mode: 'pvp', map: maps()[0] && maps()[0].id, name: '', password: '', max: 2 }; };
const modeMax = id => MODES[id].max, modeMin = id => MODES[id].min;
const clampMax = () => { draft.max = Math.min(Math.max(draft.max, modeMin(draft.mode)), modeMax(draft.mode)); };

/* ── ícones (SVG, viewBox 100×100) ── */
const ICON = {
  pvp: '<g fill="none" stroke="#f1e6ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 14l30 40M78 14L48 54"/><path d="M14 22l-2-10 10 2M86 22l2-10-10 2" /><path d="M40 52l-14 14M60 52l14 14M24 62l14 14M76 62L62 76"/><path d="M20 80l8-8M80 80l-8-8"/></g><g fill="#f1e6ff"><circle cx="19" cy="83" r="5"/><circle cx="81" cy="83" r="5"/></g>',
  bots: '<g fill="#f1e6ff"><rect x="22" y="30" width="56" height="44" rx="10"/><rect x="45" y="16" width="10" height="16"/><circle cx="50" cy="13" r="6"/><rect x="12" y="44" width="10" height="18" rx="4"/><rect x="78" y="44" width="10" height="18" rx="4"/></g><g fill="#5a1db0"><circle cx="38" cy="50" r="7"/><circle cx="62" cy="50" r="7"/><rect x="36" y="63" width="28" height="5" rx="2"/></g>',
  '2v2': '<g fill="#f1e6ff"><circle cx="50" cy="26" r="13"/><path d="M26 72c0-18 10-28 24-28s24 10 24 28z"/><circle cx="22" cy="40" r="9"/><path d="M4 74c0-13 7-21 18-21 4 0 7 1 9 3-6 5-9 11-10 18z"/><circle cx="78" cy="40" r="9"/><path d="M96 74c0-13-7-21-18-21-4 0-7 1-9 3 6 5 9 11 10 18z"/></g>',
  custom: '<g fill="#f1e6ff"><rect x="24" y="10" width="7" height="82" rx="3"/><path d="M31 14h46l-12 17 12 17H31z"/></g><g fill="#5a1db0"><path d="M38 24h26l-6 7 6 7H38z" opacity=".35"/></g>',
  user: '<circle cx="50" cy="32" r="18"/><path d="M14 92c0-24 14-38 36-38s36 14 36 38z"/>',
  lock: '<path d="M30 44V32a20 20 0 0 1 40 0v12" fill="none" stroke="currentColor" stroke-width="9"/><rect x="18" y="44" width="64" height="48" rx="8"/>',
  sword2: '<g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"><path d="M18 18l46 46M82 18L36 64M14 86l16-16M86 86L70 70"/></g>',
  book: '<path d="M10 24l40 8 40-8v58l-40 8-40-8z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><path d="M50 32v58" stroke="currentColor" stroke-width="8"/>',
  group: '<circle cx="50" cy="28" r="13"/><path d="M26 76c0-18 10-28 24-28s24 10 24 28z"/><circle cx="20" cy="42" r="8"/><circle cx="80" cy="42" r="8"/>'
};
const svg = (name, cls = '', vb = '0 0 100 100') => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${ICON[name]}</svg>`;

/* ── blocos reutilizáveis ── */
function press(n, fn) {   // efeito de clique + ação (mouse, toque e teclado)
  const on = v => () => n.classList.toggle('is-pressed', v);
  n.addEventListener('pointerdown', on(true)); ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(t => n.addEventListener(t, on(false)));
  n.addEventListener('click', e => { e.preventDefault(); if (n.disabled || n.getAttribute('aria-disabled') === 'true') return; setTimeout(() => fn(e), 90); });
  return n;
}
const gbtn = (label, kind, fn, x, y, w, h) => {   // botão hexagonal dourado: kind = purple | green | red
  const b = el('button', 'rm-btn ' + kind, { type: 'button' }); b.append(el('span', 'rm-btn-t', { textContent: label }));
  Object.assign(b.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); return press(b, fn);
};
const title = (art, text, sub) => {
  const t = el('div', 'rm-title'); t.append(el('span', '', { textContent: text })); art.append(t);
  if (sub) { const s = el('div', 'rm-sub'); s.append(el('span', '', { textContent: sub })); art.append(s); }
};
const backBtn = (art, fn) => { const b = el('button', 'rm-back', { type: 'button', ariaLabel: 'Voltar', title: 'Voltar', innerHTML: '<svg viewBox="0 0 100 100"><path d="M60 22L30 50l30 28M32 50h46" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>' }); art.append(b); return press(b, fn); };
const pos = (n, x, y, w, h) => { Object.assign(n.style, { left: x + 'px', top: y + 'px' }); if (w) n.style.width = w + 'px'; if (h) n.style.height = h + 'px'; return n; };

/* Tela cheia 1672×941 escalada para caber (sem cortar), com fundo desfocado preenchendo o resto */
function shell(p, cls, onEsc) {
  p.classList.add('rmwrap');
  const fill = el('img', 'shop-fill', { src: ART.src, alt: '', draggable: false }), art = el('div', 'rmart ' + cls);
  art.append(el('img', 'rm-bg', { src: ART.src, alt: '', draggable: false }), el('div', 'rm-shade'));
  p.append(fill, art);
  const fit = () => { const W = p.clientWidth, H = p.clientHeight; if (!W || !H) return; const k = Math.min(W / ART.w, H / ART.h); art.style.transform = `translate(${(W - ART.w * k) / 2}px,${(H - ART.h * k) / 2}px) scale(${k})`; };
  const ro = new ResizeObserver(fit); ro.observe(p); fit();
  const key = e => { if (e.key === 'Escape' && onEsc) { e.preventDefault(); onEsc(); } }; addEventListener('keydown', key);
  p.dataset.ready = '1';
  return { art, dispose: () => { ro.disconnect(); removeEventListener('keydown', key); } };
}
const card = (cls = '') => el('div', 'rm-card ' + cls);
const MAPBG = id => `url(${MAP_INFO[id].img})`;

/* ═════════ 1 · MODO ═════════ */
S.register('createRoom', { title: 'Criar sala', sticky: true, noFocus: true, build(p) {
  if (rooms().room) { setTimeout(() => S.open('lobby'), 0); return; }   // já está em uma sala: vai para ela em vez de criar outra
  if (!draft || !draft.keep) fresh(); draft.keep = false;
  const out = () => S.close(), sh = shell(p, 'rm-mode', out), art = sh.art;
  title(art, 'CRIAR SALA', 'ESCOLHA O MODO DE JOGO'); backBtn(art, out);
  const xs = [103, 476, 851, 1227], cards = [];
  MODE_ORDER.forEach((id, i) => {
    const m = MODES[id], c = el('button', 'rm-card rm-mode-card', { type: 'button', role: 'radio' }); pos(c, xs[i], 371, 345, 421);
    c.setAttribute('aria-label', m.name + ': ' + m.desc.toLowerCase());
    c.innerHTML = `${svg(id, 'rm-mode-ico')}<div class="rm-plate"><span>${m.name}</span></div><div class="rm-mode-desc">${m.desc}</div>`;
    press(c, () => { draft.mode = id; clampMax(); paint(); }); c.addEventListener('dblclick', next); cards.push(c); art.append(c);
  });
  const note = el('div', 'rm-note'); pos(note, 103, 800, 1464); art.append(note);
  function paint() {
    cards.forEach((c, i) => { const on = MODE_ORDER[i] === draft.mode; c.classList.toggle('on', on); c.setAttribute('aria-checked', on); });
    const m = MODES[draft.mode]; note.textContent = m.blocked ? '⚠ ' + m.blocked : m.bots ? 'A sala é preenchida com bots; outros jogadores podem entrar no lugar deles.' : ''; note.classList.toggle('bad', !!m.blocked);
  }
  function next() { draft.keep = true; S.open('createMap'); }
  art.append(gbtn('PRÓXIMO', 'purple', next, 686, 830, 300, 88));
  paint();
  const arrows = e => { const i = MODE_ORDER.indexOf(draft.mode); if (e.key === 'ArrowRight') { draft.mode = MODE_ORDER[(i + 1) % 4]; clampMax(); paint(); } else if (e.key === 'ArrowLeft') { draft.mode = MODE_ORDER[(i + 3) % 4]; clampMax(); paint(); } else if (e.key === 'Enter' && !e.target.closest('.rm-card,.rm-btn,.rm-back')) next(); };
  addEventListener('keydown', arrows);
  return () => { sh.dispose(); removeEventListener('keydown', arrows); };
} });

/* ═════════ 2 · MAPA ═════════ */
S.register('createMap', { title: 'Escolha o mapa', sticky: true, noFocus: true, build(p) {
  if (!draft) fresh();
  const back = () => { draft.keep = true; S.open('createRoom'); }, sh = shell(p, 'rm-map', back), art = sh.art;
  title(art, 'CRIAR SALA', 'ESCOLHA O MAPA'); backBtn(art, back);
  const big = card('rm-big'); pos(big, 61, 255, 1135, 629); art.append(big);
  const list = maps(), tiles = [];
  const xs = [120, 520, 920], ys = [330, 625];
  list.forEach((m, i) => {
    const info = MAP_INFO[m.id], t = el('button', 'rm-card rm-map-card', { type: 'button', role: 'radio' }); pos(t, xs[i % 3], ys[Math.floor(i / 3)], 317, 250);
    t.setAttribute('aria-label', 'Mapa ' + info.name);
    t.innerHTML = `<div class="rm-thumb" style="background-image:${MAPBG(m.id)};background-position:${info.pos}"></div><div class="rm-plate small"><span>${info.name}</span></div>`;
    press(t, () => { draft.map = m.id; paint(); }); tiles.push([m.id, t]); art.append(t);
  });
  if (!list.length) art.append(pos(el('div', 'rm-note', { textContent: 'Nenhum mapa disponível.' }), 120, 400, 900));
  const more = el('div', 'rm-note left', { textContent: 'Mais mapas serão adicionados em breve.' }); pos(more, 120, 840, 1000); art.append(more);
  const side = card('rm-side'); pos(side, 1229, 273, 338, 400); art.append(side);
  const pv = el('div', 'rm-thumb big'), pn = el('div', 'rm-plate small'), pd = el('div', 'rm-side-desc'); side.append(pv, pn, pd);
  const go = gbtn('PRÓXIMO', 'purple', () => { if (draft.map) { draft.keep = true; S.open('createConfig'); } }, 1229, 716, 338, 124); art.append(go);
  function paint() {
    tiles.forEach(([id, t]) => { const on = id === draft.map; t.classList.toggle('on', on); t.setAttribute('aria-checked', on); });
    const info = MAP_INFO[draft.map]; side.classList.toggle('empty', !info); go.disabled = !info; go.classList.toggle('dis', !info);
    pn.innerHTML = info ? `<span>${info.name}</span>` : ''; pd.textContent = info ? info.desc : 'Selecione um mapa.';
    pv.style.backgroundImage = info ? MAPBG(draft.map) : 'none'; if (info) pv.style.backgroundPosition = info.pos;
  }
  paint();
  return () => sh.dispose();
} });

/* ═════════ 3 · CONFIGURAÇÕES ═════════ */
const NAME_RE = /^[\p{L}\p{N} _.!\-]+$/u;
function validate(d) {
  const e = {}, n = d.name.trim().replace(/\s+/g, ' ');
  if (!n) e.name = 'Digite o nome da sala.'; else if (n.length < 3) e.name = 'O nome precisa ter pelo menos 3 caracteres.'; else if (n.length > 24) e.name = 'O nome pode ter no máximo 24 caracteres.'; else if (!NAME_RE.test(n)) e.name = 'Use só letras, números, espaço e _ . ! -';
  if (d.password && (d.password.length < 3 || d.password.length > 16)) e.password = 'A senha deve ter de 3 a 16 caracteres (ou deixe em branco).'; else if (/\s/.test(d.password)) e.password = 'A senha não pode ter espaços.';
  if (!MODES[d.mode]) e.mode = 'Escolha um modo.'; else if (d.max < modeMin(d.mode) || d.max > modeMax(d.mode)) e.max = 'Este modo aceita de ' + modeMin(d.mode) + ' a ' + modeMax(d.mode) + ' jogadores.';
  if (!d.map || !maps().some(m => m.id === d.map)) e.map = 'Escolha um mapa.';
  return e;
}
S.register('createConfig', { title: 'Configurações da sala', sticky: true, noFocus: true, build(p) {
  if (!draft) fresh(); clampMax();
  const back = () => { draft.keep = true; S.open('createMap'); }, sh = shell(p, 'rm-cfg', back), art = sh.art;
  title(art, 'CRIAR SALA', 'CONFIGURAÇÕES DA SALA'); backBtn(art, back);
  const frame = card('rm-big'); pos(frame, 135, 255, 1400, 500); art.append(frame);
  const left = el('div', 'rm-pane'); pos(left, 170, 275, 700, 470); const right = card('rm-pane rm-sum'); pos(right, 905, 285, 600, 440); art.append(left, right);
  const field = (icon, label, opt, input, errKey) => { const w = el('div', 'rm-field'); w.append(el('div', 'rm-label', { innerHTML: svg(icon, 'rm-li') + `<span>${label}</span>` + (opt ? `<em>${opt}</em>` : '') }), input, el('div', 'rm-err', { id: 'err-' + errKey })); return w; };
  const nameI = el('input', 'rm-input', { type: 'text', maxLength: 24, placeholder: 'Digite o nome da sala...', value: draft.name, autocomplete: 'off', spellcheck: false });
  const pwI = el('input', 'rm-input', { type: 'password', maxLength: 16, placeholder: 'Digite a senha...', value: draft.password, autocomplete: 'new-password' });
  nameI.setAttribute('aria-label', 'Nome da sala'); pwI.setAttribute('aria-label', 'Senha da sala (opcional)');
  const st = el('div', 'rm-step'), minus = el('button', 'rm-arrow', { type: 'button', ariaLabel: 'Menos jogadores', textContent: '◀' }), plus = el('button', 'rm-arrow', { type: 'button', ariaLabel: 'Mais jogadores', textContent: '▶' }), num = el('div', 'rm-num', { role: 'status' });
  st.append(minus, num, plus);
  left.append(field('user', 'NOME DA SALA', '', nameI, 'name'), field('lock', 'SENHA', '(OPCIONAL)', pwI, 'password'), field('group', 'QUANTIDADE DE PLAYERS', '', st, 'max'));
  /* resumo */
  const thumb = el('div', 'rm-thumb sum'), cells = el('div', 'rm-cells'); right.append(thumb, cells);
  const cell = (ico, k) => { const c = el('div', 'rm-cell'); c.innerHTML = `${svg(ico, 'rm-ci')}<div><b>${k}</b><span></span></div>`; cells.append(c); return c.querySelector('span'); };
  const sMode = cell('sword2', 'MODO:'), sMap = cell('book', 'MAPA:'), sPl = cell('group', 'PLAYERS:'), sPw = cell('lock', 'SENHA:');
  const msg = el('div', 'rm-msg'); pos(msg, 135, 760, 1400); art.append(msg);
  const conn = el('div', 'rm-conn'); pos(conn, 135, 908, 1400); art.append(conn);
  const setErr = (k, t) => { const n = art.querySelector('#err-' + k); if (n) n.textContent = t || ''; };
  const sync = () => {
    draft.name = nameI.value; draft.password = pwI.value; const m = MODES[draft.mode];
    sMode.textContent = m.name; sMap.textContent = (MAP_INFO[draft.map] || {}).name || '—'; sPl.textContent = draft.max; sPw.textContent = draft.password ? 'SIM' : 'NÃO';
    num.textContent = draft.max; minus.disabled = draft.max <= modeMin(draft.mode); plus.disabled = draft.max >= modeMax(draft.mode);
    st.classList.toggle('fixed', modeMin(draft.mode) === modeMax(draft.mode)); if (MAP_INFO[draft.map]) { thumb.style.backgroundImage = MAPBG(draft.map); thumb.style.backgroundPosition = MAP_INFO[draft.map].pos; }
    st.title = modeMin(draft.mode) === modeMax(draft.mode) ? 'O modo ' + m.name + ' tem número fixo de jogadores.' : 'Aceita de ' + modeMin(draft.mode) + ' a ' + modeMax(draft.mode) + ' jogadores.';
  };
  press(minus, () => { draft.max--; clampMax(); sync(); }); press(plus, () => { draft.max++; clampMax(); sync(); });
  [nameI, pwI].forEach(i => { i.addEventListener('input', () => { sync(); setErr(i === nameI ? 'name' : 'password', ''); msg.textContent = ''; }); });
  let busy = false;
  const create = async () => {
    if (busy) return; sync(); const e = validate(draft); ['name', 'password', 'max'].forEach(k => setErr(k, e[k])); msg.textContent = '';
    if (e.name || e.password || e.max || e.mode || e.map) { msg.textContent = e.mode || e.map || 'Corrija os campos marcados para criar a sala.'; (e.name ? nameI : e.password ? pwI : nameI).focus(); return; }
    busy = true; createBtn.classList.add('dis'); msg.textContent = 'Criando sala…'; msg.classList.remove('bad');
    try {
      await rooms().createRoom({ name: draft.name.trim().replace(/\s+/g, ' '), maxPlayers: draft.max, mode: draft.mode, map: draft.map, password: draft.password });
      draft = null; S.open('lobby');
    } catch (err) { msg.textContent = err.message || 'Não foi possível criar a sala.'; msg.classList.add('bad'); busy = false; createBtn.classList.remove('dis'); }
  };
  const createBtn = gbtn('CRIAR SALA', 'green', create, 862, 800, 623, 100); art.append(createBtn, gbtn('VOLTAR', 'purple', back, 175, 800, 360, 100));
  [nameI, pwI].forEach(i => i.addEventListener('keydown', ev => { if (ev.key === 'Enter') create(); }));
  const showConn = () => { const on = service().mode === 'online'; conn.className = 'rm-conn ' + (on ? 'on' : 'off'); conn.textContent = on ? '● ONLINE — outros jogadores podem ver e entrar na sala' : '○ OFFLINE — ' + (service().reason || 'conectando…') + ' A sala só existirá neste navegador: outros jogadores NÃO a verão.'; };
  service().on('status', showConn); showConn(); sync();
  return () => { sh.dispose(); service().off('status', showConn); };
} });

/* ═════════ 4 · SALA CRIADA / AGUARDANDO ═════════ */
const oldLobby = S.defs.lobby;
S.register('lobby', { sticky: true, build(p, mgr) {
  const r0 = rooms().room;
  if (r0 && !r0.mode && oldLobby) return oldLobby.build(p, mgr);   // sala sem modo (criada por outro cliente antigo): lobby antigo
  const leave = () => rooms().leaveRoom().catch(() => {}).then(() => S.close()), sh = shell(p, 'rm-wait', leave), art = sh.art;
  const tt = el('div', 'rm-title'), chips = el('div', 'rm-chips'), wp = card('rm-wait-panel'), codeL = el('div', 'rm-code'), info = el('div', 'rm-note'), btns = el('div', 'rm-wbtns');
  const col = el('div', 'rm-wcol'); col.append(wp, codeL, info, btns); art.append(tt, chips, col); tt.append(el('span')); backBtn(art, leave);
  const created = r0 && r0.hostId === rooms().me.id && ['WAITING', 'READY'].includes(r0.state);
  const chip = (ico, k, v) => { const c = el('div', 'rm-chip'); c.innerHTML = `${svg(ico, 'rm-ci')}<div><b>${k}</b><span></span></div>`; c.querySelector('span').textContent = v; return c; };
  const draw = () => {
    const r = rooms().room; if (!r) return; const md = MODES[r.mode] || {}, host = r.hostId === rooms().me.id, st = r.state;
    tt.firstChild.textContent = created && ['WAITING', 'READY'].includes(st) ? 'SALA CRIADA!' : st === 'STARTING' ? 'CARREGANDO…' : 'SALA';
    chips.replaceChildren(chip('sword2', r.locked ? 'NOME DA SALA 🔒' : 'NOME DA SALA', r.name), chip('book', 'MAPA', (MAP_INFO[r.map] || {}).name || (r.map ? String(r.map).toUpperCase() : 'NÃO ESCOLHIDO')), chip('sword2', 'MODO', md.name || '—'));
    const n = r.players.length, many = r.maxPlayers > 3;
    wp.className = 'rm-card rm-wait-panel' + (many ? ' many' : '');
    wp.replaceChildren(el('div', 'rm-wait-h', { textContent: (st === 'IN_GAME' ? 'PARTIDA EM ANDAMENTO' : st === 'FINISHED' ? 'PARTIDA ENCERRADA' : 'AGUARDANDO JOGADORES...') + '  ' + n + '/' + r.maxPlayers }));
    const row = el('div', 'rm-slots');
    for (let i = 0; i < r.maxPlayers; i++) {
      const pl = r.players[i], s = el('div', 'rm-slot' + (pl ? ' full' : '') + (pl && pl.id === r.hostId ? ' host' : '') + (pl && pl.id === rooms().me.id ? ' me' : ''));
      if (pl) { s.innerHTML = (pl.id === r.hostId ? '<i class="rm-crown" title="Anfitrião">★</i>' : '') + svg(pl.bot ? 'bots' : 'user', 'rm-slot-ico'); const nm = el('div', 'rm-slot-n'); nm.textContent = pl.name + (pl.bot ? ' (bot)' : ''); const tg = el('div', 'rm-slot-tag', { textContent: pl.id === r.hostId ? 'ANFITRIÃO' : pl.id === rooms().me.id ? 'VOCÊ' : pl.bot ? 'BOT' : 'JOGADOR' }); s.append(nm, tg); }
      else { s.innerHTML = svg('user', 'rm-slot-ico') + '<div class="rm-slot-n">VAGA</div>'; }
      row.append(s);
    }
    wp.append(row);
    codeL.textContent = 'CÓDIGO DA SALA: ' + r.id + (r.locked ? '   ·   COM SENHA' : '');
    /* condições para iniciar (a lógica de verdade é validada de novo no servidor/serviço) */
    const need = r.minPlayers || LIMITS.minToStart; let why = '';
    if (md.blocked) why = md.blocked; else if (st === 'STARTING') why = rooms().loadError ? 'Erro ao carregar o mapa: ' + rooms().loadError : 'Carregando o mapa…'; else if (!r.map) why = 'Nenhum mapa escolhido.'; else if (n < need) why = 'Aguardando jogadores: mínimo de ' + need + ' para iniciar (' + n + '/' + need + ').'; else if (!host) why = 'Aguardando o anfitrião iniciar a partida…'; else why = 'Pronto! Toque em INICIAR PARTIDA.';
    info.textContent = why; info.classList.toggle('bad', !!md.blocked);
    btns.replaceChildren(); const err = el('div', 'rm-msg bad'); btns.append(err);
    const bx = [];
    if (host) {
      const finished = st === 'FINISHED', can = finished || (st === 'READY' && n >= need && !md.blocked);
      const go = gbtn(finished ? 'NOVA PARTIDA' : 'INICIAR PARTIDA', 'green', () => { err.textContent = ''; (finished ? rooms().resetRoom() : rooms().startGame()).catch(e => { err.textContent = e.message; }); }, 0, 0, 540, 88); go.classList.toggle('dis', !can); go.setAttribute('aria-disabled', !can);
      bx.push(go);
      if (md.id === 'custom' && ['WAITING', 'READY'].includes(st) && n < r.maxPlayers) bx.push(gbtn('+ BOT', 'purple', () => rooms().addBot().catch(e => { err.textContent = e.message; }), 0, 0, 260, 88));
    }
    bx.push(gbtn(host ? 'CANCELAR' : 'SAIR', 'red', leave, 0, 0, 360, 88));
    bx.forEach(b => { b.classList.add('flow'); btns.append(b); });
  };
  const on = r => { if (r.state === 'IN_GAME') S.open('game'); else draw(); }, closed = () => S.close();
  const lerr = () => draw();
  rooms().on('room:update', on); rooms().on('room:closed', closed); rooms().on('load:error', lerr); draw();
  if (rooms().room && rooms().room.state === 'IN_GAME') setTimeout(() => { if (S.id === 'lobby' && rooms().room && rooms().room.state === 'IN_GAME') S.open('game'); }, 0);
  return () => { sh.dispose(); rooms().off('room:update', on); rooms().off('room:closed', closed); rooms().off('load:error', lerr); };
} });
})();
