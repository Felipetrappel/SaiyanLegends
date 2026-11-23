/* Contas do jogo (Cloudflare D1): cadastro, login, sessões e recuperação de senha. Rotas: /api/auth/{config,register,login,me,logout,recover}.
 *  - Senha: PBKDF2-SHA256 (100.000 voltas) com sal aleatório por usuário. A senha em texto NUNCA é guardada nem registrada.
 *  - Sessão: token aleatório de 256 bits; o banco guarda só o SHA-256 dele. Expira em 30 dias (lembrar conta) ou 2 dias.
 *  - Código de recuperação: mostrado uma única vez ao criar a conta (o banco guarda só o hash). Serve para redefinir a senha.
 *  - Limite de tentativas: erros de login/recuperação por IP+usuário e por IP bloqueiam por 10 minutos; criação de contas é limitada por IP. */
const enc = new TextEncoder();
const hex = u => [...new Uint8Array(u)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async t => hex(await crypto.subtle.digest('SHA-256', enc.encode(t)));
const ITER = 100000, DAY = 86400000, WINDOW = 600000;
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function hashPw(pw, saltHex, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: iter }, key, 256));
}
const pack = async pw => { const salt = rnd(16); return `pbkdf2$${ITER}$${salt}$${await hashPw(pw, salt)}`; };
async function check(pw, stored) { const [, it, salt, h] = String(stored).split('$'); return same(await hashPw(pw, salt, +it || ITER), h || ''); }
const DUMMY = 'pbkdf2$' + ITER + '$' + '00'.repeat(16) + '$' + '00'.repeat(32);

class Err extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
let ready = null;
const init = db => ready || (ready = db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, pw TEXT NOT NULL, rec TEXT NOT NULL, created INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS auth_sessions (th TEXT PRIMARY KEY, uid TEXT NOT NULL, exp INTEGER NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_uid ON auth_sessions (uid)'),
  db.prepare('CREATE TABLE IF NOT EXISTS auth_fail (k TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL)')
]).catch(e => { ready = null; throw e; }));

const blocked = async (db, k, max) => { const r = await db.prepare('SELECT n, t FROM auth_fail WHERE k = ?1').bind(k).first(); return !!r && Date.now() - r.t < WINDOW && r.n >= max; };
const hit = (db, k, win = WINDOW) => db.prepare('INSERT INTO auth_fail (k, n, t) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN ?2 - t > ?3 THEN 1 ELSE n + 1 END, t = CASE WHEN ?2 - t > ?3 THEN ?2 ELSE t END').bind(k, Date.now(), win).run();
const clear = (db, k) => db.prepare('DELETE FROM auth_fail WHERE k = ?1').bind(k).run();
const recCode = () => { const h = rnd(10).toUpperCase(); return h.match(/.{5}/g).join('-'); };
const cleanName = s => String(s == null ? '' : s).trim();

