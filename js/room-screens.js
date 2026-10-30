/* Telas do sistema de salas (só interface; toda a lógica está em SaiyanGame.rooms).
 * Fluxo: CONNECT/ROOM LIST/CODE/CREATE ROOM → LOBBY → SELECT MAP (host) → START GAME → game */
(() => {
'use strict';
const { MAPS, LIMITS, AutoService, RoomSystem, MapLoader, GameSession } = SL;
const S = SaiyanMenu.screens;
const service = new AutoService(), rooms = new RoomSystem(service, new MapLoader()), session = new GameSession(rooms);
window.SaiyanGame = { service, rooms, session };
rooms.me.character = SL.Profile.selected;
/* Usar o STREET sem passar pela loja (a seleção dele entra em outra etapa): abra com ?char=street (ou #char=street), ou chame
   SaiyanGame.useCharacter('street') antes de criar a sala. Não altera o perfil salvo nem o personagem escolhido na loja. */
SaiyanGame.useCharacter = id => { if (!SL.Characters.playable(id)) return false; rooms.me.character = id; return true; };
{ const m = /[?&#]char=(\w+)/.exec(location.search + location.hash); if (m) SaiyanGame.useCharacter(m[1]); }

const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const mapName = id => (MAPS.find(m => m.id === id) || {}).name || 'NOT SELECTED';
const head = (p, title, text) => { p.append(el('h2', '', { textContent: title })); if (text) p.append(el('p', '', { textContent: text })); };
const bar = (...b) => { const r = el('div', 'row'); r.append(...b); return r; };
const attempt = (box, promise) => promise.catch(e => { box.textContent = e.message; });
const back = () => S.btn('Back', () => S.close(), true);
const leave = () => rooms.leaveRoom().then(() => S.close());
const toLobby = box => p => attempt(box, p.then(() => S.open('lobby')));

function nameField(p) {
  const i = el('input', '', { value: rooms.me.name, maxLength: 16, placeholder: 'Your name' });
  i.setAttribute('aria-label', 'Your name'); i.addEventListener('input', () => rooms.setName(i.value)); p.append(i);
  if (SL.Auth && SL.Auth.user) { i.value = SL.Auth.user.name; i.readOnly = true; i.title = 'Apelido da sua conta'; }
}

/* Linha de estado da conexão: deixa claro se há servidor online ou se está no modo offline (salas só neste navegador). */
function connLine(p) {
  const l = p.appendChild(el('p', 'hint conn'));
  const upd = () => {
    if (service.mode === 'online') { l.textContent = '● ONLINE — ' + service.url.replace(/^wss?:\/\//, '').replace(/\/ws$/, ''); l.style.color = '#7dffb0'; }
    else { l.textContent = '○ OFFLINE — ' + (service.reason || 'conectando…') + ' As salas só existem neste navegador: outros jogadores NÃO as veem.'; l.style.color = '#ffb36b'; }
  };
  service.on('status', upd); upd(); return () => service.off('status', upd);
}

function roomTable(p, box) {
  const stopConn = connLine(p), wrap = p.appendChild(el('div', 'tblwrap')); let sel = null, alive = true;
  const pw = p.appendChild(el('input', '', { type: 'password', maxLength: 16, placeholder: 'Senha da sala (só se a sala tiver 🔒)', autocomplete: 'off' })); pw.setAttribute('aria-label', 'Senha da sala');
  const join = () => sel ? toLobby(box)(rooms.joinRoom(sel, pw.value)) : (box.textContent = 'Selecione uma sala primeiro.');
  const render = list => {
    if (!alive) return; if (!list.some(r => r.id === sel)) sel = null;
    const t = el('table', 'tbl'), tb = el('tbody');
    t.innerHTML = '<thead><tr><th>ROOM ID</th><th>ROOM NAME</th><th>MODE</th><th>HOST</th><th>PLAYERS</th><th>MAP</th><th>STATUS</th></tr></thead>';
    list.forEach(r => {
      const tr = el('tr', r.id === sel ? 'sel' : '', { tabIndex: 0 });
      [r.id, (r.locked ? '🔒 ' : '') + r.name, r.mode ? (SL.MODES[r.mode] || {}).name || r.mode : '—', r.host, r.players + '/' + r.max, mapName(r.map), r.full ? 'FULL' : r.state === 'IN_GAME' ? 'IN GAME' : 'OPEN'].forEach(v => tr.append(el('td', '', { textContent: v })));
      const pick = () => { sel = r.id; [...tb.children].forEach(x => x.classList.toggle('sel', x === tr)); };
      tr.onclick = pick; tr.ondblclick = join; tr.onkeydown = e => { if (e.key === 'Enter') { pick(); join(); } };
      tb.append(tr);
    });
    t.append(tb); wrap.replaceChildren(list.length ? t : el('p', 'empty', { textContent: 'Nenhuma sala disponível' }));
  };
  const load = async () => {
    try { if (service.mode === 'offline' && service.url) await service.reconnect(); box.textContent = ''; render(await rooms.listRooms()); } catch (e) { box.textContent = e.message; }
  };
  const off = rooms.onRooms(render);                // a lista se atualiza sozinha: sala criada, jogador entrou/saiu, sala destruída ou cheia
  load(); return { load, join, dispose: () => { alive = false; off(); stopConn(); } };
}

const listScreen = (title, text, withCreate) => ({ build(p) {
  p.classList.add('wide'); head(p, title, text); nameField(p);
  const box = el('div', 'msg'), t = roomTable(p, box); p.append(box);
  const b = [S.btn('JOIN ROOM', t.join)]; if (withCreate) b.push(S.btn('CREATE ROOM', () => S.open('createRoom')), S.btn('ENTRAR COM CÓDIGO', () => S.open('code'), true));
  p.append(bar(...b, S.btn('REFRESH', t.load, true), back())); return t.dispose;
} });
S.register('connect', listScreen('Rooms', 'Create a room or join an existing one.', true));
S.register('roomList', listScreen('Room list', 'Select a room and press JOIN ROOM.', false));

S.register('createRoom', { build(p) {
  head(p, 'Create room', 'A unique ROOM ID is generated automatically and you become the HOST.'); nameField(p);
  const stop = connLine(p), rn = el('input', '', { maxLength: 24, placeholder: 'Room name (optional)' }); rn.setAttribute('aria-label', 'Room name'); p.append(rn);
  const sel = el('select'); sel.setAttribute('aria-label', 'Max players');
  for (let n = 2; n <= LIMITS.maxPlayers; n++) sel.append(new Option('Max players: ' + n, n, n === LIMITS.maxPlayers, n === LIMITS.maxPlayers));
  const box = el('div', 'msg');
  p.append(sel, box, bar(S.btn('CREATE', () => toLobby(box)(rooms.createRoom({ maxPlayers: +sel.value, name: rn.value }))), back())); return stop;
} });

S.register('code', { build(p) {
  head(p, 'Enter room ID'); nameField(p);
  const i = el('input', '', { placeholder: 'ROOM ID', maxLength: 6, inputMode: 'numeric', autocomplete: 'off' }), box = el('div', 'msg'), pw = el('input', '', { type: 'password', maxLength: 16, placeholder: 'Senha (só se a sala tiver)', autocomplete: 'off' }); pw.setAttribute('aria-label', 'Senha da sala');
  i.setAttribute('aria-label', 'Room ID'); i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, ''); });
  const go = () => /^\d{6}$/.test(i.value) ? toLobby(box)(rooms.joinRoom(i.value, pw.value)) : (box.textContent = 'O ROOM ID tem 6 dígitos.');
  i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  p.append(i, pw, box, bar(S.btn('JOIN', go), back())); i.focus();
} });

S.register('lobby', { sticky: true, build(p) {
  const box = p.appendChild(el('div'));
  const draw = () => {
    const r = rooms.room; if (!r) return;
    const host = r.players.find(x => x.id === r.hostId), isHost = rooms.isHost, st = r.state, err = el('div', 'msg'), b = [];
    box.replaceChildren(el('h2', '', { textContent: 'SAIYAN LEGENDS ONLINE' }));
    const kv = el('div', 'kv');
    [['ROOM ID', r.id], ['ROOM', r.name || r.id], ['HOST', host.name], ['PLAYERS', r.players.length + ' / ' + r.maxPlayers], ['MAP', mapName(r.map)], ['STATUS', st]]
      .forEach(([k, v]) => kv.append(el('span', 'k', { textContent: k }), el('span', '', { textContent: v })));
    const ul = el('ul', 'plist');
    r.players.forEach(x => { const li = el('li'); li.append(SL.Characters.portrait(x.character, .5), el('span', '', { textContent: x.name + (x.id === r.hostId ? ' (HOST)' : '') + (x.id === rooms.me.id ? ' (you)' : '') })); ul.append(li); });
    if (isHost) {
      const pick = S.btn('SELECT MAP', () => attempt(err, rooms.openMapSelection().then(() => S.open('mapSelect'))));
      pick.disabled = !['WAITING', 'READY'].includes(st);
      const go = S.btn(st === 'FINISHED' ? 'NEW MATCH' : 'START GAME', () => attempt(err, st === 'FINISHED' ? rooms.resetRoom() : rooms.startGame()));
      go.disabled = st === 'FINISHED' ? false : !(st === 'READY' && r.players.length >= LIMITS.minToStart);
      b.push(pick, go, S.btn('+ BOT (test)', () => attempt(err, rooms.addBot()), true));
    }
    b.push(S.btn('LEAVE ROOM', leave, true));
    const hint = st === 'STARTING' ? (rooms.loadError ? 'Erro ao carregar o mapa: ' + rooms.loadError : 'Loading map…') : !isHost ? 'Waiting for the host…' : st === 'READY' ? 'Ready to start.' : 'Select a map to enable START GAME.';
    box.append(kv, ul, el('p', 'hint', { textContent: hint }), err, bar(...b));
  };
  const on = r => { if (r.state === 'IN_GAME') S.open('game'); else draw(); }, closed = () => S.close();
  rooms.on('room:update', on); rooms.on('room:closed', closed); rooms.on('load:error', draw); draw();
  if (rooms.room && rooms.room.state === 'IN_GAME') setTimeout(() => { if (S.id === 'lobby' && rooms.room && rooms.room.state === 'IN_GAME') S.open('game'); }, 0);   // entrou/voltou com a partida em andamento
  return () => { rooms.off('room:update', on); rooms.off('room:closed', closed); rooms.off('load:error', draw); };
} });

S.register('mapSelect', { sticky: true, build(p) {
  head(p, 'SELECT MAP'); const g = el('div', 'maps'), err = el('div', 'msg');
  MAPS.forEach(m => g.append(S.btn(m.name, () => attempt(err, rooms.setMap(m.id).then(() => S.open('lobby'))))));
  p.append(g, err, bar(S.btn('Cancel', () => attempt(err, rooms.cancelMapSelection().then(() => S.open('lobby'))), true)));
} });

/* Mapas ainda sem arte/máscara: campo simples com os jogadores. */
function fieldScreen(p) {
  p.classList.add('wide'); const box = p.appendChild(el('div'));
  const draw = () => {
    const r = rooms.room; if (!r) return; const live = r.state === 'IN_GAME', err = el('div', 'msg'), b = [];
    box.replaceChildren(el('h2', '', { textContent: live ? 'MAP: ' + mapName(r.map) : 'MATCH FINISHED' }));
    if (live) {
      const f = el('div', 'field');
      session.entities.forEach(e => { const d = el('span', 'dot' + (e.player.id === rooms.me.id ? ' me' : ''), { textContent: e.player.name }); d.style.left = e.x + '%'; d.style.top = e.y + '%'; f.append(d); });
      box.append(f, el('p', 'hint', { textContent: 'Players in map: ' + session.entities.length }));
      if (rooms.isHost) b.push(S.btn('END MATCH', () => attempt(err, rooms.finishGame())));
    } else b.push(S.btn('BACK TO LOBBY', () => S.open('lobby')));
    box.append(err, bar(...b, S.btn('LEAVE ROOM', leave, true)));
  };
  const closed = () => S.close();
  rooms.on('room:update', draw); rooms.on('room:closed', closed); draw();
  return () => { rooms.off('room:update', draw); rooms.off('room:closed', closed); };
}

/* Mapa com arte + máscara: cena 2D com colisão. Controles: ← → / A D andar, ↑ / W / Espaço pular, ↓ / S defender, J soco, K poder, F voar, F3 debug. */
function stageScreen(p, loaded) {
  p.classList.add('stage');
  const cv = el('canvas'), hud = el('div', 'hud'); p.append(cv, hud);
  const scene = new SL.GameScene(cv, loaded, rooms.room.players, rooms.me.id, { authority: () => rooms.isHost, net: { send: d => rooms.send(d) } }); scene.attachControls(p);   // multiplayer: posições/golpes vão pelo servidor
  /* Um único botão ⚙ no topo; tudo o mais (som, controles, debug, encerrar, sair) fica dentro do menu dele */
  const gear = el('button', 'pbtn ghost gear', { type: 'button', textContent: '⚙', title: 'Menu', ariaLabel: 'Menu da partida' }), menu = el('div', 'gmenu'), list = el('div', 'gbtns'),
    who = el('div', 'ginfo'), closeMenu = () => menu.classList.remove('open'), item = (label, fn, ghost = true) => S.btn(label, e => { e.currentTarget.blur(); fn(e); }, ghost);
  const endBtn = item('END MATCH', () => { closeMenu(); rooms.finishGame().catch(() => {}); }, false);
  list.append(item('CONTROLES', () => { closeMenu(); scene.toggleEdit(); }), item('DEBUG (F3)', () => { closeMenu(); scene.toggleDebug(); }), endBtn, item('LEAVE ROOM', () => { closeMenu(); leave(); }), item('FECHAR', closeMenu));
  const plist = el('div', 'gplayers'), vrow = el('label', 'gvol'), vol = el('input', '', { type: 'range', min: 0, max: 100, step: 1 }), vval = el('em'), AU = window.SaiyanAudio;
  if (AU) { const sync = () => { vol.value = Math.round(AU.state.volume * 100); vval.textContent = AU.state.muted ? 'mudo' : vol.value + '%'; }; vol.addEventListener('input', () => { AU.setVolume(vol.value / 100); if (AU.state.muted && vol.value > 0) AU.setMuted(false); }); AU.on('change', sync); sync(); vrow.append(el('span', '', { textContent: 'Volume' }), vol, vval); }
  menu.append(el('div', 'ginfo', { textContent: 'MAP: ' + mapName(rooms.room.map) }), who, plist, vrow, list); p.append(menu); hud.append(gear);
  gear.onclick = e => { e.currentTarget.blur(); menu.classList.toggle('open'); };
  const outside = e => { if (menu.classList.contains('open') && !menu.contains(e.target) && e.target !== gear) closeMenu(); }; document.addEventListener('pointerdown', outside, true);
  const upd = r => { if (r.state !== 'IN_GAME') return S.open('lobby'); scene.syncRoster(r.players); endBtn.style.display = rooms.isHost ? '' : 'none'; who.textContent = rooms.room.name + ' · Jogadores ' + r.players.length + '/' + r.maxPlayers; plist.textContent = r.players.map(x => (x.name || '?') + (x.id === r.hostId ? ' ★' : '') + (x.bot ? ' (bot)' : '')).join(' · '); };   // host pode mudar (criador saiu)
  const closed = () => S.close(), data = e => scene.onNet(e.from, e.data);
  rooms.on('room:update', upd); rooms.on('room:closed', closed); rooms.on('net:data', data); upd(rooms.room);
  return () => { scene.destroy(); rooms.off('room:update', upd); rooms.off('room:closed', closed); rooms.off('net:data', data); document.removeEventListener('pointerdown', outside, true); };
}

S.register('game', { sticky: true, noFocus: true, build(p) {
  const loaded = rooms.loader.cache[rooms.room.map];
  return loaded && loaded.mask ? stageScreen(p, loaded) : fieldScreen(p);
} });

/* Loja: seção CHARACTERS. O STREET vem desbloqueado, disponível e selecionado; BUY só aparece para personagens bloqueados. */
const SHOWCASE = [['IDLE', 'idle', 1], ['SHIELD', 'shield', 1.2], ['RUN', 'run', 1.2], ['JUMP', 'jump', .8], ['FLY', 'fly', .8], ['ATTACK', 'attack', .9], ['CHARGE', 'charge', 1.2], ['ENERGY ATTACK', 'energy', .9]];
S.register('store', { build(p) {
  p.classList.add('wide'); head(p, 'Store'); p.append(el('h3', 'sec', { textContent: 'CHARACTERS' }));
  const list = el('div', 'cards'); p.append(list); let previews = [];
  const draw = () => {
    list.replaceChildren(); previews = [];
    for (const id of Object.keys(SL.Characters.all)) {
      const c = SL.Characters.all[id], unlocked = SL.Profile.isUnlocked(id), sel = SL.Profile.selected === id;
      const cv = el('canvas', 'pv', { width: 120, height: 90 }), info = el('div', 'info');
      info.append(el('div', 'nm', { textContent: c.name }), el('div', 'ck', { innerHTML: unlocked ? '✓ UNLOCKED<br>✓ AVAILABLE' + (sel ? '<br>✓ SELECTED' : '') : 'LOCKED' }));
      const btn = S.btn(sel ? 'SELECTED' : unlocked ? 'SELECT' : 'BUY ' + c.price, () => { if (SL.Profile.select(id)) { rooms.me.character = id; draw(); } });
      btn.disabled = sel || !unlocked; info.append(btn);
      const card = el('div', 'card' + (sel ? ' sel' : '')); card.append(SL.Characters.portrait(id, 3), cv, info); list.append(card); previews.push({ id, cv });
    }
  };
  draw(); p.append(bar(back()));
  const t0 = performance.now(); let raf = 0;
  const loop = now => {
    let t = Math.max(0, (now - t0) / 1000); const total = SHOWCASE.reduce((a, s) => a + s[2], 0); t %= total; let seg = SHOWCASE[0];
    for (const s of SHOWCASE) { if (t < s[2]) { seg = s; break; } t -= s[2]; }
    for (const { id, cv } of previews) { const c = SL.Characters.get(id), x = cv.getContext('2d'); x.clearRect(0, 0, 120, 90); /* reduz quadros grandes (aura) para caber */ const fi = SL.frameAt(c, seg[1], t), s = Math.min(1, 72 / (c.frames[fi].ay + 2)); x.save(); x.translate(60, 82); x.scale(s, s); SL.drawFrame(x, c.img, c, fi, 0, 0, 1); x.restore(); x.font = '10px system-ui'; x.fillStyle = '#e4d3fb'; x.fillText(seg[0], 4, 12); }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
} });

/* Atalho de teste: abre o jogo com #collision (segue o fluxo: sala → mapa → START GAME → carrega o mapa). */
if (location.hash === '#collision') rooms.createRoom().then(() => rooms.openMapSelection()).then(() => rooms.setMap('forest')).then(() => rooms.startGame()).then(() => S.open('lobby')).catch(console.error);

/* Recarregou a página no meio de uma sala? O servidor guarda a vaga por alguns segundos: volta para a mesma sala/partida. */
rooms.resume().then(r => { if (r) S.open('lobby'); }).catch(() => {});
})();
