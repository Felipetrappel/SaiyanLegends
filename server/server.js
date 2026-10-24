/* Saiyan Legends Online — servidor de salas multiplayer.
 *
 * Sem dependências: só o Node (>= 18). O WebSocket (RFC 6455) é implementado aqui mesmo, e o servidor
 * também entrega os arquivos do jogo, então UMA porta serve tudo:   node server/server.js   →  http://localhost:8080
 *
 *   PORT=8080          porta
 *   GRACE_MS=20000     tempo que um jogador desconectado ainda "segura" o lugar na sala (recarregar a página não destrói a sala)
 *   PING_MS=5000       intervalo do heartbeat (conexão muda por 2 intervalos = desconectada)
 *   ORIGINS=a.com,b.com   (opcional) só aceita WebSocket vindo dessas origens; vazio = qualquer uma
 *   STATIC=0           não entrega os arquivos do jogo (só o WebSocket em /ws)
 *
 * O servidor é a ÚNICA fonte da verdade das salas: criação, entrada, saída, host, estado, limite e destruição.
 * Durante a partida ele só retransmite (relay) as mensagens de um jogador para os outros da mesma sala.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8080, GRACE_MS = +process.env.GRACE_MS || 20000, PING_MS = +process.env.PING_MS || 5000;
const ORIGINS = (process.env.ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const SERVE_STATIC = process.env.STATIC !== '0', ROOT = path.resolve(__dirname, '..');
const MAPS = ['forest'], MAX_PLAYERS = 8, MIN_TO_START = 1, MAX_PAYLOAD = 16 * 1024;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ───────────────────────── WebSocket mínimo (RFC 6455) ───────────────────────── */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class WS {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.alive = true;
    this.onmessage = null; this.onclose = null;
    socket.setNoDelay(true);
    socket.on('data', d => { try { this._data(d); } catch (e) { this.close(1002); } });
    socket.on('close', () => this._closed()); socket.on('error', () => this._closed());
  }
  _closed() { if (!this.open) return; this.open = false; this.onclose && this.onclose(); }
  _data(d) {
    this.alive = true;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80); let len = b[1] & 0x7f, o = 2;
      if (!masked) return this.close(1002);                                   // cliente → servidor sempre mascarado
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); o = 4; }
      else if (len === 127) { if (b.length < 10) return; const hi = b.readUInt32BE(2); len = hi * 4294967296 + b.readUInt32BE(6); o = 10; }
      if (len > MAX_PAYLOAD) return this.close(1009);
      if (b.length < o + 4 + len) return;
      const mask = b.subarray(o, o + 4), p = Buffer.from(b.subarray(o + 4, o + 4 + len));
      for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
      this.buf = b.subarray(o + 4 + len);
      if (op >= 8) {                                                           // controle
        if (op === 8) { this.close(1000); return; }
        if (op === 9) this._send(10, p); else if (op === 10) this.alive = true;
        continue;
      }
      if (op === 1 || op === 2) { this.frag = { op, parts: [p], size: p.length }; }
      else if (op === 0 && this.frag) { this.frag.parts.push(p); this.frag.size += p.length; if (this.frag.size > MAX_PAYLOAD) return this.close(1009); }
      else return this.close(1002);
      if (fin) { const m = Buffer.concat(this.frag.parts); const isText = this.frag.op === 1; this.frag = null; if (isText && this.onmessage) this.onmessage(m.toString('utf8')); }
    }
  }
  _send(op, payload) {
    if (!this.open || this.socket.destroyed) return;
    const n = payload.length; let h;
    if (n < 126) h = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(n, 6); }
    this.socket.write(Buffer.concat([h, payload]));
  }
  send(text) { this._send(1, Buffer.from(text, 'utf8')); }
  ping() { this._send(9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (this.open && !this.socket.destroyed) { const p = Buffer.alloc(2); p.writeUInt16BE(code); this._send(8, p); }
    this.socket.end(); setTimeout(() => this.socket.destroy(), 500).unref(); this._closed();
  }
}