async function newSession(db, uid, remember) {
  const token = rnd(32), now = Date.now();
  await db.prepare('DELETE FROM auth_sessions WHERE exp < ?1').bind(now).run();
  await db.prepare('INSERT INTO auth_sessions (th, uid, exp) VALUES (?1, ?2, ?3)').bind(await sha(token), uid, now + (remember ? 30 : 2) * DAY).run();
  return token;
}
export async function authCheck(env, token) {
  if (!env.DB || !/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  await init(env.DB);
  const r = await env.DB.prepare('SELECT u.id AS id, u.name AS name FROM auth_sessions s JOIN users u ON u.id = s.uid WHERE s.th = ?1 AND s.exp > ?2').bind(await sha(token), Date.now()).first();
  return r ? { id: r.id, name: r.name } : null;
}
const out = (u, token, extra = {}) => ({ ok: true, token, id: u.id, pid: 'a' + u.id, name: u.name, ...extra });

const ROUTES = {
  async config() { return { ok: true, nameMin: 3, nameMax: 16, passMin: 6, passMax: 64 }; },
  async register(db, b, ip) {
    const name = cleanName(b.name), pw = String(b.password || '');
    if (!name || !pw) throw new Err(400, 'empty', 'Preencha todos os campos.');
    if (!NAME_RE.test(name)) throw new Err(400, 'bad_name', 'Usuário: 3 a 16 letras, números ou _.');
    if (pw.length < 6 || pw.length > 64) throw new Err(400, 'bad_pass', 'A senha deve ter de 6 a 64 caracteres.');
    if (await blocked(db, 'reg|' + ip, 8)) throw new Err(429, 'too_many', 'Muitas contas criadas deste aparelho. Tente mais tarde.');
    const lc = name.toLowerCase();
    if (await db.prepare('SELECT 1 FROM users WHERE name_lc = ?1').bind(lc).first()) throw new Err(409, 'name_taken', 'Esse usuário já está cadastrado.');
    const id = rnd(8), rec = recCode();
    try { await db.prepare('INSERT INTO users (id, name, name_lc, pw, rec, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, name, lc, await pack(pw), await sha(rec.replace(/-/g, '')), Date.now()).run(); }
    catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw new Err(409, 'name_taken', 'Esse usuário já está cadastrado.'); throw e; }
    await hit(db, 'reg|' + ip, 3600000);
    return out({ id, name }, await newSession(db, id, !!b.remember), { recovery: rec });
  },
  async login(db, b, ip) {
    const name = cleanName(b.name), pw = String(b.password || '');
    if (!name || !pw) throw new Err(400, 'empty', 'Preencha todos os campos.');
    const lc = name.toLowerCase().slice(0, 32), k1 = ip + '|' + lc, k2 = ip + '|*';
    if (await blocked(db, k1, 6) || await blocked(db, k2, 30)) throw new Err(429, 'too_many', 'Muitas tentativas. Aguarde 10 minutos.');
    const u = await db.prepare('SELECT id, name, pw FROM users WHERE name_lc = ?1').bind(lc).first();
    const ok = await check(pw.slice(0, 200), u ? u.pw : DUMMY);
    if (!u || !ok) { await hit(db, k1); await hit(db, k2); throw new Err(401, 'bad_login', 'Usuário ou senha incorretos.'); }
    await clear(db, k1);
    return out(u, await newSession(db, u.id, !!b.remember));
  },
  async me(db, b, ip, env) { const u = await authCheck(env, b.token); if (!u) throw new Err(401, 'session', 'Sessão expirada. Entre novamente.'); return out(u, b.token); },
  async logout(db, b) { if (/^[a-f0-9]{64}$/.test(String(b.token || ''))) await db.prepare('DELETE FROM auth_sessions WHERE th = ?1').bind(await sha(b.token)).run(); return { ok: true }; },
  async recover(db, b, ip) {
    const name = cleanName(b.name), code = String(b.recovery || '').replace(/[\s-]/g, '').toUpperCase(), pw = String(b.password || '');
    if (!name || !code || !pw) throw new Err(400, 'empty', 'Preencha todos os campos.');
    if (pw.length < 6 || pw.length > 64) throw new Err(400, 'bad_pass', 'A senha deve ter de 6 a 64 caracteres.');
    const lc = name.toLowerCase().slice(0, 32), k1 = ip + '|r|' + lc, k2 = ip + '|r*';
    if (await blocked(db, k1, 5) || await blocked(db, k2, 20)) throw new Err(429, 'too_many', 'Muitas tentativas. Aguarde 10 minutos.');
    const u = await db.prepare('SELECT id, name, rec FROM users WHERE name_lc = ?1').bind(lc).first();
    if (!u || !same(await sha(code), u.rec)) { await hit(db, k1); await hit(db, k2); throw new Err(401, 'bad_recovery', 'Usuário ou código de recuperação incorretos.'); }
    const rec = recCode();
    await db.prepare('UPDATE users SET pw = ?1, rec = ?2 WHERE id = ?3').bind(await pack(pw), await sha(rec.replace(/-/g, '')), u.id).run();
    await db.prepare('DELETE FROM auth_sessions WHERE uid = ?1').bind(u.id).run(); await clear(db, k1);
    return out(u, await newSession(db, u.id, !!b.remember), { recovery: rec });
  }
};

export async function handleAuth(request, env, url) {
  const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  const send = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
  try {
    const name = url.pathname.replace(/^\/api\/auth\//, '').replace(/\/$/, ''), f = ROUTES[name];
    if (!f) return send({ ok: false, code: 'nf', error: 'Rota desconhecida.' }, 404);
    if (!env.DB) return send({ ok: false, code: 'nodb', error: 'Banco de dados indisponível.' }, 503);
    if (name === 'config') return send(await f());
    if (request.method !== 'POST') return send({ ok: false, code: 'method', error: 'Use POST.' }, 405);
    const txt = await request.text(); if (txt.length > 2048) return send({ ok: false, code: 'big', error: 'Pedido grande demais.' }, 413);
    let b; try { b = JSON.parse(txt || '{}'); } catch (_) { return send({ ok: false, code: 'json', error: 'Pedido inválido.' }, 400); }
    if (!b || typeof b !== 'object') return send({ ok: false, code: 'json', error: 'Pedido inválido.' }, 400);
    await init(env.DB);
    return send(await f(env.DB, b, request.headers.get('cf-connecting-ip') || 'local', env));
  } catch (e) {
    if (e instanceof Err) return send({ ok: false, code: e.code, error: e.message }, e.status);
    console.error('auth', e && e.message); return send({ ok: false, code: 'server', error: 'Erro no servidor. Tente de novo.' }, 500);
  }
}
