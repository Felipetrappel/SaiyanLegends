/* Room System — lógica de salas, sem nenhuma dependência de interface.
 * LocalRoomService simula o servidor em memória (e é a "fonte da verdade": valida host, estado e limites).
 * Para um servidor real, crie uma classe com a MESMA API async e passe-a ao RoomSystem:
 *   createRoom, joinRoom, leaveRoom, listRooms, beginMapSelection, cancelMapSelection, setMap,
 *   startGame, markLoaded, finishGame, resetRoom, addBot  +  subscribe(roomId, fn) -> unsubscribe
 * (subscribe recebe o snapshot da sala a cada mudança, ou null se a sala deixou de existir).
 */
(() => {
'use strict';
const RoomState = Object.freeze({ WAITING: 'WAITING', MAP_SELECTION: 'MAP_SELECTION', READY: 'READY', STARTING: 'STARTING', IN_GAME: 'IN_GAME', FINISHED: 'FINISHED' });
const MAPS = Object.freeze([{ id: 'forest', name: 'FOREST' }]);
const LIMITS = Object.freeze({ maxPlayers: 8, minToStart: 1 });

class Emitter {
  #h = {};
  on(e, f) { (this.#h[e] ||= []).push(f); return this; }
  off(e, f) { this.#h[e] = (this.#h[e] || []).filter(x => x !== f); return this; }
  emit(e, d) { (this.#h[e] || []).forEach(f => f(d)); }
}

let seq = 0;
class Player {
  constructor(name, bot = false) { this.id = 'p' + (++seq) + Math.random().toString(36).slice(2, 6); this.name = name; this.bot = bot; this.character = (window.SL && SL.Characters && SL.Characters.DEFAULT) || 'street'; }
}

/* Identidade do jogador: persistente na aba (sessionStorage) — recarregar a página mantém o mesmo jogador, e duas abas são dois jogadores. */
function identity() {
  const mk = n => { const a = new Uint8Array(n); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
  let pid, token, name;
  try { pid = sessionStorage.getItem('sl_pid'); token = sessionStorage.getItem('sl_token'); name = sessionStorage.getItem('sl_name'); } catch (_) {}
  try { const a = JSON.parse(localStorage.getItem('sl.account') || 'null'); if (a && a.pid && a.token) { pid = a.pid; name = a.name; } } catch (_) {}   // conta: o id e o apelido vêm dela
  if (!pid) { pid = 'u' + mk(10); try { sessionStorage.setItem('sl_pid', pid); } catch (_) {} }
  return { pid, token: token || '', name: name || '', save(k, v) { try { sessionStorage.setItem('sl_' + k, v); } catch (_) {} } };
}

/* Serviço LOCAL (modo offline): salas só existem dentro deste navegador. Não há nenhuma sala pré-criada. */
class LocalRoomService extends Emitter {
  constructor() { super(); this.rooms = new Map(); this.mode = 'offline'; }
  _get(id) { const r = this.rooms.get(String(id).trim()); if (!r) throw new Error('Sala não encontrada.'); return r; }
  _host(r, pid) { if (r.hostId !== pid) throw new Error('Somente o host pode fazer isso.'); }
  _state(r, ...ok) { if (!ok.includes(r.state)) throw new Error('Ação indisponível agora (estado ' + r.state + ').'); }
  _push(r) { const s = JSON.parse(JSON.stringify(r)); this.emit('room:' + r.id, s); this.emit('rooms', null); return s; }
  onRooms(fn) { const h = () => this.listRooms().then(fn); this.on('rooms', h); return () => this.off('rooms', h); }
  _checkLoaded(r) { if (r.players.every(p => r.loaded.includes(p.id))) r.state = RoomState.IN_GAME; }
  subscribe(id, fn) { const e = 'room:' + id; this.on(e, fn); return () => this.off(e, fn); }

  async listRooms() {
    return [...this.rooms.values()].map(r => ({ id: r.id, name: r.name, host: r.players.find(p => p.id === r.hostId).name, players: r.players.length, max: r.maxPlayers, map: r.map, state: r.state, full: r.players.length >= r.maxPlayers }));
  }
  async createRoom(player, { maxPlayers = LIMITS.maxPlayers, name } = {}) {
    let id; do id = String(100000 + Math.floor(Math.random() * 900000)); while (this.rooms.has(id));
    const r = { id, name: String(name || '').trim().slice(0, 24) || ('Sala de ' + player.name), hostId: player.id, maxPlayers: Math.min(Math.max(+maxPlayers || 8, 2), LIMITS.maxPlayers), players: [{ ...player }], map: null, state: RoomState.WAITING, loaded: [] };
    this.rooms.set(id, r); return this._push(r);
  }
  async joinRoom(id, player) {
    const r = this._get(id);
    if (r.players.some(p => p.id === player.id)) return this._push(r);
    if (r.players.length >= r.maxPlayers) throw new Error('Sala cheia.');
    r.players.push({ ...player });
    return this._push(r);
  }
  async leaveRoom(id, pid) {
    const r = this.rooms.get(id); if (!r) return;
    r.players = r.players.filter(p => p.id !== pid);
    if (!r.players.some(p => !p.bot)) { this.rooms.delete(id); this.emit('room:' + id, null); return this.emit('rooms', null); }
    if (r.hostId === pid) r.hostId = r.players.find(p => !p.bot).id; // o criador saiu: outro jogador vira host
    if (r.state === RoomState.STARTING) this._checkLoaded(r);
    this._push(r);
  }
  async beginMapSelection(id, pid) { const r = this._get(id); this._host(r, pid); this._state(r, 'WAITING', 'READY'); r.state = RoomState.MAP_SELECTION; return this._push(r); }
  async cancelMapSelection(id, pid) { const r = this._get(id); this._host(r, pid); this._state(r, 'MAP_SELECTION'); r.state = r.map ? RoomState.READY : RoomState.WAITING; return this._push(r); }
  async setMap(id, pid, mapId) {
    const r = this._get(id); this._host(r, pid); this._state(r, 'MAP_SELECTION');
    if (!MAPS.some(m => m.id === mapId)) throw new Error('Mapa inválido.');
    r.map = mapId; r.state = RoomState.READY; return this._push(r);
  }
  async startGame(id, pid) {
    const r = this._get(id); this._host(r, pid); this._state(r, 'READY');
    if (!r.map) throw new Error('Escolha um mapa antes de iniciar.');
    if (r.players.length < LIMITS.minToStart) throw new Error('Jogadores insuficientes.');
    r.state = RoomState.STARTING; r.loaded = r.players.filter(p => p.bot).map(p => p.id); return this._push(r);
  }
  async markLoaded(id, pid) { const r = this._get(id); this._state(r, 'STARTING'); if (!r.loaded.includes(pid)) r.loaded.push(pid); this._checkLoaded(r); return this._push(r); }
  async finishGame(id, pid) { const r = this._get(id); this._host(r, pid); this._state(r, 'IN_GAME'); r.state = RoomState.FINISHED; return this._push(r); }
  async resetRoom(id, pid) { const r = this._get(id); this._host(r, pid); this._state(r, 'FINISHED'); r.state = r.map ? RoomState.READY : RoomState.WAITING; r.loaded = []; return this._push(r); }
  async addBot(id, pid) { // só para testar com mais de um jogador
    const r = this._get(id); this._host(r, pid); this._state(r, 'WAITING', 'READY', 'MAP_SELECTION');
    if (r.players.length >= r.maxPlayers) throw new Error('Sala cheia.');
    r.players.push({ ...new Player('Bot' + r.players.length, true) }); return this._push(r);
  }
}

/* Lado do cliente: a única porta de entrada que a interface usa. */
class RoomSystem extends Emitter {
  constructor(service, loader) {
    super(); this.service = service; this.loader = loader; this.room = null; this._stop = null; this._loading = false;
    this.id = identity(); this.me = new Player(this.id.name || 'Player' + (100 + Math.floor(Math.random() * 900))); this.me.id = this.id.pid;
    service.on && service.on('relay', e => this.emit('net:data', e));      // mensagens de jogo dos outros jogadores (posições, golpes…)
  }
  get isHost() { return !!this.room && this.room.hostId === this.me.id; }
  get online() { return !!this.service.online; }
  setName(n) { n = String(n || '').trim().slice(0, 16); if (n) { this.me.name = n; this.id.save('name', n); } }
  _busy() { if (this.room) throw new Error('Você já está em uma sala.'); }
  async _enter(r) {
    if (r.state === RoomState.IN_GAME) { try { await this.loader.load(r.map); } catch (e) { await this.service.leaveRoom(r.id, this.me.id).catch(() => {}); throw e; } }  // entrada no meio da partida: carrega o mapa antes
    this.room = r; this._stop?.(); this._stop = this.service.subscribe(r.id, s => this._sync(s)); this.emit('room:update', r); return r;
  }
  _do(fn, ...a) { return this.room ? this.service[fn](this.room.id, this.me.id, ...a) : Promise.reject(new Error('Você não está em uma sala.')); }
  listRooms() { return this.service.listRooms(); }
  onRooms(fn) { return this.service.onRooms ? this.service.onRooms(fn) : () => {}; }
  /* Depois de recarregar a página: se o servidor ainda guarda o lugar deste jogador, volta para a mesma sala. */
  async resume() { const r = await (this.service.resume ? this.service.resume() : null); if (r && !this.room) await this._enter(r); return this.room; }
  async createRoom(opts) { this._busy(); return this._enter(await this.service.createRoom(this.me, opts)); }
  async joinRoom(id) { this._busy(); return this._enter(await this.service.joinRoom(id, this.me)); }
  async leaveRoom() { const r = this.room; if (!r) return; this._stop?.(); this._stop = null; this.room = null; this._loading = false; await this.service.leaveRoom(r.id, this.me.id); this.emit('room:left', r); }
  openMapSelection() { return this._do('beginMapSelection'); }
  cancelMapSelection() { return this._do('cancelMapSelection'); }
  setMap(mapId) { return this._do('setMap', mapId); }
  startGame() { return this._do('startGame'); }
  finishGame() { return this._do('finishGame'); }
  resetRoom() { return this._do('resetRoom'); }
  addBot() { return this._do('addBot'); }
  send(data) { if (this.room && this.service.relay) this.service.relay(data); }      // envia aos outros jogadores da sala
  _sync(s) {
    if (!s) { this.room = null; this._stop?.(); this._stop = null; this._loading = false; return this.emit('room:closed'); }
    this.room = s; this.emit('room:update', s);
    if (s.state === RoomState.STARTING && !this._loading) { // só aqui o mapa é carregado
      this._loading = true; this.loadError = null; this.loader.load(s.map).then(() => this.service.markLoaded(s.id, this.me.id)).catch(e => { this.loadError = e.message; this.emit('load:error', e); });
    }
    if (s.state !== RoomState.STARTING) this._loading = false;
  }
}

window.SL = { RoomState, MAPS, LIMITS, Emitter, Player, LocalRoomService, RoomSystem, identity };
})();
