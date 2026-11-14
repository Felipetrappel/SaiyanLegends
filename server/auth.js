/* Contas do Saiyan Legends: cadastro com NOME e SENHA, login e sessão por token. Sem e-mail. Sem dependências (só Node >= 18).
 *   REQUIRE_LOGIN=1          exige conta para jogar online (sem isso, o jogo continua aberto como antes)
 *   DATABASE_URL=postgres://… (Render PostgreSQL) → contas E progresso ficam no Postgres (persistente). Tem prioridade sobre STORE.
 *   STORE=file | supabase    (legado) onde guardar as contas (file = arquivo; no Render grátis o arquivo some quando reinicia!)
 *     supabase: SUPABASE_URL + SUPABASE_KEY (service_role) — tabela sl_users (id text primary key, data jsonb)
 *   DATA_DIR=./data          pasta do arquivo de contas (STORE=file)
 * Segurança: senhas com scrypt + sal; tokens guardados só como hash; limites de cadastro por IP e de tentativas de senha. */
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const DB = require('./db');

const ENV = process.env, REQUIRED = ENV.REQUIRE_LOGIN === '1';
const SESSION_TTL = 30 * 864e5, MAX_SESSIONS = 8;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const E = (m, status = 400) => { const e = new Error(m); e.user = true; e.status = status; return e; };

/* ───────── nome de usuário → identidade única (não diferencia maiúsculas de minúsculas) ───────── */
const validName = n => /^[A-Za-z0-9_.-]{3,16}$/.test(String(n || '').trim()) ? String(n).trim() : null;
const userId = name => 'a' + sha(name.toLowerCase()).slice(0, 15);

/* ───────── armazenamento ───────── */
/* Armazenamento "em bloco" (arquivo / Supabase): o progresso fica dentro do registro da conta (u.prog = { rev, progress }). */
function blobProgress(s) {
  return {
    ...s,
    async create(id, u) { if (await s.get(id)) return false; await s.put(id, u); return true; },
    async getProgress(id) { const u = await s.get(id); return u && u.prog ? { rev: u.prog.rev, progress: u.prog.progress } : null; },
    async putProgress(id, prog, baseRev) {
      const u = await s.get(id); if (!u) return { ok: false, conflict: true, current: null };
      const cur = u.prog ? u.prog.rev : 0; if ((baseRev || 0) !== cur) return { ok: false, conflict: true, current: await s.getProgress(id) };
      u.prog = { rev: cur + 1, progress: prog }; await s.put(id, u); return { ok: true, rev: cur + 1 };
    }
  };
}
function makeStore(log) {
  if (ENV.DATABASE_URL) {
    try { return DB.connect(ENV, log); }
    catch (e) { log('ERRO: DATABASE_URL definida mas o banco não pôde ser usado —', e.message);
      const down = async () => { throw new Error('banco indisponível'); }; return { name: 'postgres (INDISPONÍVEL)', get: down, put: down, create: down, getProgress: down, putProgress: down }; }
  }
  if (ENV.STORE === 'supabase') {
    const base = (ENV.SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1/sl_users', H = { apikey: ENV.SUPABASE_KEY || '', authorization: 'Bearer ' + (ENV.SUPABASE_KEY || ''), 'content-type': 'application/json' };
    return blobProgress({
      name: 'supabase',
      async get(id) { const r = await fetch(base + '?id=eq.' + encodeURIComponent(id) + '&select=data', { headers: H }); if (!r.ok) throw new Error('Supabase ' + r.status); const a = await r.json(); return a[0] ? a[0].data : null; },
      async put(id, data) { const r = await fetch(base + '?on_conflict=id', { method: 'POST', headers: { ...H, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, data }) }); if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 100)); }
    });
  }
  const dir = path.resolve(ENV.DATA_DIR || path.join(__dirname, '..', 'data')), file = path.join(dir, 'users.json'); let db = {}, q = Promise.resolve();
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  return blobProgress({
    name: 'file', async get(id) { return db[id] || null; },
    async put(id, data) { db[id] = data; q = q.then(() => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); }).catch(() => {}); return q; }
  });
}