/* ───────────────────────── Salas ───────────────────────── */
const sessions = new Map();   // pid → { pid, token, name, ws, roomId, timer }
const rooms = new Map();      // id  → sala
const clients = new Set();    // conexões abertas (para empurrar a lista de salas)

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const humans = r => r.players.filter(p => !p.bot);
const snapshot = r => ({ id: r.id, name: r.name, hostId: r.hostId, maxPlayers: r.maxPlayers, map: r.map, state: r.state, loaded: r.loaded.slice(),
  players: r.players.map(p => ({ id: p.id, name: p.name, bot: p.bot, character: p.character })) });
const summary = r => ({ id: r.id, name: r.name, host: (r.players.find(p => p.id === r.hostId) || {}).name || '?', players: r.players.length, max: r.maxPlayers, map: r.map, state: r.state, full: r.players.length >= r.maxPlayers });
const listAll = () => [...rooms.values()].filter(r => humans(r).length).map(summary).sort((a, b) => a.id.localeCompare(b.id));

function sendTo(pid, msg) { const s = sessions.get(pid); if (s && s.ws && s.ws.open) s.ws.send(JSON.stringify(msg)); }
function pushRoom(r) { const m = { push: 'room', room: snapshot(r) }; for (const p of humans(r)) sendTo(p.id, m); pushList(); }
let listTimer = null;
function pushList() { // junta várias mudanças seguidas em uma única atualização
  if (listTimer) return; listTimer = setTimeout(() => { listTimer = null; const m = JSON.stringify({ push: 'rooms', rooms: listAll() }); for (const c of clients) if (c.open) c.send(m); }, 30);
}
function destroyRoom(r, why) { rooms.delete(r.id); r.players = []; r.loaded = []; log('sala', r.id, 'destruída (' + why + ')'); pushList(); }
function checkLoaded(r) { if (r.state === 'STARTING' && r.players.every(p => r.loaded.includes(p.id))) r.state = 'IN_GAME'; }

/* Remove o jogador da sala (saída voluntária ou desconexão que passou do prazo). Sala sem humanos = destruída. */
function removeFromRoom(pid, why) {
  const s = sessions.get(pid); if (!s || !s.roomId) return;
  const r = rooms.get(s.roomId); s.roomId = null; clearTimeout(s.timer); s.timer = null; if (!r) return;
  r.players = r.players.filter(p => p.id !== pid); r.loaded = r.loaded.filter(i => i !== pid);
  log('jogador', pid.slice(0, 6), 'saiu da sala', r.id, '(' + why + ')');
  if (!humans(r).length) return destroyRoom(r, 'sem jogadores');
  if (r.hostId === pid) { r.hostId = humans(r)[0].id; log('sala', r.id, 'novo host:', r.hostId.slice(0, 6)); }  // o criador saiu: passa o comando, a sessão continua
  checkLoaded(r); pushRoom(r);
}
function disconnected(s) { // conexão caiu: o lugar fica reservado por GRACE_MS (refresh/queda curta não destrói nada)
  if (!s.roomId) { sessions.delete(s.pid); return; }
  clearTimeout(s.timer); s.timer = setTimeout(() => { s.timer = null; if (!s.ws || !s.ws.open) { removeFromRoom(s.pid, 'desconectado'); sessions.delete(s.pid); } }, GRACE_MS); s.timer.unref && s.timer.unref();
}

const E = m => { const e = new Error(m); e.user = true; return e; };
const need = (s, host) => {
  const r = s.roomId && rooms.get(s.roomId); if (!r) throw E('Você não está em uma sala.');
  if (host && r.hostId !== s.pid) throw E('Somente o host pode fazer isso.'); return r;
};
const inState = (r, ...ok) => { if (!ok.includes(r.state)) throw E('Ação indisponível agora (estado ' + r.state + ').'); };
const newId = () => { let id; do id = String(100000 + crypto.randomInt(900000)); while (rooms.has(id)); return id; };
const mkPlayer = (s, p) => ({ id: s.pid, name: clean(p && p.name, 16) || s.name || 'Player', bot: false, character: clean(p && p.character, 24) || 'street' });

