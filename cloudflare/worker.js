/* Saiyan Legends Online — versão CLOUDFLARE (Worker + Durable Object).
 *
 * O Worker entrega os arquivos do jogo (assets estáticos) e encaminha /ws para UM Durable Object ("mundo"), que guarda as
 * salas, o lobby e o chat em memória — exatamente a mesma lógica do server/server.js (Render), só que sem Node.
 * Rotas:  /ws (WebSocket) · /healthz · /api/save/* (progresso no D1, se o banco estiver ligado) · o resto = arquivos do jogo.
 */
'use strict';
import { DurableObject } from 'cloudflare:workers';
import { saveApi } from './save.js';
import { handleAuth, authCheck } from './auth.js';

const GRACE_MS = 20000, MAPS = ['swamp'], MAX_PLAYERS = 8, MIN_TO_START = 1;
const MODES = { pvp: { min: 2, max: 8, start: 2 }, bots: { min: 2, max: 8, start: 2, bots: true }, '2v2': { min: 4, max: 4, start: 4, teams: true }, custom: { min: 2, max: 8, start: 1 } };
const enc = new TextEncoder();
const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
async function pwHash(pw, salt) { const k = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']); const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 60000 }, k, 256); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function pwOk(r, pw) { if (!r.pw) return true; return (await pwHash(pw || '', r.pw.salt)) === r.pw.hash; }
const log = (...a) => console.log(...a);
const AUTH = null;

/* Adaptador: dá ao código das salas a mesma interface do WebSocket do Node (send/open/close/onmessage/onclose). */
function wrap(sock) {
  const w = { open: true, alive: true, onmessage: null, onclose: null, send(t) { if (w.open) { try { sock.send(t); } catch (_) {} } }, close(code = 1000) { if (!w.open) return; try { sock.close(code === 1008 || code === 4000 ? code : 1000); } catch (_) {} w._closed(); }, _closed() { if (!w.open) return; w.open = false; w.onclose && w.onclose(); } };
  sock.addEventListener('message', e => { if (typeof e.data === 'string' && e.data.length <= 16384 && w.onmessage) w.onmessage(e.data); });
  sock.addEventListener('close', () => w._closed()); sock.addEventListener('error', () => w._closed());
  return w;
}

/* ───────────────────────── Salas ───────────────────────── */
/* Tags da equipe: o SERVIDOR decide quem tem tag. Segredo STAFF_CODES (JSON: {"codigo-secreto":"DEV", ...}) definido na Cloudflare. */
const TAGS = new Set(['DEV', 'ADM', 'GM', 'CM', 'YT']);
let STAFF = {};
const DEFAULT_CODES = { SAIYAN: { gold: 500, gems: 10 }, FELIPEDZN: { gold: 1000, gems: 20 } };
let CODES = DEFAULT_CODES;
const parseCodes = raw => { try { const o = JSON.parse(raw || ''), r = {}; for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') r[String(k).toUpperCase()] = v; return r; } catch (e) { return DEFAULT_CODES; } };
const parseStaff = raw => { try { const o = JSON.parse(raw || '{}'), r = {}; for (const [k, v] of Object.entries(o)) if (k.length >= 12 && TAGS.has(String(v).toUpperCase())) r[k] = String(v).toUpperCase(); return r; } catch (_) { return {}; } };
const staffTag = code => { code = String(code || ''); let found = ''; for (const k of Object.keys(STAFF)) if (k.length === code.length) { let d = 0; for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ code.charCodeAt(i); if (!d) found = STAFF[k]; } return found; };
const tagOf = pid => (sessions.get(pid) || {}).tag || '';
/* Tags dadas por comando (/tag): guardadas na conta (D1), valem em qualquer aparelho. */
let tagsReady = null;
const tagsInit = () => tagsReady || (tagsReady = ENV.DB.prepare('CREATE TABLE IF NOT EXISTS acct_tags (uid TEXT PRIMARY KEY, tag TEXT NOT NULL)').run().catch(e => { tagsReady = null; throw e; }));
const loadTag = async acc => { try { if (!acc || !ENV.DB) return ''; await tagsInit(); const r = await ENV.DB.prepare('SELECT tag FROM acct_tags WHERE uid = ?1').bind(String(acc.id)).first(); return r && TAGS.has(r.tag) ? r.tag : ''; } catch (_) { return ''; } };
const saveTag = async (uid, tag) => { await tagsInit(); if (tag) await ENV.DB.prepare('INSERT INTO acct_tags (uid, tag) VALUES (?1, ?2) ON CONFLICT(uid) DO UPDATE SET tag = ?2').bind(String(uid), tag).run(); else await ENV.DB.prepare('DELETE FROM acct_tags WHERE uid = ?1').bind(String(uid)).run(); };
const setTagLive = (t, tag) => {   // aplica a tag num jogador conectado e avisa todo mundo
  t.tag = tag; if (t.account) t.dbTag = tag; const h = hub.get(t.pid); if (h) { h.tag = tag; hubSend(t.pid, { push: 'hub', t: 'join', p: h }); }
  sendTo(t.pid, { push: 'tag', tag }); const r = t.roomId && rooms.get(t.roomId); if (r) pushRoom(r);
};
/* ── Comandos de administração (só <DEV> e <ADM>, validados aqui no servidor) ── */
const RANK = { DEV: 3, ADM: 2 }, CAP = 1e9;
const sysMsg = (s, text) => sendTo(s.pid, { push: 'chat', msg: { n: 's' + Date.now() + Math.random().toString(36).slice(2, 5), name: 'Sistema', lv: 0, tag: '', text, t: Date.now() } });
const HELP = ['/moedas <jogador> <qtd>   (negativo tira)', '/diamantes <jogador> <qtd>', '/nivel <jogador> <n|+n|-n>', '/tag <jogador> <DEV|ADM|GM|CM|YT|nenhuma>', 'Use "eu" para você mesmo.'];
async function findTarget(name) {
  const lc = String(name || '').toLowerCase(); if (!lc) return null;
  for (const t of sessions.values()) if (t.name && t.name.toLowerCase() === lc && t.ws && t.ws.open) return { online: t, name: t.name, uid: t.account ? String(t.account.id) : '' };
  if (!ENV.DB) return null;
  const u = await ENV.DB.prepare('SELECT id, name FROM users WHERE name_lc = ?1').bind(lc).first();
  return u ? { online: null, name: u.name, uid: String(u.id) } : null;
}
const needGen = s => { if (!s.account || (s.tag !== 'DEV' && s.tag !== 'ADM') || !ENV.DB) throw E('Sem permissão.'); };
let codeTablesOk = false;
async function ensureCodeTables() { if (codeTablesOk) return; await ENV.DB.prepare('CREATE TABLE IF NOT EXISTS code_uses (uid TEXT NOT NULL, code TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, code))').run(); await ENV.DB.prepare('CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, gold INTEGER NOT NULL DEFAULT 0, gems INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, by_name TEXT, at INTEGER)').run(); codeTablesOk = true; }
async function adminCmd(s, text) {
  const [cmd0, ...a] = text.slice(1).split(/\s+/), cmd = cmd0.toLowerCase();
  const rank = RANK[s.tag] || 0;
  if (!rank) return sysMsg(s, 'Você não tem permissão para usar comandos.');
  if (cmd === 'ajuda' || cmd === 'help') return HELP.forEach(l => sysMsg(s, l));
  if (!['moedas', 'diamantes', 'nivel', 'nível', 'tag'].includes(cmd)) return sysMsg(s, 'Comando desconhecido. Use /ajuda.');
  const who = a[0] === 'eu' || a[0] === 'me' ? s.name : a[0]; if (!who || a[1] === undefined) return sysMsg(s, 'Uso incorreto. Use /ajuda.');
  const tg = await findTarget(who); if (!tg) return sysMsg(s, 'Jogador "' + clean(who, 16) + '" não encontrado.');
  if (cmd === 'tag') {
    const want = /^(nenhuma|none|remover|-)$/i.test(a[1]) ? '' : a[1].toUpperCase();
    if (want && !TAGS.has(want)) return sysMsg(s, 'Tag inválida. Use DEV, ADM, GM, CM, YT ou nenhuma.');
    const cur = tg.online ? tg.online.tag || '' : (tg.uid ? await loadTag({ id: tg.uid }) : '');
    if ((RANK[want] || 0) >= rank && rank < 3) return sysMsg(s, 'Só um <DEV> pode dar a tag ' + want + '.');
    if ((RANK[cur] || 0) >= rank && rank < 3 && tg.name !== s.name) return sysMsg(s, 'Você não pode mudar a tag de ' + tg.name + '.');
    if (!tg.uid && !tg.online) return sysMsg(s, 'Jogador não encontrado.');
    if (tg.uid) await saveTag(tg.uid, want);
    if (tg.online) setTagLive(tg.online, want);
    console.log('[admin]', s.name, s.tag, 'tag', tg.name, want || '-'); return sysMsg(s, want ? 'Tag <' + want + '> dada a ' + tg.name + '.' : 'Tag removida de ' + tg.name + '.');
  }
  const raw = a[1], rel = /^[+-]/.test(raw), n = Math.trunc(Number(raw)); if (!Number.isFinite(n) || Math.abs(n) > CAP) return sysMsg(s, 'Quantidade inválida.');
  const g = { gold: 0, gems: 0 }; let lvSet = -1, lvDelta = 0;
  if (cmd === 'moedas') g.gold = n; else if (cmd === 'diamantes') g.gems = n;
  else if (rel) lvDelta = n; else lvSet = Math.max(0, Math.min(999, n));
  if (tg.online) { sendTo(tg.online.pid, { push: 'grant', gold: g.gold, gems: g.gems, level: lvSet, dlevel: lvDelta }); }
  else {   // fora do jogo: altera o progresso salvo na conta
    if (!tg.uid || !ENV.DB) return sysMsg(s, 'Não foi possível alterar ' + tg.name + '.');
    await dbInit(); const id = 'a:' + tg.uid, row = await ENV.DB.prepare('SELECT progress FROM players WHERE id = ?1').bind(id).first();
    if (!row) return sysMsg(s, tg.name + ' ainda não tem progresso salvo.');
    const p = JSON.parse(row.progress), up = k => Math.max(0, Math.min(CAP, Math.floor((+p[k] || 0) + g[k === 'gold' ? 'gold' : 'gems'])));
    if (g.gold) p.gold = up('gold'); if (g.gems) p.gems = up('gems');
    if (lvSet >= 0 || lvDelta) { const L = lvSet >= 0 ? lvSet : Math.max(0, Math.min(999, Math.floor(Math.sqrt((+p.xp || 0) / 100)) + lvDelta)); p.xp = 100 * L * L; p.level = L; }
    await ENV.DB.prepare('UPDATE players SET progress = ?2, rev = rev + 1, updated = ?3 WHERE id = ?1').bind(id, JSON.stringify(p), Date.now()).run();
  }
  console.log('[admin]', s.name, s.tag, cmd, tg.name, raw);
  const lbl = cmd === 'moedas' ? 'moedas' : cmd === 'diamantes' ? 'diamantes' : 'nível';
  return sysMsg(s, 'OK: ' + lbl + ' ' + raw + ' → ' + tg.name + (tg.online ? '' : ' (offline)') + '.');
}
/* ── Banco de dados (Cloudflare D1): progresso do jogador. A chave secreta (40 hex) fica no aparelho; o servidor só guarda o SHA-256 dela. ── */
let ENV = {}, dbReady = null;
const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const DB = () => { if (!ENV.DB) throw E('Salvamento na nuvem indisponível.'); return ENV.DB; };
const dbInit = () => dbReady || (dbReady = DB().prepare('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT, progress TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL)').run().catch(e => { dbReady = null; throw e; }));
const keyId = async (m, s) => { if (s && s.account) return 'a:' + s.account.id; return keyId0(m); };
const keyId0 = async m => { const k = String(m.key || ''); if (!/^[a-f0-9]{40}$/.test(k)) throw E('Código de backup inválido.'); return sha(k); };
const sessions = new Map();   // pid → { pid, token, name, ws, roomId, timer }
const rooms = new Map();      // id  → sala
const clients = new Set();    // conexões abertas (para empurrar a lista de salas)

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const humans = r => r.players.filter(p => !p.bot);
const snapshot = r => ({ id: r.id, name: r.name, hostId: r.hostId, maxPlayers: r.maxPlayers, map: r.map, state: r.state, loaded: r.loaded.slice(), mode: r.mode || null, locked: !!r.pw, minPlayers: r.minPlayers || MIN_TO_START,
  players: r.players.map(p => ({ id: p.id, name: p.name, bot: p.bot, character: p.character, tag: p.bot ? '' : tagOf(p.id) })) });
const summary = r => ({ id: r.id, name: r.name, host: (r.players.find(p => p.id === r.hostId) || {}).name || '?', players: r.players.length, max: r.maxPlayers, map: r.map, state: r.state, mode: r.mode || null, locked: !!r.pw, full: r.players.length >= r.maxPlayers && !(r.mode && MODES[r.mode].bots && r.players.some(p => p.bot)) });
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
  clearTimeout(s.timer); s.timer = setTimeout(() => { s.timer = null; if (!s.ws || !s.ws.open) { removeFromRoom(s.pid, 'desconectado'); sessions.delete(s.pid); } }, GRACE_MS); 
}

const E = m => { const e = new Error(m); e.user = true; return e; };
const need = (s, host) => {
  const r = s.roomId && rooms.get(s.roomId); if (!r) throw E('Você não está em uma sala.');
  if (host && r.hostId !== s.pid) throw E('Somente o host pode fazer isso.'); return r;
};
const inState = (r, ...ok) => { if (!ok.includes(r.state)) throw E('Ação indisponível agora (estado ' + r.state + ').'); };
const newId = () => { let id; do id = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); while (rooms.has(id)); return id; };
const mkPlayer = (s, p) => ({ id: s.pid, name: (s.acct ? s.name : clean(p && p.name, 16)) || s.name || 'Player', bot: false, character: clean(p && p.character, 24) || 'felipedzn' });

/* ── Chat global: um canal para todos os jogadores conectados (histórico curto só em memória; some quando o servidor reinicia) ── */
const chatLog = []; let chatSeq = 0;
function broadcast(o) { const out = JSON.stringify(o); for (const ws of clients) if (ws.open) { try { ws.send(out); } catch (_) {} } }
function onlineCount() { let n = 0; for (const s of sessions.values()) if (s.ws && s.ws.open) n++; return n; }
const pushOnline = () => broadcast({ push: 'online', n: onlineCount() });

/* ── Lobby (hub): jogadores conectados andando juntos na cidade. Só posição/nome/personagem; o chat usa o chat global. ── */
const hub = new Map(), HUB_MAX = 60;
const hubSend = (except, obj) => { const out = JSON.stringify(obj); for (const pid of hub.keys()) if (pid !== except) { const o = sessions.get(pid); if (o && o.ws && o.ws.open) o.ws.send(out); } };
const hubLeave = pid => { if (hub.delete(pid)) hubSend(pid, { push: 'hub', t: 'leave', pid }); };
const hubX = v => Math.max(0, Math.min(20000, +v || 0));

const OPS = {
  async loadProfile(s, m) {
    await dbInit(); const id = await keyId(m, s);
    const r = await DB().prepare('SELECT progress, rev, updated FROM players WHERE id = ?1').bind(id).first();
    return r ? { exists: true, progress: JSON.parse(r.progress), rev: r.rev, updated: r.updated } : { exists: false };
  },
  async saveProfile(s, m) {
    await dbInit(); const id = await keyId(m, s), now = Date.now();
    if (now - (s.lastSave || 0) < 700) throw E('Salvando rápido demais.'); s.lastSave = now;
    const txt = m.progress && typeof m.progress === 'object' ? JSON.stringify(m.progress) : ''; if (!txt || txt.length > 40000) throw E('Dados inválidos.');
    await DB().prepare('INSERT INTO players (id, name, progress, rev, updated) VALUES (?1, ?2, ?3, 1, ?4) ON CONFLICT(id) DO UPDATE SET name = ?2, progress = ?3, rev = rev + 1, updated = ?4').bind(id, clean(m.name, 16), txt, now).run();
    const r = await DB().prepare('SELECT rev FROM players WHERE id = ?1').bind(id).first(); return { rev: r ? r.rev : 1 };
  },
  /* Ativa a tag da equipe com o código secreto (vazio = remove). */
  staff(s, m) {
    const code = String(m.code || '').slice(0, 80), tag = code ? staffTag(code) : '';
    if (code && !tag) throw E('Código inválido.');
    s.tag = tag || s.dbTag || ''; const h = hub.get(s.pid); if (h) { h.tag = tag; hubSend(s.pid, { push: 'hub', t: 'join', p: h }); }
    const r = s.roomId && rooms.get(s.roomId); if (r) pushRoom(r);
    return { tag };
  },
  /* Sistema de códigos: cada conta resgata cada código uma única vez. Os códigos ficam no SERVIDOR (segredo CODES, JSON: {"CODIGO":{"gold":500,"gems":10,"xp":0,"until":"2027-01-01"}}). */
  /* GERADOR DE CÓDIGOS — exclusivo DEV/ADM, validado AQUI no servidor (a tag vem da conta, nunca do cliente). */
  async codeGen(s, m) {
    needGen(s); await ensureCodeTables();
    const n = k => Math.max(0, Math.min(CAP, Math.floor(Number(m[k]) || 0))), gold = n('gold'), gems = n('gems'), xp = n('xp');
    if (!gold && !gems && !xp) throw E('Defina ao menos uma recompensa (moedas, diamantes ou XP).');
    const max = Math.max(0, Math.min(1000000, Math.floor(Number(m.maxUses) || 0)));
    let code = String(m.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
    if (!code) { const b = crypto.getRandomValues(new Uint8Array(8)); code = [...b].map(x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join(''); }
    if (code.length < 3) throw E('O código precisa ter pelo menos 3 caracteres.');
    if (CODES[code]) throw E('Esse código já existe.');
    const r = await ENV.DB.prepare('INSERT OR IGNORE INTO codes (code, gold, gems, xp, max_uses, used, by_name, at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)').bind(code, gold, gems, xp, max, s.name, Date.now()).run();
    if (!(r.meta && r.meta.changes)) throw E('Esse código já existe.');
    return { code, gold, gems, xp, maxUses: max };
  },
  async codeList(s) {
    needGen(s); await ensureCodeTables();
    const r = await ENV.DB.prepare('SELECT code, gold, gems, xp, max_uses, used, by_name FROM codes ORDER BY at DESC LIMIT 40').all();
    return { codes: (r.results || []).map(c => ({ code: c.code, gold: c.gold, gems: c.gems, xp: c.xp, maxUses: c.max_uses, used: c.used, by: c.by_name })) };
  },
  async codeDel(s, m) {
    needGen(s); await ensureCodeTables();
    await ENV.DB.prepare('DELETE FROM codes WHERE code = ?1').bind(String(m.code || '').toUpperCase().slice(0, 32)).run(); return {};
  },
  async redeem(s, m) {
    if (!s.account || !ENV.DB) throw E('Entre na sua conta para resgatar códigos.');
    const code = String(m.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32); if (!code) throw E('Digite um código.');
    const now = Date.now(); if ((s.rdT || 0) > now - 1500) throw E('Aguarde um instante.'); s.rdT = now;
    await ensureCodeTables();
    const row = await ENV.DB.prepare('SELECT gold, gems, xp, max_uses, used FROM codes WHERE code = ?1').bind(code).first();
    const def = row ? { gold: row.gold, gems: row.gems, xp: row.xp } : CODES[code]; if (!def || (def.until && now > Date.parse(def.until))) throw E('Código inválido ou expirado.');
    if (row && row.max_uses > 0 && row.used >= row.max_uses) throw E('Este código atingiu o limite de usos.');
    const ins = await ENV.DB.prepare('INSERT OR IGNORE INTO code_uses (uid, code, at) VALUES (?1, ?2, ?3)').bind(String(s.account.id), code, now).run();
    if (!(ins.meta && ins.meta.changes)) throw E('Você já resgatou este código.');
    if (row) { const up = await ENV.DB.prepare('UPDATE codes SET used = used + 1 WHERE code = ?1 AND (max_uses = 0 OR used < max_uses)').bind(code).run();
      if (!(up.meta && up.meta.changes)) { await ENV.DB.prepare('DELETE FROM code_uses WHERE uid = ?1 AND code = ?2').bind(String(s.account.id), code).run(); throw E('Este código atingiu o limite de usos.'); } }
    const g = { gold: Math.max(0, Math.min(CAP, def.gold | 0)), gems: Math.max(0, Math.min(CAP, def.gems | 0)), xp: Math.max(0, Math.min(CAP, def.xp | 0)) };
    sendTo(s.pid, { push: 'grant', gold: g.gold, gems: g.gems, xp: g.xp, src: 'Código' });
    return { reward: g };
  },
  hubJoin(s, m) {
    if (!hub.has(s.pid) && hub.size >= HUB_MAX) throw E('Lobby cheio.');
    const p = { id: s.pid, name: (s.acct ? s.name : clean(m.name, 16)) || s.name || 'Jogador', character: clean(m.character, 24) || 'felipedzn', x: hubX(m.x), f: m.f < 0 ? -1 : 1, mv: 0, tag: s.tag || '' };
    hub.set(s.pid, p); hubSend(s.pid, { push: 'hub', t: 'join', p }); return { players: [...hub.values()].filter(q => q.id !== s.pid) };
  },
  hubMove(s, m) { const p = hub.get(s.pid); if (!p) return {}; p.x = hubX(m.x); p.f = m.f < 0 ? -1 : 1; p.mv = m.mv ? 1 : 0; hubSend(s.pid, { push: 'hub', t: 'move', pid: s.pid, x: p.x, f: p.f, mv: p.mv }); return {}; },
  hubLeave(s) { hubLeave(s.pid); return {}; },
  chat(s, m) {
    const text = clean(m.text, 120).replace(/\s+/g, ' ').trim(); if (!text) throw E('Escreva uma mensagem.');
    if (text[0] === '/') return adminCmd(s, text).then(() => ({})).catch(e => { console.error(e); sysMsg(s, 'Erro ao executar o comando.'); return {}; });
    const now = Date.now(); if (now - (s.lastChat || 0) < 700) throw E('Calma! Espere um instante para enviar de novo.'); s.lastChat = now;
    const msg = { n: ++chatSeq, name: s.acct ? s.name : (clean(m.name, 16) || s.name), lv: Math.max(0, Math.min(999, m.lv | 0)), tag: s.tag || '', text, t: now };
    chatLog.push(msg); if (chatLog.length > 30) chatLog.shift(); broadcast({ push: 'chat', msg }); return {};
  },
  list: () => ({ rooms: listAll() }),
  async create(s, m) {
    if (s.roomId && rooms.has(s.roomId)) throw E('Você já está em uma sala.');
    const mode = m.mode == null ? null : String(m.mode), md = mode && MODES[mode]; if (mode && !md) throw E('Modo inválido.');
    const lo = md ? md.min : 2, hi = md ? md.max : MAX_PLAYERS, want = +m.maxPlayers || (md ? lo : MAX_PLAYERS);
    if (md && (want < lo || want > hi)) throw E('Este modo aceita de ' + lo + ' a ' + hi + ' jogadores.');
    const pw = m.password == null ? '' : String(m.password); if (pw && (pw.length < 3 || pw.length > 16)) throw E('A senha deve ter de 3 a 16 caracteres.');
    const map = m.map == null ? null : String(m.map); if (map && !MAPS.includes(map)) throw E('Mapa inválido.');
    const id = newId(), max = Math.min(Math.max(want, 2), MAX_PLAYERS), p = mkPlayer(s, m.player);
    s.name = p.name;
    const r = { id, name: clean(m.name, 24) || ('Sala de ' + p.name), hostId: s.pid, maxPlayers: max, players: [p], map, state: map ? 'READY' : 'WAITING', loaded: [], created: Date.now(), mode, minPlayers: md ? md.start : MIN_TO_START };
    
    if (md && md.bots) while (r.players.length < max) r.players.push({ id: 'bot' + rnd(4), name: 'Bot' + r.players.length, bot: true, character: 'felipedzn' });
    if (pw) { const salt = rnd(8); r.pw = { salt, hash: await pwHash(pw, salt) }; }
    rooms.set(id, r); s.roomId = id; log('sala', id, '"' + r.name + '" criada por', p.name, mode ? '[' + mode + ']' : '', r.pw ? '(com senha)' : ''); pushRoom(r); return { room: snapshot(r) };
  },
  async join(s, m) {
    const r = rooms.get(clean(m.room, 12)); if (!r || !humans(r).length) throw E('Sala não encontrada.');
    if (s.roomId === r.id && r.players.some(p => p.id === s.pid)) return { room: snapshot(r) };      // já está dentro (sem duplicar)
    if (s.roomId && rooms.has(s.roomId)) throw E('Você já está em uma sala.');
    if (!(await pwOk(r, m.password))) throw E(m.password ? 'Senha incorreta.' : 'Esta sala tem senha. Digite a senha para entrar.');
    if (r.players.length >= r.maxPlayers && r.mode && MODES[r.mode].bots) { const i = r.players.map(q => q.bot).lastIndexOf(true); if (i >= 0) r.players.splice(i, 1); }   // sala de bots: o humano ocupa o lugar de um bot
    if (r.players.length >= r.maxPlayers) throw E('Sala cheia.');
    const p = mkPlayer(s, m.player); s.name = p.name; r.players.push(p); s.roomId = r.id;
    log(p.name, 'entrou na sala', r.id, r.players.length + '/' + r.maxPlayers); pushRoom(r); return { room: snapshot(r) };
  },
  leave(s) { removeFromRoom(s.pid, 'saiu'); return {}; },
  beginMapSelection(s) { const r = need(s, true); inState(r, 'WAITING', 'READY'); r.state = 'MAP_SELECTION'; pushRoom(r); return { room: snapshot(r) }; },
  cancelMapSelection(s) { const r = need(s, true); inState(r, 'MAP_SELECTION'); r.state = r.map ? 'READY' : 'WAITING'; pushRoom(r); return { room: snapshot(r) }; },
  setMap(s, m) { const r = need(s, true); inState(r, 'MAP_SELECTION'); if (!MAPS.includes(m.map)) throw E('Mapa inválido.'); r.map = m.map; r.state = 'READY'; pushRoom(r); return { room: snapshot(r) }; },
  startGame(s) {
    const r = need(s, true); inState(r, 'READY'); if (!r.map) throw E('Escolha um mapa antes de iniciar.'); if (r.mode === '2v2') throw E('O modo 2v2 ainda não tem times na partida (em breve).'); if (r.players.length < (r.minPlayers || MIN_TO_START)) throw E('Jogadores insuficientes: mínimo ' + (r.minPlayers || MIN_TO_START) + '.');
    r.state = 'STARTING'; r.loaded = r.players.filter(p => p.bot).map(p => p.id); pushRoom(r); return { room: snapshot(r) };
  },
  markLoaded(s) { const r = need(s); inState(r, 'STARTING'); if (!r.loaded.includes(s.pid)) r.loaded.push(s.pid); checkLoaded(r); pushRoom(r); return { room: snapshot(r) }; },
  finishGame(s) { const r = need(s, true); inState(r, 'IN_GAME'); r.state = 'FINISHED'; pushRoom(r); return { room: snapshot(r) }; },
  resetRoom(s) { const r = need(s, true); inState(r, 'FINISHED'); r.state = r.map ? 'READY' : 'WAITING'; r.loaded = []; pushRoom(r); return { room: snapshot(r) }; },
  addBot(s) {
    const r = need(s, true); inState(r, 'WAITING', 'READY', 'MAP_SELECTION'); if (r.players.length >= r.maxPlayers) throw E('Sala cheia.');
    r.players.push({ id: 'bot' + rnd(4), name: 'Bot' + r.players.length, bot: true, character: 'felipedzn' }); pushRoom(r); return { room: snapshot(r) };
  },
  setCharacter(s, m) { const r = need(s); const p = r.players.find(x => x.id === s.pid); if (p) { p.character = clean(m.character, 24) || p.character; pushRoom(r); } return { room: snapshot(r) }; },
  ping: () => ({ t: Date.now() })
};

function relay(s, m) { // retransmite para os OUTROS jogadores da sala (nunca para quem enviou)
  const r = s.roomId && rooms.get(s.roomId); if (!r || m.data == null) return;
  const out = JSON.stringify({ push: 'relay', from: s.pid, data: m.data });
  for (const p of humans(r)) if (p.id !== s.pid) { const o = sessions.get(p.id); if (o && o.ws && o.ws.open) o.ws.send(out); }
}

function hello(ws, m, conn, acc, dbTag) {
    const pid = clean(m.pid, 40), tok = clean(m.token, 64);
    if (!/^[\w-]{8,40}$/.test(pid)) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Identificação inválida.' }));
    let s = sessions.get(pid);
    if (s && s.token !== tok && !acc) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Identificação já em uso.' }));
    if (!s) { s = { pid, token: rnd(16), name: clean(m.name, 16) || 'Player', ws: null, roomId: null, timer: null }; sessions.set(pid, s); }
    if (acc) { s.acct = true; s.account = acc; s.name = acc.name; if (tok !== s.token) s.token = rnd(16); } else if (s.acct) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Identificação já em uso.' }));
    if (s.ws && s.ws !== ws && s.ws.open) { const old = s.ws; old.onclose = null; clients.delete(old); old.send(JSON.stringify({ push: 'replaced' })); old.close(4000); }   // mesma identidade em outra aba/conexão: a nova assume
    clearTimeout(s.timer); s.timer = null; s.ws = ws; conn.s = s;
    s.dbTag = dbTag || ''; if (m.staff !== undefined || dbTag) s.tag = (m.staff !== undefined ? staffTag(m.staff) : '') || s.dbTag || s.tag || '';
    const r = s.roomId && rooms.get(s.roomId);
    if (s.roomId && !r) s.roomId = null;
    if (r) log(s.name, 'reconectou à sala', r.id);
    setTimeout(pushOnline, 0); return ws.send(JSON.stringify({ id: m.id, ok: true, pid, token: s.token, tag: s.tag || '', room: r ? snapshot(r) : null, rooms: listAll(), online: onlineCount(), chat: chatLog, server: { maxPlayers: MAX_PLAYERS, maps: MAPS } }));
}

function handle(ws, text, conn) {
  if (++conn.rate.n > 200) { conn.rate.drops++; if (conn.rate.drops > 400) ws.close(1008); return; }   // anti-flood (200 msgs/s)
  let m; try { m = JSON.parse(text); } catch (_) { return; } if (!m || typeof m !== 'object') return;
  if (m.op === 'hello') {
    if (m.auth) return authCheck(ENV, m.auth).catch(() => null).then(async acc => hello(ws, m, conn, acc, await loadTag(acc)));
    return hello(ws, m, conn, null);
  }
  const s = conn.s; if (!s) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Envie hello primeiro.' }));
  if (m.op === 'relay') return relay(s, m);
  const f = OPS[m.op]; if (!f) return ws.send(JSON.stringify({ id: m.id, ok: false, error: 'Operação desconhecida.' }));
  return Promise.resolve().then(() => f(s, m)).then(res => ws.send(JSON.stringify({ id: m.id, ok: true, ...res })))
    .catch(e => { if (!e.user) console.error(e); ws.send(JSON.stringify({ id: m.id, ok: false, error: e.user ? e.message : 'Erro interno.' })); });
}


/* ───────────────────────── Durable Object ───────────────────────── */
function accept(sock) {
  sock.accept();
  const ws = wrap(sock), conn = { s: null, rate: { n: 0, drops: 0 } };
  clients.add(ws);
  const tick = setInterval(() => { conn.rate.n = 0; }, 1000);
  ws.onmessage = t => handle(ws, t, conn);
  ws.onclose = () => { clearInterval(tick); clients.delete(ws); const s = conn.s; if (s && s.ws === ws) { s.ws = null; hubLeave(s.pid); disconnected(s); } setTimeout(pushOnline, 0); };
}
export class World extends DurableObject {
  constructor(ctx, env) { super(ctx, env); ENV = env; STAFF = parseStaff(env.STAFF_CODES); CODES = env.CODES ? parseCodes(env.CODES) : DEFAULT_CODES; }
  async fetch(request) {
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    accept(server);
    return new Response(null, { status: 101, webSocket: client });
  }
  stats() { return { ok: true, rooms: listAll().length, players: sessions.size, online: onlineCount() }; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      return env.WORLD.get(env.WORLD.idFromName('mundo')).fetch(request);
    }
    if (url.pathname === '/healthz') return Response.json(await env.WORLD.get(env.WORLD.idFromName('mundo')).stats(), { headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname.startsWith('/api/auth/')) return handleAuth(request, env, url);
    if (url.pathname.startsWith('/api/save')) return saveApi(request, env, url);
    return env.ASSETS.fetch(request);
  }
};