/* ───────── senhas ───────── */
const hashPw = pw => new Promise((res, rej) => { const salt = crypto.randomBytes(16); crypto.scrypt(pw, salt, 32, (e, k) => e ? rej(e) : res('s1:' + salt.toString('hex') + ':' + k.toString('hex'))); });
const checkPw = (pw, h) => new Promise(res => { const [v, s, k] = String(h || '').split(':'); if (v !== 's1') return res(false);
  crypto.scrypt(pw, Buffer.from(s, 'hex'), 32, (e, d) => res(!e && crypto.timingSafeEqual(d, Buffer.from(k, 'hex')))); });

/* ───────── limites ───────── */
const hits = new Map();   // chave → [timestamps]
function limit(key, max, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); if (a.length >= max) { hits.set(key, a); return false; } a.push(now); hits.set(key, a); return true; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 36e5)) hits.delete(k); }, 6e4).unref();

/* ───────── progresso do jogador: validação (o servidor nunca grava lixo, e cada conta só mexe no PRÓPRIO progresso) ───────── */
const ID_RE = /^[a-z0-9_]{1,24}$/, BAD_ID = new Set(['__proto__', 'constructor', 'prototype']), idOk = x => typeof x === 'string' && ID_RE.test(x) && !BAD_ID.has(x), MAXN = 1e9;
const num = v => Number.isFinite(+v) ? Math.min(MAXN, Math.max(0, Math.floor(+v))) : 0;
function plain(v, depth = 0) {   // JSON "limpo": só objetos simples/arrays/números/textos/booleanos; sem __proto__
  if (v === null || typeof v === 'boolean') return v; if (typeof v === 'number') return Number.isFinite(v) ? v : 0; if (typeof v === 'string') return v.slice(0, 200);
  if (depth > 4) return null;
  if (Array.isArray(v)) return v.slice(0, 64).map(x => plain(x, depth + 1));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).slice(0, 64)) if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && /^[\w .:-]{1,40}$/.test(k)) o[k] = plain(v[k], depth + 1); return o; }
  return null;
}
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? plain(v) : {}), arr = v => (Array.isArray(v) ? plain(v) : []);
function cleanProgress(b) {
  if (!b || typeof b !== 'object') throw E('Dados inválidos.');
  const xp = num(b.xp), p = {
    gold: num(b.gold), silver: num(b.silver), gems: num(b.gems), xp, level: Math.floor(Math.sqrt(xp / 100)),   // nível sempre derivado do XP
    selected: idOk(b.selected) ? b.selected : '', picked: !!b.picked, welcomed: !!b.welcomed,
    unlocked: [...new Set((Array.isArray(b.unlocked) ? b.unlocked : []).filter(idOk))].slice(0, 64),
    stats: obj(b.stats), upgrades: obj(b.upgrades), forms: arr(b.forms), techniques: arr(b.techniques), settings: obj(b.settings),
    missions: { mp: obj(b.mp || (b.missions && b.missions.mp)), md: obj(b.md || (b.missions && b.missions.md)) }
  };
  if (JSON.stringify(p).length > 24000) throw E('Dados grandes demais.', 413);
  return p;
}

