/* Contas do Saiyan Legends: cadastro com NOME e SENHA, login e sessão por token. Sem e-mail. Sem dependências (só Node >= 18).
 *   REQUIRE_LOGIN=1          exige conta para jogar online (sem isso, o jogo continua aberto como antes)
 *   STORE=file | supabase    onde guardar as contas (file = arquivo; no Render grátis o arquivo some quando reinicia!)
 *     supabase: SUPABASE_URL + SUPABASE_KEY (service_role) — tabela sl_users (id text primary key, data jsonb)
 *   DATA_DIR=./data          pasta do arquivo de contas (STORE=file)
 * Segurança: senhas com scrypt + sal; tokens guardados só como hash; limites de cadastro por IP e de tentativas de senha. */
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const ENV = process.env, REQUIRED = ENV.REQUIRE_LOGIN === '1';
const SESSION_TTL = 30 * 864e5, MAX_SESSIONS = 8;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const E = (m, status = 400) => { const e = new Error(m); e.user = true; e.status = status; return e; };

/* ───────── nome de usuário → identidade única (não diferencia maiúsculas de minúsculas) ───────── */
const validName = n => /^[A-Za-z0-9_.-]{3,16}$/.test(String(n || '').trim()) ? String(n).trim() : null;
const userId = name => 'a' + sha(name.toLowerCase()).slice(0, 15);

/* ───────── armazenamento ───────── */
function makeStore() {
  if (ENV.STORE === 'supabase') {
    const base = (ENV.SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1/sl_users', H = { apikey: ENV.SUPABASE_KEY || '', authorization: 'Bearer ' + (ENV.SUPABASE_KEY || ''), 'content-type': 'application/json' };
    return {
      name: 'supabase',
      async get(id) { const r = await fetch(base + '?id=eq.' + encodeURIComponent(id) + '&select=data', { headers: H }); if (!r.ok) throw new Error('Supabase ' + r.status); const a = await r.json(); return a[0] ? a[0].data : null; },
      async put(id, data) { const r = await fetch(base + '?on_conflict=id', { method: 'POST', headers: { ...H, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, data }) }); if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 100)); }
    };
  }
  const dir = path.resolve(ENV.DATA_DIR || path.join(__dirname, '..', 'data')), file = path.join(dir, 'users.json'); let db = {}, q = Promise.resolve();
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  return {
    name: 'file', async get(id) { return db[id] || null; },
    async put(id, data) { db[id] = data; q = q.then(() => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); }).catch(() => {}); return q; }
  };
}

/* ───────── senhas ───────── */
const hashPw = pw => new Promise((res, rej) => { const salt = crypto.randomBytes(16); crypto.scrypt(pw, salt, 32, (e, k) => e ? rej(e) : res('s1:' + salt.toString('hex') + ':' + k.toString('hex'))); });
const checkPw = (pw, h) => new Promise(res => { const [v, s, k] = String(h || '').split(':'); if (v !== 's1') return res(false);
  crypto.scrypt(pw, Buffer.from(s, 'hex'), 32, (e, d) => res(!e && crypto.timingSafeEqual(d, Buffer.from(k, 'hex')))); });

/* ───────── limites ───────── */
const hits = new Map();   // chave → [timestamps]
function limit(key, max, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); if (a.length >= max) { hits.set(key, a); return false; } a.push(now); hits.set(key, a); return true; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 36e5)) hits.delete(k); }, 6e4).unref();

function create(log = console.log) {
  const store = makeStore();
  if (REQUIRED) log('contas: login obrigatório · armazenamento=' + store.name + (store.name === 'file' ? ' (ATENÇÃO: no Render grátis o arquivo some ao reiniciar; use STORE=supabase)' : ''));
  const validPw = p => typeof p === 'string' && p.length >= 8 && p.length <= 64;
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
      if (!validPw(b.password)) throw E('A senha precisa ter de 8 a 64 caracteres.');
      if (!limit('reg:' + ip, 10, 36e5)) throw E('Muitos cadastros deste aparelho. Tente mais tarde.', 429);
      const id = userId(name); if (await store.get(id)) throw E('Esse nome já está em uso. Escolha outro.');
      const u = { id, name, pw: await hashPw(b.password), created: Date.now(), sessions: [] };
      return pub(u, await newSession(u));
    },
    async login(b, ip) {
      const name = validName(b.name), bad = () => E('Nome ou senha incorretos.', 401);
      if (!name || typeof b.password !== 'string') throw bad(); const id = userId(name);
      if (!limit('lf:' + id, 8, 15 * 60e3) || !limit('lfip:' + ip, 30, 15 * 60e3)) throw E('Muitas tentativas. Espere alguns minutos.', 429);
      const u = await store.get(id), ok = await checkPw(b.password, u ? u.pw : 's1:' + '00'.repeat(16) + ':' + '00'.repeat(32)); if (!u || !ok) throw bad();
      return pub(u, await newSession(u));
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
    if (name === 'config' && req.method === 'GET') { send(200, { required: REQUIRED }); return true; }
    const f = routes[name]; if (!f || req.method !== 'POST') { send(404, { ok: false, error: 'Não encontrado.' }); return true; }
    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?'); let raw = '';
    req.on('data', d => { raw += d; if (raw.length > 4096) req.destroy(); });
    req.on('end', async () => {
      let b; try { b = JSON.parse(raw || '{}'); } catch (_) { return send(400, { ok: false, error: 'Pedido inválido.' }); }
      try { send(200, await f(b && typeof b === 'object' ? b : {}, ip)); }
      catch (e) { if (!e.user) log('erro auth:', e.message); send(e.user ? e.status : 500, { ok: false, error: e.user ? e.message : 'Erro interno. Tente de novo.' }); }
    });
    return true;
  }
  return { required: REQUIRED, http, verify };
}
module.exports = { create };
