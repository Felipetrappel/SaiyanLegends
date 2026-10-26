/* Rede: RemoteRoomService fala com server/server.js por WebSocket (mesma API do LocalRoomService);
 * AutoService escolhe entre o servidor online e o modo offline (local), sem nunca inventar salas. */
(() => {
'use strict';
const { Emitter, LocalRoomService, identity } = SL;

const toWs = u => {
  u = String(u || '').trim(); if (!u) return '';
  u = u.replace(/^http/i, 'ws'); if (!/^wss?:\/\//i.test(u)) u = (location.protocol === 'https:' ? 'wss://' : 'ws://') + u;
  try { const x = new URL(u); if (x.pathname === '/' || x.pathname === '') x.pathname = '/ws'; return x.toString(); } catch (_) { return ''; }
};
function resolveUrl() {
  const q = /[?&]server=([^&#]+)/.exec(location.search); if (q) return toWs(decodeURIComponent(q[1]));
  if (SL_CONFIG && SL_CONFIG.serverUrl) return toWs(SL_CONFIG.serverUrl);
  return /^https?:$/.test(location.protocol) ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' : '';
}

class RemoteRoomService extends Emitter {
  constructor(url, ident) {
    super(); this.url = url; this.ident = ident; this.ws = null; this.online = false; this.mode = 'online'; this.seq = 0; this.pending = new Map();
    this.current = null; this.resumed = null; this.dead = false; this.retry = 0; this.lastMsg = 0; this.everConnected = false;
  }
  connect(timeout = 4000) {
    return new Promise((res, rej) => {
      let done = false; const fin = (f, v) => { if (!done) { done = true; f(v); } };
      const t = setTimeout(() => { this.dead = true; try { this.ws && this.ws.close(); } catch (_) {} fin(rej, new Error('Tempo esgotado ao conectar em ' + this.url)); }, timeout);
      this._open(r => { clearTimeout(t); fin(res, r); }, e => { clearTimeout(t); this.dead = true; fin(rej, e); });
    });
  }
  _open(onFirst, onFail) {
    let ws; try { ws = new WebSocket(this.url); } catch (e) { return onFail && onFail(e); }
    this.ws = ws; let opened = false;
    ws.onopen = () => { opened = true; this._hello().then(r => { this.retry = 0; this.everConnected = true; onFirst && onFirst(r); onFirst = onFail = null; }).catch(e => { onFail && onFail(e); onFail = onFirst = null; try { ws.close(); } catch (_) {} }); };
    ws.onmessage = ev => { this.lastMsg = Date.now(); let m; try { m = JSON.parse(ev.data); } catch (_) { return; } this._msg(m); };
    ws.onclose = () => {
      if (this.ws !== ws) return; this.online = false; this.ws = null;
      for (const [, p] of this.pending) p.rej(new Error('Conexão perdida.')); this.pending.clear();
      this.emit('status', this); if (!opened && onFail) { onFail(new Error('Não foi possível conectar em ' + this.url)); onFail = onFirst = null; }
      if (!this.dead && this.everConnected) this._reconnect();
    };
    ws.onerror = () => {};
  }
  _reconnect() { clearTimeout(this._rt); this._rt = setTimeout(() => this._open(null, null), Math.min(5000, 500 * 2 ** this.retry++)); }
  async _hello() {
    const r = await this._req('hello', { pid: this.ident.pid, token: this.ident.token, name: this.ident.name, auth: SL.Auth ? SL.Auth.token() : '' }, true);
    this.ident.token = r.token; this.ident.save('token', r.token); this.online = true; this.lastMsg = Date.now();
    clearInterval(this._ka); this._ka = setInterval(() => { // keepalive: sem resposta por 25s = conexão morta → reconecta
      if (!this.online) return; if (Date.now() - this.lastMsg > 25000) { try { this.ws.close(); } catch (_) {} return; } this._raw({ op: 'ping' }); }, 8000);
    if (r.room) { this.current = r.room.id; this.resumed = this.resumed || r.room; this.emit('room:' + r.room.id, r.room); }
    else if (this.current) { const id = this.current; this.current = null; this.emit('room:' + id, null); }            // a vaga expirou enquanto estávamos fora
    this.emit('rooms', r.rooms || []); this.emit('online', r.online); (r.chat || []).forEach(c => this.emit('chat', c)); this.emit('status', this); return r;
  }
  _raw(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  _req(op, data = {}, force = false) {
    return new Promise((res, rej) => {
      if (!force && !this.online) return rej(new Error('Sem conexão com o servidor.'));
      const id = ++this.seq, t = setTimeout(() => { this.pending.delete(id); rej(new Error('O servidor não respondeu.')); }, 8000);
      this.pending.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
      if (!this.ws || this.ws.readyState !== 1) { this.pending.delete(id); clearTimeout(t); return rej(new Error('Sem conexão com o servidor.')); }
      this.ws.send(JSON.stringify({ id, op, ...data }));
    });
  }
  _msg(m) {
    if (m.id != null) { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.ok ? p.res(m) : p.rej(new Error(m.error || 'Erro.')); } return; }
    if (m.push === 'room') this.emit('room:' + m.room.id, m.room);
    else if (m.push === 'rooms') this.emit('rooms', m.rooms);
    else if (m.push === 'relay') this.emit('relay', { from: m.from, data: m.data });
    else if (m.push === 'chat') this.emit('chat', m.msg);
    else if (m.push === 'online') this.emit('online', m.n);
    else if (m.push === 'replaced') { this.dead = true; this.online = false; this.emit('replaced'); this.emit('status', this); }
  }
  resume() { const r = this.resumed; this.resumed = null; return Promise.resolve(r); }
  subscribe(id, fn) { const e = 'room:' + id; this.on(e, fn); return () => this.off(e, fn); }
  onRooms(fn) { this.on('rooms', fn); return () => this.off('rooms', fn); }
  async listRooms() { return (await this._req('list')).rooms; }
  async createRoom(player, o = {}) { const r = (await this._req('create', { player: { name: player.name, character: player.character }, maxPlayers: o.maxPlayers, name: o.name })).room; this.current = r.id; return r; }
  async joinRoom(id, player) { const r = (await this._req('join', { room: String(id).trim(), player: { name: player.name, character: player.character } })).room; this.current = r.id; return r; }
  async leaveRoom() { this.current = null; try { await this._req('leave'); } catch (_) {} }
  relay(data) { this._raw({ op: 'relay', data }); }
  sendChat(text, lv, name) { return this._req('chat', { text, lv, name }); }
  _op(op, extra) { return this._req(op, extra).then(r => r.room); }
  beginMapSelection() { return this._op('beginMapSelection'); }
  cancelMapSelection() { return this._op('cancelMapSelection'); }
  setMap(id, pid, map) { return this._op('setMap', { map }); }
  startGame() { return this._op('startGame'); }
  markLoaded() { return this._op('markLoaded'); }
  finishGame() { return this._op('finishGame'); }
  resetRoom() { return this._op('resetRoom'); }
  addBot() { return this._op('addBot'); }
}

/* Escolhe o serviço: servidor online se responder; senão modo offline local (com aviso). */
const FWD = ['listRooms', 'createRoom', 'joinRoom', 'leaveRoom', 'beginMapSelection', 'cancelMapSelection', 'setMap', 'startGame', 'markLoaded', 'finishGame', 'resetRoom', 'addBot'];
class AutoService extends Emitter {
  constructor() {
    super(); this.url = resolveUrl(); this.impl = new LocalRoomService(); this.reason = ''; this._wireLocal(this.impl);
    this.ident = identity(); this.ready = this._init();
    FWD.forEach(m => { this[m] = async (...a) => { await this.ready; return this.impl[m](...a); }; });
  }
  get online() { return this.impl.mode === 'online' && this.impl.online; }
  get mode() { return this.impl.mode === 'online' ? 'online' : 'offline'; }
  _wireLocal(l) { l.on('rooms', () => l.listRooms().then(x => this.emit('rooms', x))); }
  async _init() {
    if (!this.url) { this.reason = 'Nenhum servidor configurado (SL_CONFIG.serverUrl).'; return this.emit('status'); }
    try {
      const r = new RemoteRoomService(this.url, this.ident); await r.connect();
      r.on('rooms', l => this.emit('rooms', l)); r.on('relay', e => this.emit('relay', e)); r.on('status', () => this.emit('status')); r.on('replaced', () => this.emit('replaced')); r.on('chat', c => this.emit('chat', c)); r.on('online', n => this.emit('online', n));
      this.impl = r; this.reason = '';
    } catch (e) { this.reason = e.message; }
    this.emit('status');
  }
  async reconnect() { if (this.mode === 'online' || !this.url) return this.online; this.ready = this._init(); await this.ready; return this.online; }
  resume() { return this.ready.then(() => this.impl.resume ? this.impl.resume() : null); }
  subscribe(id, fn) { return this.impl.subscribe(id, fn); }
  relay(d) { this.impl.relay && this.impl.relay(d); }
  /* chat global: online vai para todos; offline só aparece para você (eco local) */
  async sendChat(text, lv, name) { await this.ready; if (this.mode === 'online' && this.impl.sendChat) return this.impl.sendChat(text, lv, name); this.emit('chat', { n: 'l' + Date.now(), name, lv, text, t: Date.now(), local: true }); }
  onRooms(fn) { this.on('rooms', fn); return () => this.off('rooms', fn); }
}

Object.assign(SL, { RemoteRoomService, AutoService });
})();