const OPS = {
  list: () => ({ rooms: listAll() }),
  create(s, m) {
    if (s.roomId && rooms.has(s.roomId)) throw E('Você já está em uma sala.');
    const id = newId(), max = Math.min(Math.max(+m.maxPlayers || MAX_PLAYERS, 2), MAX_PLAYERS), p = mkPlayer(s, m.player);
    s.name = p.name;
    const r = { id, name: clean(m.name, 24) || ('Sala de ' + p.name), hostId: s.pid, maxPlayers: max, players: [p], map: null, state: 'WAITING', loaded: [], created: Date.now() };
    rooms.set(id, r); s.roomId = id; log('sala', id, '"' + r.name + '" criada por', p.name); pushRoom(r); return { room: snapshot(r) };
  },
  join(s, m) {
    const r = rooms.get(clean(m.room, 12)); if (!r || !humans(r).length) throw E('Sala não encontrada.');
    if (s.roomId === r.id && r.players.some(p => p.id === s.pid)) return { room: snapshot(r) };      // já está dentro (sem duplicar)
    if (s.roomId && rooms.has(s.roomId)) throw E('Você já está em uma sala.');
    if (r.players.length >= r.maxPlayers) throw E('Sala cheia.');
    const p = mkPlayer(s, m.player); s.name = p.name; r.players.push(p); s.roomId = r.id;
    log(p.name, 'entrou na sala', r.id, r.players.length + '/' + r.maxPlayers); pushRoom(r); return { room: snapshot(r) };
  },
  leave(s) { removeFromRoom(s.pid, 'saiu'); return {}; },
  beginMapSelection(s) { const r = need(s, true); inState(r, 'WAITING', 'READY'); r.state = 'MAP_SELECTION'; pushRoom(r); return { room: snapshot(r) }; },
  cancelMapSelection(s) { const r = need(s, true); inState(r, 'MAP_SELECTION'); r.state = r.map ? 'READY' : 'WAITING'; pushRoom(r); return { room: snapshot(r) }; },
  setMap(s, m) { const r = need(s, true); inState(r, 'MAP_SELECTION'); if (!MAPS.includes(m.map)) throw E('Mapa inválido.'); r.map = m.map; r.state = 'READY'; pushRoom(r); return { room: snapshot(r) }; },
  startGame(s) {
    const r = need(s, true); inState(r, 'READY'); if (!r.map) throw E('Escolha um mapa antes de iniciar.'); if (r.players.length < MIN_TO_START) throw E('Jogadores insuficientes.');
    r.state = 'STARTING'; r.loaded = r.players.filter(p => p.bot).map(p => p.id); pushRoom(r); return { room: snapshot(r) };
  },
  markLoaded(s) { const r = need(s); inState(r, 'STARTING'); if (!r.loaded.includes(s.pid)) r.loaded.push(s.pid); checkLoaded(r); pushRoom(r); return { room: snapshot(r) }; },
  finishGame(s) { const r = need(s, true); inState(r, 'IN_GAME'); r.state = 'FINISHED'; pushRoom(r); return { room: snapshot(r) }; },
  resetRoom(s) { const r = need(s, true); inState(r, 'FINISHED'); r.state = r.map ? 'READY' : 'WAITING'; r.loaded = []; pushRoom(r); return { room: snapshot(r) }; },
  addBot(s) {
    const r = need(s, true); inState(r, 'WAITING', 'READY', 'MAP_SELECTION'); if (r.players.length >= r.maxPlayers) throw E('Sala cheia.');
    r.players.push({ id: 'bot' + crypto.randomBytes(4).toString('hex'), name: 'Bot' + r.players.length, bot: true, character: 'street' }); pushRoom(r); return { room: snapshot(r) };
  },
  setCharacter(s, m) { const r = need(s); const p = r.players.find(x => x.id === s.pid); if (p) { p.character = clean(m.character, 24) || p.character; pushRoom(r); } return { room: snapshot(r) }; },
  ping: () => ({ t: Date.now() })
};

function relay(s, m) { // retransmite para os OUTROS jogadores da sala (nunca para quem enviou)
  const r = s.roomId && rooms.get(s.roomId); if (!r || m.data == null) return;
  const out = JSON.stringify({ push: 'relay', from: s.pid, data: m.data });
  for (const p of humans(r)) if (p.id !== s.pid) { const o = sessions.get(p.id); if (o && o.ws && o.ws.open) o.ws.send(out); }
}