function create(log = console.log) {
  const store = makeStore(log);
  if (REQUIRED) log('contas: login obrigatório · armazenamento=' + store.name + (store.name === 'file' ? ' (ATENÇÃO: no Render o arquivo some ao reiniciar; configure DATABASE_URL com um PostgreSQL)' : ''));
  const validPw = p => typeof p === 'string' && p.length >= 5 && p.length <= 64;
  async function newSession(u) {
    const secret = crypto.randomBytes(24).toString('hex'); u.sessions = (u.sessions || []).filter(s => s.exp > Date.now()).slice(-(MAX_SESSIONS - 1)); u.sessions.push({ h: sha(secret), exp: Date.now() + SESSION_TTL });
    await store.put(u.id, u); return u.id + '.' + secret;
  }
  async function verify(token) {
    const [id, secret] = String(token || '').split('.'); if (!/^a[0-9a-f]{15}$/.test(id || '') || !secret) return null;
    const u = await store.get(id); if (!u) return null; const h = sha(secret);
    return (u.sessions || []).some(s => s.h === h && s.exp > Date.now()) ? { pid: u.id, name: u.name } : null;
  }
  const pub = (u, token) => ({ ok: true, token, pid: u.id, name: u.name });

  const routes = {
    async register(b, ip) {
      const name = validName(b.name); if (!name) throw E('Nome: 3 a 16 letras, números, _ . ou - (sem espaços).');
      if (!validPw(b.password)) throw E('A senha precisa ter pelo menos 5 caracteres.');
      if (!limit('reg:' + ip, 10, 36e5)) throw E('Muitos cadastros deste aparelho. Tente mais tarde.', 429);
      const id = userId(name), u = { id, name, pw: await hashPw(b.password), created: Date.now(), sessions: [] };
      if (!(await store.create(id, u))) throw E('Esse nome já está em uso. Escolha outro.');   // atômico: dois cadastros iguais ao mesmo tempo → só um passa
      return pub(u, await newSession(u));
    },
    async login(b, ip) {
      const name = validName(b.name), bad = () => E('Nome ou senha incorretos.', 401);
      if (!name || typeof b.password !== 'string') throw bad(); const id = userId(name);
      if (!limit('lf:' + id, 8, 15 * 60e3) || !limit('lfip:' + ip, 30, 15 * 60e3)) throw E('Muitas tentativas. Espere alguns minutos.', 429);
      const u = await store.get(id), ok = await checkPw(b.password, u ? u.pw : 's1:' + '00'.repeat(16) + ':' + '00'.repeat(32)); if (!u || !ok) throw bad();
      return pub(u, await newSession(u));
    },
    /* progresso: sempre da conta dona do token (o id vem do token, nunca do pedido) */
    async profile(b) {
      const u = await verify(b.token); if (!u) throw E('Sessão expirada. Entre de novo.', 401);
      const r = await store.getProgress(u.pid); return r ? { ok: true, exists: true, rev: r.rev, progress: r.progress } : { ok: true, exists: false, rev: 0 };
    },
    async save(b) {
      const u = await verify(b.token); if (!u) throw E('Sessão expirada. Entre de novo.', 401);
      if (!limit('sv:' + u.pid, 120, 60e3)) throw E('Salvando rápido demais. Aguarde um instante.', 429);
      const rev = Number.isInteger(b.rev) && b.rev >= 0 ? b.rev : 0, r = await store.putProgress(u.pid, cleanProgress(b.progress), rev);
      return r.ok ? { ok: true, rev: r.rev } : { ok: false, conflict: true, rev: r.current ? r.current.rev : 0, progress: r.current ? r.current.progress : null, error: 'Seu progresso foi alterado em outro aparelho.' };
    },
    async me(b) { const u = await verify(b.token); if (!u) throw E('Sessão expirada. Entre de novo.', 401); return { ok: true, ...u }; },
    async logout(b) {
      const [id, secret] = String(b.token || '').split('.'); if (!/^a[0-9a-f]{15}$/.test(id || '') || !secret) return { ok: true };
      const u = await store.get(id); if (u) { const h = sha(secret); u.sessions = (u.sessions || []).filter(s => s.h !== h); await store.put(id, u); } return { ok: true };
    }
  };

  /* HTTP: devolve true se tratou a requisição (/api/auth/*) */
  function http(req, res, pathname) {
    if (!pathname.startsWith('/api/auth/')) return false;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'cache-control': 'no-store' };
    const send = (st, o) => { res.writeHead(st, { 'content-type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(o)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    const name = pathname.slice(10);
    if (name === 'config' && req.method === 'GET') { send(200, { required: REQUIRED, store: store.name }); return true; }
    const f = routes[name]; if (!f || req.method !== 'POST') { send(404, { ok: false, error: 'Não encontrado.' }); return true; }
    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?'); let raw = '';
    req.on('data', d => { raw += d; if (raw.length > 32768) req.destroy(); });
    req.on('end', async () => {
      let b; try { b = JSON.parse(raw || '{}'); } catch (_) { return send(400, { ok: false, error: 'Pedido inválido.' }); }
      try { const out = await f(b && typeof b === 'object' ? b : {}, ip); send(out && out.conflict ? 409 : 200, out); }
      catch (e) { if (!e.user) log('erro auth:', e.message); send(e.user ? e.status : 500, { ok: false, error: e.user ? e.message : 'Erro interno. Tente de novo.' }); }
    });
    return true;
  }
  return { required: REQUIRED, http, verify };
}
module.exports = { create };