function handle(ws, text, conn) {
  if (++conn.rate.n > 200) { conn.rate.drops++; if (conn.rate.drops > 400) ws.close(1008); return; }   // anti-flood (200 msgs/s)
  let m; try { m = JSON.parse(text); } catch (_) { return; } if (!m || typeof m !== 'object') return;
  if (m.op === 'hello') {
    const pid = clean(m.pid, 40), tok = clean(m.token, 64);
    if (!/^[\w-]{8,40}$/.test(pid)) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Identificação inválida.' }));
    let s = sessions.get(pid);
    if (s && s.token !== tok) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Identificação já em uso.' }));
    if (!s) { s = { pid, token: crypto.randomBytes(16).toString('hex'), name: clean(m.name, 16) || 'Player', ws: null, roomId: null, timer: null }; sessions.set(pid, s); }
    if (s.ws && s.ws !== ws && s.ws.open) { const old = s.ws; old.onclose = null; clients.delete(old); old.send(JSON.stringify({ push: 'replaced' })); old.close(4000); }   // mesma identidade em outra aba/conexão: a nova assume
    clearTimeout(s.timer); s.timer = null; s.ws = ws; conn.s = s;
    const r = s.roomId && rooms.get(s.roomId);
    if (s.roomId && !r) s.roomId = null;
    if (r) log(s.name, 'reconectou à sala', r.id);
    return ws.send(JSON.stringify({ id: m.id, ok: true, pid, token: s.token, room: r ? snapshot(r) : null, rooms: listAll(), server: { maxPlayers: MAX_PLAYERS, maps: MAPS } }));
  }
  const s = conn.s; if (!s) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Envie hello primeiro.' }));
  if (m.op === 'relay') return relay(s, m);
  const f = OPS[m.op]; if (!f) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Operação desconhecida.' }));
  try { ws.send(JSON.stringify({ id: m.id, ok: true, ...f(s, m) })); }
  catch (e) { if (!e.user) console.error(e); ws.send(JSON.stringify({ id: m.id, ok: false, error: e.user ? e.message : 'Erro interno.' })); }
}

/* ───────────────────────── HTTP (arquivos do jogo + /healthz) ───────────────────────── */
const MIME = { '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); let p;
  try { p = decodeURIComponent(url.pathname); } catch (_) { res.writeHead(400); return res.end(); }
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify({ ok: true, rooms: listAll().length, players: sessions.size })); }
  if (!SERVE_STATIC) { res.writeHead(404); return res.end('Not found'); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p), rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(x => x.startsWith('.')) || rel.split(path.sep)[0] === 'server' || rel === 'serve.py') { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(data);
  });
});
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x'), key = req.headers['sec-websocket-key'], origin = req.headers.origin;
  if (url.pathname !== '/ws' || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  if (ORIGINS.length && origin && !ORIGINS.some(o => origin === o || origin.endsWith('//' + o))) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const ws = new WS(socket), conn = { s: null, rate: { n: 0, drops: 0 } };
  clients.add(ws);
  const tick = setInterval(() => { conn.rate.n = 0; }, 1000);
  ws.onmessage = t => handle(ws, t, conn);
  ws.onclose = () => { clearInterval(tick); clients.delete(ws); const s = conn.s; if (s && s.ws === ws) { s.ws = null; disconnected(s); } };
});
/* Heartbeat: quem não responde ao ping por 2 intervalos é considerado desconectado (entra no prazo de tolerância). */
setInterval(() => { for (const ws of clients) { if (!ws.alive) { ws.socket.destroy(); ws._closed(); continue; } ws.alive = false; ws.ping(); } }, PING_MS).unref();

server.listen(PORT, () => log('Saiyan Legends — servidor de salas em http://localhost:' + PORT + '  (WebSocket: ws://localhost:' + PORT + '/ws)  · tolerância de queda: ' + GRACE_MS / 1000 + 's'));
module.exports = { server, rooms, sessions };
